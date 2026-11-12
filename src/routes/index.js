import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES, MANAGERS } from '../config/constants.js';
import * as auth from '../controllers/authController.js';
import * as emp from '../controllers/employeeController.js';
import * as dept from '../controllers/departmentController.js';
import * as att from '../controllers/attendanceController.js';
import * as leave from '../controllers/leaveController.js';
import * as pay from '../controllers/payrollController.js';
import { stats } from '../controllers/dashboardController.js';

const router = Router();
const managers = authorize(...MANAGERS);
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, message: { success: false, message: 'Too many login attempts, try later' } });

router.get('/health', (_req, res) => res.json({ success: true, message: 'HRMS API running' }));

// Auth
router.post('/auth/login', loginLimiter, auth.login);
router.get('/auth/me', protect, auth.me);
router.put('/auth/profile', protect, auth.updateProfile);
router.put('/auth/password', protect, auth.changePassword);

router.use(protect); // everything below requires login

router.get('/dashboard', stats);

// Employees
router.route('/employees').get(managers, emp.list).post(managers, emp.create);
router.route('/employees/:id').get(emp.getOne).put(managers, emp.update).delete(authorize(ROLES.ADMIN, ROLES.HR), emp.remove);

// Departments
router.route('/departments').get(dept.list).post(managers, dept.create);
router.route('/departments/:id').put(managers, dept.update).delete(managers, dept.remove);

// Attendance
router.get('/attendance', att.list);
router.get('/attendance/today', att.getToday);
router.get('/attendance/summary', managers, att.summary);
router.post('/attendance/check-in', att.checkIn);
router.post('/attendance/check-out', att.checkOut);
router.post('/attendance/mark', managers, att.mark);

// Leaves
router.route('/leaves').get(leave.list).post(leave.apply);
router.patch('/leaves/:id/review', managers, leave.review);
router.patch('/leaves/:id/cancel', leave.cancel);

// Payroll
router.get('/payroll', pay.list);
router.post('/payroll/generate', managers, pay.generate);
router.patch('/payroll/:id/pay', managers, pay.markPaid);
router.get('/payroll/:id/pdf', pay.downloadPdf);

export default router;
