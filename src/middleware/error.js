import ApiError from '../utils/ApiError.js';

export const notFound = (req, _res, next) => next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));

export const errorHandler = (err, _req, res, _next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Server error';
  if (err.name === 'ValidationError') { status = 400; message = Object.values(err.errors).map((e) => e.message).join(', '); }
  else if (err.code === 11000) { status = 409; message = `${Object.keys(err.keyValue)[0]} already exists`; }
  else if (err.name === 'CastError') { status = 400; message = `Invalid ${err.path}`; }
  if (status === 500) console.error(err);
  res.status(status).json({ success: false, message });
};
