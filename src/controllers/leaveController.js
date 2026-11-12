import Leave from '../models/Leave.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import { LEAVE_TYPES, MANAGERS } from '../config/constants.js';
import { isValidDate, weekdays } from '../utils/date.js';

const populate = (q) => q.populate('user', 'name employeeId').populate('reviewedBy', 'name');

export const apply = asyncHandler(async (req, res) => {
  const { type, startDate, endDate, reason } = req.body;
  if (!LEAVE_TYPES.includes(type)) throw new ApiError(400, 'Invalid leave type');
  if (!isValidDate(startDate) || !isValidDate(endDate)) throw new ApiError(400, 'Valid start and end dates are required');
  if (endDate < startDate) throw new ApiError(400, 'End date cannot be before start date');
  if (!reason?.trim()) throw new ApiError(400, 'Reason is required');

  const days = weekdays(startDate, endDate).length;
  if (days === 0) throw new ApiError(400, 'Selected range has no working days');

  if (type !== 'unpaid') {
    const pendingLeaves = await Leave.find({ user: req.user._id, status: 'pending', type });
    const pendingDays = pendingLeaves.reduce((sum, l) => sum + (l.days || 0), 0);
    const availableBalance = (req.user.leaveBalance[type] || 0) - pendingDays;
    if (availableBalance < days) {
      throw new ApiError(
        400,
        `Insufficient ${type} leave balance (${availableBalance} available after ${pendingDays} pending, ${days} requested)`
      );
    }
  }

  const overlap = await Leave.exists({ user: req.user._id, status: { $in: ['pending', 'approved'] }, startDate: { $lte: endDate }, endDate: { $gte: startDate } });
  if (overlap) throw new ApiError(400, 'You already have a leave request overlapping these dates');

  const leave = await Leave.create({ user: req.user._id, type, startDate, endDate, days, reason });
  ok(res, await populate(Leave.findById(leave._id)), 'Leave request submitted', 201);
});

export const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (MANAGERS.includes(req.user.role)) { if (req.query.userId) filter.user = req.query.userId; }
  else filter.user = req.user._id;
  if (req.query.status) filter.status = req.query.status;
  ok(res, await populate(Leave.find(filter).sort({ createdAt: -1 })));
});

export const review = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  if (!['approved', 'rejected'].includes(status)) throw new ApiError(400, 'Status must be approved or rejected');
  const leave = await Leave.findById(req.params.id);
  if (!leave) throw new ApiError(404, 'Leave request not found');
  if (leave.status !== 'pending') throw new ApiError(400, `Request is already ${leave.status}`);
  if (String(leave.user) === String(req.user._id)) throw new ApiError(403, 'You cannot review your own request');

  if (status === 'approved') {
    const employee = await User.findById(leave.user);
    if (leave.type !== 'unpaid') {
      if (employee.leaveBalance[leave.type] < leave.days) throw new ApiError(400, 'Employee no longer has enough leave balance');
      await User.updateOne({ _id: employee._id }, { $inc: { [`leaveBalance.${leave.type}`]: -leave.days } });
    }
    // Reflect approved leave in attendance (never overwrite an existing record)
    const ops = weekdays(leave.startDate, leave.endDate).map((date) => ({
      updateOne: { filter: { user: leave.user, date }, update: { $setOnInsert: { status: 'on-leave', note: `${leave.type} leave` } }, upsert: true },
    }));
    await Attendance.bulkWrite(ops);
  }
  Object.assign(leave, { status, reviewNote: note, reviewedBy: req.user._id, reviewedAt: new Date() });
  await leave.save();
  ok(res, await populate(Leave.findById(leave._id)), `Leave ${status}`);
});

export const cancel = asyncHandler(async (req, res) => {
  const leave = await Leave.findOne({ _id: req.params.id, user: req.user._id });
  if (!leave) throw new ApiError(404, 'Leave request not found');
  if (leave.status !== 'pending') throw new ApiError(400, 'Only pending requests can be cancelled');
  leave.status = 'cancelled';
  await leave.save();
  ok(res, await populate(Leave.findById(leave._id)), 'Leave request cancelled');
});
