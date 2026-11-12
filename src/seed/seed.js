import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Payroll from '../models/Payroll.js';
import { calculatePayroll } from '../services/payrollService.js';
import { todayStr, addDays, weekdays } from '../utils/date.js';

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pad = (n) => String(n).padStart(2, '0');

const run = async () => {
  await connectDB();
  await Promise.all([User, Department, Attendance, Leave, Payroll].map((m) => m.deleteMany({})));

  const [eng, hr, sales, fin] = await Department.insertMany([
    { name: 'Engineering', description: 'Product development' },
    { name: 'Human Resources', description: 'People operations' },
    { name: 'Sales', description: 'Revenue and growth' },
    { name: 'Finance', description: 'Accounts and budgeting' },
  ]);

  const sal = (basic) => ({ basic, hra: Math.round(basic * 0.4), allowances: Math.round(basic * 0.2) });
  const base = { joiningDate: '2025-01-06' };
  const people = [
    { employeeId: 'EMP001', name: 'Aarav Admin', email: 'admin@hrms.com', password: 'Admin@123', role: 'admin', department: hr._id, designation: 'System Administrator', salary: sal(60000) },
    { employeeId: 'EMP002', name: 'Hema HR', email: 'hr@hrms.com', password: 'Hr@12345', role: 'hr', department: hr._id, designation: 'HR Manager', salary: sal(45000) },
    { employeeId: 'EMP003', name: 'Ravi Kumar', email: 'ravi@hrms.com', department: eng._id, designation: 'Senior Developer', salary: sal(55000) },
    { employeeId: 'EMP004', name: 'Sneha Reddy', email: 'sneha@hrms.com', department: eng._id, designation: 'Frontend Developer', salary: sal(40000) },
    { employeeId: 'EMP005', name: 'Kiran Rao', email: 'kiran@hrms.com', department: sales._id, designation: 'Sales Executive', salary: sal(30000) },
    { employeeId: 'EMP006', name: 'Priya Sharma', email: 'priya@hrms.com', department: fin._id, designation: 'Accountant', salary: sal(35000) },
    { employeeId: 'EMP007', name: 'Arjun Mehta', email: 'arjun@hrms.com', department: eng._id, designation: 'QA Engineer', salary: sal(32000) },
    { employeeId: 'EMP008', name: 'Divya Nair', email: 'divya@hrms.com', department: sales._id, designation: 'Sales Manager', salary: sal(48000) },
  ].map((p) => ({ password: 'Emp@12345', role: 'employee', ...base, ...p }));

  const users = [];
  for (const p of people) users.push(await User.create(p)); // create() so passwords are hashed
  await Department.updateOne({ _id: eng._id }, { head: users[2]._id });

  const today = todayStr();
  const days = weekdays(addDays(today, -75), addDays(today, -1));
  const records = [];
  for (const u of users) {
    for (const date of days) {
      const roll = rnd(1, 100);
      if (roll > 94) continue; // absent
      const inH = roll > 85 ? 9 : 9, inM = roll > 85 ? rnd(46, 59) : rnd(0, 40);
      const checkIn = new Date(`${date}T${pad(inH)}:${pad(inM)}:00+05:30`);
      const half = roll > 91;
      const checkOut = new Date(checkIn.getTime() + (half ? rnd(3, 3.9) : rnd(8, 9)) * 36e5);
      records.push({
        user: u._id, date, checkIn, checkOut,
        workHours: Math.round(((checkOut - checkIn) / 36e5) * 100) / 100,
        status: half ? 'half-day' : roll > 85 ? 'late' : 'present',
      });
    }
  }
  await Attendance.insertMany(records);

  // Leaves: two approved (past), one pending (upcoming), one rejected
  const mkLeave = async (u, type, s, e, status, reason) => {
    const ds = weekdays(s, e);
    const leave = await Leave.create({ user: u._id, type, startDate: s, endDate: e, days: ds.length, reason, status, reviewedBy: status === 'pending' ? undefined : users[1]._id, reviewedAt: status === 'pending' ? undefined : new Date() });
    if (status === 'approved') {
      await User.updateOne({ _id: u._id }, { $inc: { [`leaveBalance.${type}`]: -ds.length } });
      await Attendance.deleteMany({ user: u._id, date: { $in: ds } });
      await Attendance.insertMany(ds.map((date) => ({ user: u._id, date, status: 'on-leave', note: `${type} leave` })));
    }
    return leave;
  };
  await mkLeave(users[3], 'casual', addDays(today, -30), addDays(today, -29), 'approved', 'Family function');
  await mkLeave(users[4], 'sick', addDays(today, -20), addDays(today, -19), 'approved', 'Fever');
  await mkLeave(users[5], 'earned', addDays(today, 7), addDays(today, 9), 'pending', 'Short vacation');
  await mkLeave(users[6], 'casual', addDays(today, -10), addDays(today, -10), 'rejected', 'Personal work');

  // Payroll for the previous month
  const [y, m] = today.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  for (const u of users) await Payroll.create({ ...(await calculatePayroll(u, prev)), status: 'paid', paidAt: new Date() });

  console.log('Seed complete.\n  admin@hrms.com / Admin@123\n  hr@hrms.com    / Hr@12345\n  ravi@hrms.com  / Emp@12345  (any employee)');
  await mongoose.disconnect();
};
run().catch((e) => { console.error(e); process.exit(1); });
