import mongoose from 'mongoose';
import { LEAVE_TYPES, LEAVE_STATUS } from '../config/constants.js';

const leaveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: LEAVE_TYPES, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    days: { type: Number, required: true },
    reason: { type: String, required: [true, 'Reason is required'], trim: true },
    status: { type: String, enum: LEAVE_STATUS, default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: String,
    reviewedAt: Date,
  },
  { timestamps: true }
);
leaveSchema.index({ user: 1, startDate: 1 });
export default mongoose.model('Leave', leaveSchema);
