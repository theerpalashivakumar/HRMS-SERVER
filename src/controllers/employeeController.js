import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Payroll from '../models/Payroll.js';
import Department from '../models/Department.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import config from '../config/index.js';
import { ROLES } from '../config/constants.js';

const FIELDS = ['name', 'email', 'role', 'department', 'designation', 'phone', 'joiningDate', 'salary', 'status'];
const pick = (obj) => Object.fromEntries(FIELDS.filter((f) => obj[f] !== undefined).map((f) => [f, obj[f] === '' ? undefined : obj[f]]));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Only admins may create/modify/promote admin accounts.
const guardAdminRole = (actor, targetRole, newRole) => {
  if (actor.role !== ROLES.ADMIN && (targetRole === ROLES.ADMIN || newRole === ROLES.ADMIN))
    throw new ApiError(403, 'Only an admin can manage admin accounts');
};

const nextEmployeeId = async () => {
  const last = await User.findOne().sort({ employeeId: -1 }).select('employeeId');
  const num = last ? parseInt(last.employeeId.replace(/\D/g, ''), 10) + 1 : 1;
  return `EMP${String(num).padStart(3, '0')}`;
};

export const list = asyncHandler(async (req, res) => {
  const { q, department, status, role } = req.query;
  const filter = {};
  if (department) filter.department = department;
  if (status) filter.status = status;
  if (role) filter.role = role;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { employeeId: rx }];
  }
  const users = await User.find(filter).populate('department', 'name').sort({ employeeId: 1 });
  ok(res, users);
});

export const getOne = asyncHandler(async (req, res) => {
  const isManager = [ROLES.ADMIN, ROLES.HR].includes(req.user.role);
  if (!isManager && String(req.user._id) !== req.params.id) throw new ApiError(403, 'Access denied');
  const user = await User.findById(req.params.id).populate('department', 'name');
  if (!user) throw new ApiError(404, 'Employee not found');
  ok(res, user);
});

export const create = asyncHandler(async (req, res) => {
  guardAdminRole(req.user, null, req.body.role);
  const user = await User.create({
    ...pick(req.body),
    password: req.body.password || config.defaultPassword,
    employeeId: await nextEmployeeId(),
  });
  await user.populate('department', 'name');
  ok(res, user, 'Employee created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Employee not found');
  guardAdminRole(req.user, user.role, req.body.role);
  if (String(user._id) === String(req.user._id) && (req.body.status === 'inactive' || (req.body.role && req.body.role !== user.role)))
    throw new ApiError(400, 'You cannot deactivate or change the role of your own account');
  Object.assign(user, pick(req.body));
  if (req.body.password) user.password = req.body.password;
  await user.save();
  await user.populate('department', 'name');
  ok(res, user, 'Employee updated');
});

export const remove = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Employee not found');
  if (String(user._id) === String(req.user._id)) throw new ApiError(400, 'You cannot delete your own account');
  guardAdminRole(req.user, user.role);
  await Promise.all([
    Attendance.deleteMany({ user: user._id }),
    Leave.deleteMany({ user: user._id }),
    Payroll.deleteMany({ user: user._id }),
    Department.updateMany({ head: user._id }, { $unset: { head: 1 } }),
  ]);
  await user.deleteOne();
  ok(res, user._id, 'Employee deleted');
});
