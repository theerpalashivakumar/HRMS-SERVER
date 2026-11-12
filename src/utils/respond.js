export const ok = (res, data, message, status = 200) =>
  res.status(status).json({ success: true, message, data });
