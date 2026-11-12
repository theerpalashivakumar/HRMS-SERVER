import User from '../models/User.js';
import Department from '../models/Department.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Payroll from '../models/Payroll.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import { MANAGERS } from '../config/constants.js';
import { todayStr, addDays, isWeekend, currentMonth, monthRange } from '../utils/date.js';

const PRESENT = ['present', 'late', 'half-day'];

const managerStats = async () => {
  const today = todayStr();
  const [totalEmployees, departments, pendingLeaves, presentToday, onLeaveToday, deptAgg] = await Promise.all([
    User.countDocuments({ status: 'active' }),
    Department.countDocuments(),
    Leave.countDocuments({ status: 'pending' }),
    Attendance.countDocuments({ date: today, status: { $in: PRESENT } }),
    Leave.countDocuments({ status: 'approved', startDate: { $lte: today }, endDate: { $gte: today } }),
    User.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } },
      { $project: { name: { $ifNull: [{ $arrayElemAt: ['$d.name', 0] }, 'Unassigned'] }, count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const days = Array.from({ length: 10 }, (_, i) => addDays(today, -i)).filter((d) => !isWeekend(d)).slice(0, 7).reverse();
  const trendAgg = await Attendance.aggregate([
    { $match: { date: { $in: days }, status: { $in: PRESENT } } },
    { $group: { _id: '$date', count: { $sum: 1 } } },
  ]);
  const trendMap = Object.fromEntries(trendAgg.map((t) => [t._id, t.count]));
  const attendanceTrend = days.map((d) => ({ date: d.slice(5), present: trendMap[d] || 0 }));

  const payrollAgg = await Payroll.aggregate([
    { $group: { _id: '$month', total: { $sum: '$netSalary' } } },
    { $sort: { _id: -1 } }, { $limit: 6 }, { $sort: { _id: 1 } },
  ]);
  const payrollTrend = payrollAgg.map((p) => ({ month: p._id, total: Math.round(p.total) }));

  return {
    totalEmployees, departments, pendingLeaves, presentToday, onLeaveToday,
    absentToday: isWeekend(today) ? 0 : Math.max(0, totalEmployees - presentToday - onLeaveToday),
    departmentHeadcount: deptAgg, attendanceTrend, payrollTrend,
  };
};

const employeeStats = async (user) => {
  const { start, end } = monthRange(currentMonth());
  const [today, month, pendingLeaves, lastPayslip] = await Promise.all([
    Attendance.findOne({ user: user._id, date: todayStr() }),
    Attendance.find({ user: user._id, date: { $gte: start, $lte: end } }).lean(),
    Leave.countDocuments({ user: user._id, status: 'pending' }),
    Payroll.findOne({ user: user._id }).sort({ month: -1 }),
  ]);
  const count = (s) => month.filter((r) => r.status === s).length;
  return {
    today, leaveBalance: user.leaveBalance, pendingLeaves, lastPayslip,
    monthSummary: { present: count('present'), late: count('late'), halfDay: count('half-day'), onLeave: count('on-leave') },
  };
};

export const stats = asyncHandler(async (req, res) =>
  ok(res, MANAGERS.includes(req.user.role) ? { scope: 'org', ...(await managerStats()) } : { scope: 'self', ...(await employeeStats(req.user)) }));
