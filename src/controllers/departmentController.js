import Department from '../models/Department.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';

const withCounts = async (depts) => {
  const counts = await User.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  return depts.map((d) => ({ ...d.toJSON(), employeeCount: map[String(d._id)] || 0 }));
};

export const list = asyncHandler(async (_req, res) => {
  const depts = await Department.find().populate('head', 'name employeeId').sort({ name: 1 });
  ok(res, await withCounts(depts));
});

export const create = asyncHandler(async (req, res) => {
  const { name, description, head } = req.body;
  const dept = await Department.create({ name, description, head: head || undefined });
  await dept.populate('head', 'name employeeId');
  ok(res, { ...dept.toJSON(), employeeCount: 0 }, 'Department created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw new ApiError(404, 'Department not found');
  const { name, description, head } = req.body;
  if (name !== undefined) dept.name = name;
  if (description !== undefined) dept.description = description;
  if (head !== undefined) dept.head = head || undefined;
  await dept.save();
  await dept.populate('head', 'name employeeId');
  ok(res, (await withCounts([dept]))[0], 'Department updated');
});

export const remove = asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw new ApiError(404, 'Department not found');
  if (await User.exists({ department: dept._id })) throw new ApiError(400, 'Reassign employees before deleting this department');
  await dept.deleteOne();
  ok(res, dept._id, 'Department deleted');
});
