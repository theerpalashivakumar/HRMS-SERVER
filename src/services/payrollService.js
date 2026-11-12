import PDFDocument from 'pdfkit';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import ApiError from '../utils/ApiError.js';
import { PAID_LEAVE_TYPES } from '../config/constants.js';
import { todayStr, monthRange, weekdays, isWeekend, round2 } from '../utils/date.js';

const PF_RATE = 0.12;
const PT_THRESHOLD = 15000;
const PT_AMOUNT = 200;

/**
 * Payroll rules:
 *  - Working days = Mon-Fri. Per-day pay = monthly gross / working days in month.
 *  - Paid days = present + late + 0.5*half-day + approved paid leave (not already attended).
 *  - Unpaid days (absent / unpaid leave) among elapsed working days are deducted.
 *  - PF = 12% of basic; Professional tax = flat 200 if gross >= 15000.
 */
export const calculatePayroll = async (user, month) => {
  const { start, end } = monthRange(month);
  const today = todayStr();
  if (start > today) throw new ApiError(400, 'Cannot generate payroll for a future month');

  const from = user.joiningDate > start ? user.joiningDate : start;
  const to = end < today ? end : today;
  const monthDays = weekdays(start, end).length;
  const eligibleDays = weekdays(from, end).length;
  const elapsedDays = weekdays(from, to).length;

  const [records, leaves] = await Promise.all([
    Attendance.find({ user: user._id, date: { $gte: from, $lte: to } }).lean(),
    Leave.find({ user: user._id, status: 'approved', startDate: { $lte: to }, endDate: { $gte: from } }).lean(),
  ]);

  const attended = new Map();
  records.forEach((r) => {
    if (isWeekend(r.date)) return;
    if (r.status === 'present' || r.status === 'late') attended.set(r.date, 1);
    else if (r.status === 'half-day') attended.set(r.date, 0.5);
  });
  const presentDays = [...attended.values()].reduce((a, b) => a + b, 0);

  const paidLeave = new Set();
  leaves.filter((l) => PAID_LEAVE_TYPES.includes(l.type)).forEach((l) => {
    weekdays(l.startDate > from ? l.startDate : from, l.endDate < to ? l.endDate : to)
      .forEach((d) => { if (!attended.has(d)) paidLeave.add(d); });
  });

  const paidDays = Math.min(elapsedDays, presentDays + paidLeave.size);
  const unpaidDays = round2(elapsedDays - paidDays);

  const { basic = 0, hra = 0, allowances = 0 } = user.salary || {};
  const monthlyGross = basic + hra + allowances;
  const perDay = monthDays ? monthlyGross / monthDays : 0;
  const grossEarned = round2(perDay * eligibleDays);
  const absentDeduction = round2(perDay * unpaidDays);
  const pf = round2(basic * PF_RATE * (monthDays ? eligibleDays / monthDays : 0));
  const professionalTax = monthlyGross >= PT_THRESHOLD ? PT_AMOUNT : 0;
  const netSalary = Math.max(0, round2(grossEarned - absentDeduction - pf - professionalTax));

  return {
    user: user._id, month, basic, hra, allowances, grossEarned,
    monthWorkingDays: monthDays, elapsedDays, presentDays, paidLeaveDays: paidLeave.size,
    unpaidDays, absentDeduction, pf, professionalTax, netSalary,
  };
};

export const streamPayslipPdf = (p, res) => {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${p.user.employeeId}-${p.month}.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).text('PAYSLIP', { align: 'center' });
  doc.fontSize(11).fillColor('#555').text(`For the month of ${p.month}`, { align: 'center' }).moveDown(1.5);
  doc.fillColor('#000').fontSize(12);
  doc.text(`Employee: ${p.user.name} (${p.user.employeeId})`);
  doc.text(`Department: ${p.user.department?.name || '-'}    Designation: ${p.user.designation || '-'}`);
  doc.text(`Status: ${p.status.toUpperCase()}`).moveDown();

  const row = (label, value, bold = false) => {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, 50, y).text(String(value), 350, y, { width: 190, align: 'right' });
    doc.moveDown(0.4);
  };
  const section = (t) => { doc.moveDown(0.5).font('Helvetica-Bold').fontSize(13).text(t, 50).moveDown(0.3).fontSize(12); };

  section('Attendance');
  row('Working days in month', p.monthWorkingDays);
  row('Days present', p.presentDays);
  row('Paid leave days', p.paidLeaveDays);
  row('Unpaid days', p.unpaidDays);
  section('Earnings');
  row('Basic', `Rs. ${p.basic}`); row('HRA', `Rs. ${p.hra}`); row('Allowances', `Rs. ${p.allowances}`);
  row('Gross earned', `Rs. ${p.grossEarned}`, true);
  section('Deductions');
  row('Absence deduction', `Rs. ${p.absentDeduction}`); row('Provident Fund (12% of basic)', `Rs. ${p.pf}`);
  row('Professional tax', `Rs. ${p.professionalTax}`);
  doc.moveDown();
  doc.fontSize(14);
  row('NET SALARY', `Rs. ${p.netSalary}`, true);
  doc.end();
};
