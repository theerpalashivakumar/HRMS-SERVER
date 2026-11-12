import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'Not authenticated');
  let decoded;
  try { decoded = jwt.verify(header.split(' ')[1], config.jwtSecret); }
  catch { throw new ApiError(401, 'Invalid or expired token'); }
  const user = await User.findById(decoded.id).populate('department', 'name');
  if (!user || user.status !== 'active') throw new ApiError(401, 'User no longer active');
  req.user = user;
  next();
});

export const authorize = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role)
    ? next()
    : next(new ApiError(403, 'You do not have permission to perform this action'));
