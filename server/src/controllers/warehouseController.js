const { Warehouse, Branch, UserWarehouseAccess, User } = require('../models');
const { body, param, validationResult } = require('express-validator');

function isAdmin(req) {
  return Boolean(req.user?.isSystemAdmin || req.companyRoleKey === 'admin' || req.companyRole === 'Admin');
}

// List all warehouses for the company
async function listCompanyWarehouses(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    
    const includeInactive = req.query.includeInactive === 'true';
    const where = { companyId: req.companyContext.id };
    if (!includeInactive) where.isActive = true;

    const warehouses = await Warehouse.findAll({ 
      where,
      include: [{ model: Branch, required: false, attributes: ['id', 'name', 'code'] }],
      order: [['name', 'ASC']],
    });

    return res.json({
      warehouses: warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        code: w.code || '',
        location: w.location || '',
        address: w.address || '',
        branchId: w.branchId,
        branchName: w.Branch?.name || '',
        isActive: w.isActive,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      })),
    });
  } catch (e) {
    console.error('warehouse.listCompanyWarehouses error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// Get single warehouse by ID
async function getWarehouse(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });

    const warehouse = await Warehouse.findOne({
      where: { id: Number(req.params.id), companyId: req.companyContext.id },
      include: [{ model: Branch, required: false, attributes: ['id', 'name', 'code'] }],
    });

    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });

    return res.json({
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code || '',
        location: warehouse.location || '',
        address: warehouse.address || '',
        branchId: warehouse.branchId,
        branchName: warehouse.Branch?.name || '',
        isActive: warehouse.isActive,
        createdAt: warehouse.createdAt,
        updatedAt: warehouse.updatedAt,
      },
    });
  } catch (e) {
    console.error('warehouse.getWarehouse error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const createWarehouseValidators = [
  body('name').isString().trim().notEmpty().withMessage('Warehouse name is required'),
  body('code').optional().isString().trim(),
  body('location').optional().isString().trim(),
  body('address').optional().isString(),
  body('branchId').optional().isInt(),
];

async function createWarehouse(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (!req.companyContext) return res.status(403).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const companyId = req.companyContext.id;
    const { name, code, location, address, branchId } = req.body;

    // Check unique code within company
    if (code) {
      const existing = await Warehouse.findOne({ where: { companyId, code } });
      if (existing) return res.status(409).json({ error: 'Warehouse code already exists' });
    }

    // Validate branch if provided
    if (branchId) {
      const branch = await Branch.findOne({ where: { id: branchId, companyId } });
      if (!branch) return res.status(400).json({ error: 'Invalid branch' });
    }

    const warehouse = await Warehouse.create({
      companyId,
      branchId: branchId || null,
      name: String(name).trim(),
      code: code ? String(code).trim() : null,
      location: location ? String(location).trim() : null,
      address: address ? String(address).trim() : null,
      isActive: true,
    });

    return res.json({
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code || '',
        location: warehouse.location || '',
        address: warehouse.address || '',
        branchId: warehouse.branchId,
        isActive: warehouse.isActive,
        createdAt: warehouse.createdAt,
        updatedAt: warehouse.updatedAt,
      },
    });
  } catch (e) {
    console.error('warehouse.createWarehouse error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const updateWarehouseValidators = [
  param('id').isInt(),
  body('name').optional().isString().trim().notEmpty(),
  body('code').optional().isString().trim(),
  body('location').optional().isString().trim(),
  body('address').optional().isString(),
  body('branchId').optional(),
  body('isActive').optional().isBoolean(),
];

async function updateWarehouse(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const companyId = req.companyContext.id;
    const warehouseId = Number(req.params.id);

    const warehouse = await Warehouse.findOne({ where: { id: warehouseId, companyId } });
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });

    const { name, code, location, address, branchId, isActive } = req.body;

    // Check unique code within company
    if (code !== undefined && code !== warehouse.code) {
      const existing = await Warehouse.findOne({ where: { companyId, code } });
      if (existing && existing.id !== warehouseId) {
        return res.status(409).json({ error: 'Warehouse code already exists' });
      }
    }

    // Validate branch if provided
    if (branchId !== undefined && branchId !== null) {
      const branch = await Branch.findOne({ where: { id: branchId, companyId } });
      if (!branch) return res.status(400).json({ error: 'Invalid branch' });
    }

    if (name !== undefined) warehouse.name = String(name).trim();
    if (code !== undefined) warehouse.code = code ? String(code).trim() : null;
    if (location !== undefined) warehouse.location = location ? String(location).trim() : null;
    if (address !== undefined) warehouse.address = address ? String(address).trim() : null;
    if (branchId !== undefined) warehouse.branchId = branchId || null;
    if (isActive !== undefined) warehouse.isActive = Boolean(isActive);

    await warehouse.save();

    return res.json({
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code || '',
        location: warehouse.location || '',
        address: warehouse.address || '',
        branchId: warehouse.branchId,
        isActive: warehouse.isActive,
        createdAt: warehouse.createdAt,
        updatedAt: warehouse.updatedAt,
      },
    });
  } catch (e) {
    console.error('warehouse.updateWarehouse error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

async function deleteWarehouse(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const companyId = req.companyContext.id;
    const warehouseId = Number(req.params.id);

    const warehouse = await Warehouse.findOne({ where: { id: warehouseId, companyId } });
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });

    // Remove user assignments
    await UserWarehouseAccess.destroy({ where: { warehouseId } });

    await warehouse.destroy();

    return res.json({ ok: true });
  } catch (e) {
    console.error('warehouse.deleteWarehouse error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// Get users assigned to a warehouse
async function getWarehouseUsers(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const warehouseId = Number(req.params.id);
    const warehouse = await Warehouse.findOne({ where: { id: warehouseId, companyId: req.companyContext.id } });
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });

    const assignments = await UserWarehouseAccess.findAll({
      where: { warehouseId },
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
    console.error('warehouse.getWarehouseUsers error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

async function clearUserWarehousesInCompany(userId, companyId) {
  // Remove all access rows for warehouses belonging to company
  const rows = await Warehouse.findAll({ where: { companyId } });
  const ids = rows.map((w) => w.id);
  if (ids.length === 0) return;
  await UserWarehouseAccess.destroy({ where: { userId, warehouseId: ids } });
}

module.exports = {
  listCompanyWarehouses,
  getWarehouse,
  createWarehouseValidators,
  createWarehouse,
  updateWarehouseValidators,
  updateWarehouse,
  deleteWarehouse,
  getWarehouseUsers,
  clearUserWarehousesInCompany,
};
