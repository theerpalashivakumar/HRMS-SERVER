import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';

const sign = (id) => jwt.sign({ id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email and password are required');
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password').populate('department', 'name');
  if (!user || !(await user.matchPassword(password))) throw new ApiError(401, 'Invalid email or password');
  if (user.status !== 'active') throw new ApiError(403, 'Your account is inactive. Contact HR.');
  ok(res, { token: sign(user._id), user }, 'Login successful');
});

export const me = asyncHandler(async (req, res) => ok(res, req.user));

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  if (name !== undefined) req.user.name = name;
  if (phone !== undefined) req.user.phone = phone;
  await req.user.save();
  ok(res, req.user, 'Profile updated');
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(400, 'Both current and new password are required');
  if (newPassword.length < 6) throw new ApiError(400, 'New password must be at least 6 characters');
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(currentPassword))) throw new ApiError(400, 'Current password is incorrect');
  user.password = newPassword;
  await user.save();
  ok(res, null, 'Password changed');
});
