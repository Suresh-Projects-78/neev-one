const { Branch, Warehouse, UserBranchAccess, User } = require('../models');
const { body, param, validationResult } = require('express-validator');

function isAdmin(req) {
  return Boolean(req.user?.isSystemAdmin || req.companyRoleKey === 'admin' || req.companyRole === 'Admin');
}

// List all branches for the company
async function listCompanyBranches(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    
    const includeInactive = req.query.includeInactive === 'true';
    const where = { companyId: req.companyContext.id };
    if (!includeInactive) where.isActive = true;

    const branches = await Branch.findAll({ 
      where,
      order: [['name', 'ASC']],
    });

    return res.json({
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code || '',
        address: b.address || '',
        isActive: b.isActive,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
    });
  } catch (e) {
    console.error('branch.listCompanyBranches error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// Get single branch by ID
async function getBranch(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });

    const branch = await Branch.findOne({
      where: { id: Number(req.params.id), companyId: req.companyContext.id },
      include: [{ model: Warehouse, required: false }],
    });

    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    return res.json({
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code || '',
        address: branch.address || '',
        isActive: branch.isActive,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt,
        warehouses: (branch.Warehouses || []).map((w) => ({
          id: w.id,
          name: w.name,
          code: w.code || '',
          location: w.location || '',
          isActive: w.isActive,
        })),
      },
    });
  } catch (e) {
    console.error('branch.getBranch error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const createBranchValidators = [
  body('name').isString().trim().notEmpty().withMessage('Branch name is required'),
  body('code').optional().isString().trim(),
  body('address').optional().isString(),
];

async function createBranch(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (!req.companyContext) return res.status(403).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const companyId = req.companyContext.id;
    const { name, code, address } = req.body;

    // Check unique code within company
    if (code) {
      const existing = await Branch.findOne({ where: { companyId, code } });
      if (existing) return res.status(409).json({ error: 'Branch code already exists' });
    }

    const branch = await Branch.create({
      companyId,
      name: String(name).trim(),
      code: code ? String(code).trim() : null,
      address: address ? String(address).trim() : null,
      isActive: true,
    });

    return res.json({
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code || '',
        address: branch.address || '',
        isActive: branch.isActive,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt,
      },
    });
  } catch (e) {
    console.error('branch.createBranch error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const updateBranchValidators = [
  param('id').isInt(),
  body('name').optional().isString().trim().notEmpty(),
  body('code').optional().isString().trim(),
  body('address').optional().isString(),
  body('isActive').optional().isBoolean(),
];

async function updateBranch(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const companyId = req.companyContext.id;
    const branchId = Number(req.params.id);

    const branch = await Branch.findOne({ where: { id: branchId, companyId } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const { name, code, address, isActive } = req.body;

    // Check unique code within company
    if (code !== undefined && code !== branch.code) {
      const existing = await Branch.findOne({ where: { companyId, code } });
      if (existing && existing.id !== branchId) {
        return res.status(409).json({ error: 'Branch code already exists' });
      }
    }

    if (name !== undefined) branch.name = String(name).trim();
    if (code !== undefined) branch.code = code ? String(code).trim() : null;
    if (address !== undefined) branch.address = address ? String(address).trim() : null;
    if (isActive !== undefined) branch.isActive = Boolean(isActive);

    await branch.save();

    return res.json({
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code || '',
        address: branch.address || '',
        isActive: branch.isActive,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt,
      },
    });
  } catch (e) {
    console.error('branch.updateBranch error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

async function deleteBranch(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const companyId = req.companyContext.id;
    const branchId = Number(req.params.id);

    const branch = await Branch.findOne({ where: { id: branchId, companyId } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    // Check for linked warehouses
    const warehouseCount = await Warehouse.count({ where: { branchId } });
    if (warehouseCount > 0) {
      return res.status(409).json({ error: 'Cannot delete branch with linked warehouses. Reassign or delete warehouses first.' });
    }

    // Remove user assignments
    await UserBranchAccess.destroy({ where: { branchId } });

    await branch.destroy();

    return res.json({ ok: true });
  } catch (e) {
    console.error('branch.deleteBranch error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// Get users assigned to a branch
async function getBranchUsers(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const branchId = Number(req.params.id);
    const branch = await Branch.findOne({ where: { id: branchId, companyId: req.companyContext.id } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const assignments = await UserBranchAccess.findAll({
      where: { branchId },
      include: [User],
    });

    return res.json({
      users: assignments.map((a) => ({
        userId: a.userId,
        email: a.User?.email || '',
        name: a.User?.name || '',
        assignedAt: a.assignedAt,
      })),
    });
  } catch (e) {
    console.error('branch.getBranchUsers error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

module.exports = {
  listCompanyBranches,
  getBranch,
  createBranch,
  createBranchValidators,
  updateBranch,
  updateBranchValidators,
  deleteBranch,
  getBranchUsers,
};
