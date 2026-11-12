import mongoose from 'mongoose';
import { ATTENDANCE_STATUS } from '../config/constants.js';

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD in company timezone
    checkIn: Date,
    checkOut: Date,
    workHours: { type: Number, default: 0 },
    status: { type: String, enum: ATTENDANCE_STATUS, default: 'present' },
    note: String,
  },
  { timestamps: true }
);
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
export default mongoose.model('Attendance', attendanceSchema);
