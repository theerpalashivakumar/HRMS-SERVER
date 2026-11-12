import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  lateAfter: process.env.LATE_AFTER || '09:45',
  halfDayHours: 4,
  defaultPassword: 'Welcome@123',
};
export default config;
