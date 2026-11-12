import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../config/constants.js';
import { todayStr } from '../utils/date.js';

const money = { type: Number, default: 0, min: 0 };

const userSchema = new mongoose.Schema(
  {
    employeeId: { type: String, unique: true },
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    password: { type: String, required: true, minlength: [6, 'Password must be at least 6 characters'], select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.EMPLOYEE },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    designation: { type: String, trim: true },
    phone: { type: String, trim: true },
    joiningDate: { type: String, default: () => todayStr(), match: [/^\d{4}-\d{2}-\d{2}$/, 'Invalid joining date'] },
    salary: { basic: money, hra: money, allowances: money },
    leaveBalance: {
      casual: { type: Number, default: 12 },
      sick: { type: Number, default: 10 },
      earned: { type: Number, default: 15 },
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
  next();
});
userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};
userSchema.set('toJSON', {
  transform: (_doc, ret) => { delete ret.password; delete ret.__v; return ret; },
});

export default mongoose.model('User', userSchema);
