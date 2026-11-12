import Payroll from '../models/Payroll.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import { MANAGERS } from '../config/constants.js';
import { isValidMonth } from '../utils/date.js';
import { calculatePayroll, streamPayslipPdf } from '../services/payrollService.js';

const populate = (q) => q.populate({ path: 'user', select: 'name employeeId designation department', populate: { path: 'department', select: 'name' } });

export const generate = asyncHandler(async (req, res) => {
  const { month, userId } = req.body;
  if (!isValidMonth(month)) throw new ApiError(400, 'Valid month (YYYY-MM) is required');
  const users = userId ? await User.find({ _id: userId }) : await User.find({ status: 'active' });
  if (!users.length) throw new ApiError(404, 'No employees found');

  let generated = 0, skipped = 0;
  for (const u of users) {
    const { basic = 0, hra = 0, allowances = 0 } = u.salary || {};
    const existing = await Payroll.findOne({ user: u._id, month });
    if (basic + hra + allowances === 0 || existing?.status === 'paid') { skipped++; continue; }
    const data = await calculatePayroll(u, month);
    await Payroll.findOneAndUpdate({ user: u._id, month }, { $set: data }, { upsert: true, setDefaultsOnInsert: true });
    generated++;
  }
  const items = await populate(Payroll.find({ month }).sort({ createdAt: -1 }));
  ok(res, items, `Payroll generated for ${generated} employee(s)${skipped ? `, ${skipped} skipped (no salary set or already paid)` : ''}`);
});

export const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.month) filter.month = req.query.month;
  if (MANAGERS.includes(req.user.role)) { if (req.query.userId) filter.user = req.query.userId; }
  else filter.user = req.user._id;
  ok(res, await populate(Payroll.find(filter).sort({ month: -1, createdAt: -1 })));
});

export const markPaid = asyncHandler(async (req, res) => {
  const p = await Payroll.findById(req.params.id);
  if (!p) throw new ApiError(404, 'Payroll record not found');
  p.status = 'paid';
  p.paidAt = new Date();
  await p.save();
  ok(res, await populate(Payroll.findById(p._id)), 'Marked as paid');
});

export const downloadPdf = asyncHandler(async (req, res) => {
  const p = await populate(Payroll.findById(req.params.id));
  if (!p) throw new ApiError(404, 'Payroll record not found');
  if (!MANAGERS.includes(req.user.role) && String(p.user._id) !== String(req.user._id)) throw new ApiError(403, 'Access denied');
  streamPayslipPdf(p, res);
});
