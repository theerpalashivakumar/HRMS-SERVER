import mongoose from 'mongoose';

const n = { type: Number, default: 0 };

const payrollSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true }, // YYYY-MM
    basic: n, hra: n, allowances: n,
    grossEarned: n,
    monthWorkingDays: n, elapsedDays: n, presentDays: n, paidLeaveDays: n, unpaidDays: n,
    absentDeduction: n, pf: n, professionalTax: n, netSalary: n,
    status: { type: String, enum: ['generated', 'paid'], default: 'generated' },
    paidAt: Date,
  },
  { timestamps: true }
);
payrollSchema.index({ user: 1, month: 1 }, { unique: true });
export default mongoose.model('Payroll', payrollSchema);
