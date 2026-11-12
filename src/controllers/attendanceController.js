import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import config from '../config/index.js';
import { ATTENDANCE_STATUS, MANAGERS } from '../config/constants.js';
import { todayStr, nowHM, currentMonth, monthRange, isValidMonth, isValidDate, weekdays, parseDateTimeInTz } from '../utils/date.js';

export const getToday = asyncHandler(async (req, res) =>
  ok(res, await Attendance.findOne({ user: req.user._id, date: todayStr() })));

export const checkIn = asyncHandler(async (req, res) => {
  const date = todayStr();
  const existing = await Attendance.findOne({ user: req.user._id, date });
  if (existing?.checkIn) throw new ApiError(400, 'You have already checked in today');
  const now = new Date();
  const status = nowHM(now) > config.lateAfter ? 'late' : 'present';
  const rec = existing || new Attendance({ user: req.user._id, date });
  Object.assign(rec, { checkIn: now, status });
  await rec.save();
  ok(res, rec, status === 'late' ? 'Checked in (marked late)' : 'Checked in', 201);
});

export const checkOut = asyncHandler(async (req, res) => {
  const rec = await Attendance.findOne({ user: req.user._id, date: todayStr() });
  if (!rec?.checkIn) throw new ApiError(400, 'You have not checked in today');
  if (rec.checkOut) throw new ApiError(400, 'You have already checked out today');
  rec.checkOut = new Date();
  rec.workHours = Math.round(((rec.checkOut - rec.checkIn) / 36e5) * 100) / 100;
  if (rec.workHours < config.halfDayHours) rec.status = 'half-day';
  await rec.save();
  ok(res, rec, 'Checked out');
});

export const list = asyncHandler(async (req, res) => {
  const month = req.query.month || currentMonth();
  if (!isValidMonth(month)) throw new ApiError(400, 'Invalid month, expected YYYY-MM');
  const { start, end } = monthRange(month);
  const filter = { date: { $gte: start, $lte: end } };
  if (MANAGERS.includes(req.user.role)) { if (req.query.userId) filter.user = req.query.userId; }
  else filter.user = req.user._id;
  const records = await Attendance.find(filter).populate('user', 'name employeeId').sort({ date: -1 });
  ok(res, records);
});

// HR/Admin: create or correct an attendance record
export const mark = asyncHandler(async (req, res) => {
  const { userId, date, status, checkIn, checkOut, note } = req.body;
  if (!(await User.exists({ _id: userId }))) throw new ApiError(404, 'Employee not found');
  if (!isValidDate(date)) throw new ApiError(400, 'Valid date is required');
  if (date > todayStr()) throw new ApiError(400, 'Cannot mark attendance for a future date');
  if (!ATTENDANCE_STATUS.includes(status)) throw new ApiError(400, 'Invalid status');
  const toDate = (t) => parseDateTimeInTz(date, t);
  const update = { status, note, checkIn: toDate(checkIn), checkOut: toDate(checkOut) };
  if (update.checkIn && update.checkOut) update.workHours = Math.round(((update.checkOut - update.checkIn) / 36e5) * 100) / 100;
  const rec = await Attendance.findOneAndUpdate({ user: userId, date }, { $set: update }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true })
    .populate('user', 'name employeeId');
  ok(res, rec, 'Attendance saved', 201);
});

// Monthly per-employee summary incl. derived absences
export const summary = asyncHandler(async (req, res) => {
  const month = req.query.month || currentMonth();
  if (!isValidMonth(month)) throw new ApiError(400, 'Invalid month, expected YYYY-MM');
  const { start, end } = monthRange(month);
  const today = todayStr();
  const to = end < today ? end : today;
  const [users, records] = await Promise.all([
    User.find({ status: 'active' }).populate('department', 'name').sort({ employeeId: 1 }),
    Attendance.find({ date: { $gte: start, $lte: end } }).lean(),
  ]);
  const rows = users.map((u) => {
    const mine = records.filter((r) => String(r.user) === String(u._id));
    const count = (s) => mine.filter((r) => r.status === s).length;
    const present = count('present'), late = count('late'), halfDay = count('half-day'), onLeave = count('on-leave');
    const from = u.joiningDate > start ? u.joiningDate : start;
    const elapsed = weekdays(from, to).length;
    return {
      _id: u._id, employeeId: u.employeeId, name: u.name, department: u.department?.name || '-',
      present, late, halfDay, onLeave,
      absent: Math.max(0, elapsed - present - late - halfDay - onLeave),
      hours: Math.round(mine.reduce((s, r) => s + (r.workHours || 0), 0) * 100) / 100,
    };
  });
  ok(res, rows);
});
