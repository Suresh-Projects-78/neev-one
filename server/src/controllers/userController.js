const { Op } = require('sequelize');
const { User, UserCompanyAccess, UserBranchAccess, UserWarehouseAccess, UserRole, Role, Company, Branch, Warehouse } = require('../models');
const { body, param, validationResult } = require('express-validator');
const { hashPassword } = require('../services/authService');
const { clearUserWarehousesInCompany } = require('./warehouseController');

function isAdmin(req) {
  return Boolean(req.user?.isSystemAdmin || req.companyRoleKey === 'admin' || req.companyRole === 'Admin');
}

const assignUserCompanyValidators = [body('userId').isInt(), body('companyId').isInt(), body('roleKey').isString()];
const assignUserBranchValidators = [body('userId').isInt(), body('branchId').isInt()];

// Admins can assign users to their company
async function assignUserToCompany(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { userId, companyId, roleKey } = req.body;
    // only company admin can assign
    if (!req.companyContext || Number(req.companyContext.id) !== Number(companyId)) return res.status(403).json({ error: 'Forbidden' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const role = await Role.findOne({ where: { key: roleKey } });
    if (!role) return res.status(400).json({ error: 'Invalid role' });

    const [access] = await UserCompanyAccess.findOrCreate({
      where: { userId, companyId },
      defaults: { userId, companyId, roleId: role.id },
    });
    if (access.roleId !== role.id) {
      access.roleId = role.id;
      await access.save();
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('user.assignUserToCompany error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// Admins can assign users to branches in their company
async function assignUserToBranch(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { userId, branchId } = req.body;
    const branch = await Branch.findByPk(branchId);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    if (!req.companyContext || Number(req.companyContext.id) !== Number(branch.companyId)) return res.status(403).json({ error: 'Forbidden' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });
    await UserBranchAccess.findOrCreate({ where: { userId, branchId }, defaults: { userId, branchId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error('user.assignUserToBranch error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const createCompanyUserValidators = [
  body('email').isEmail(),
  body('mobile').optional().isString(),
  body('name').optional().isString(),
  body('password').optional().isLength({ min: 8 }),
  body('roleId').optional().isInt(),
];

async function createCompanyUser(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const companyId = Number(req.companyContext.id);
    const email = String(req.body.email || '').trim().toLowerCase();
    const mobile = req.body.mobile != null ? String(req.body.mobile || '').trim() : null;
    const name = req.body.name != null ? String(req.body.name || '').trim() : null;
    const password = req.body.password != null ? String(req.body.password || '') : null;

    if (!email) return res.status(400).json({ error: 'Email required' });

    let roleId = null;
    if (req.body.roleId != null) {
      const role = await Role.findByPk(Number(req.body.roleId));
      if (!role) return res.status(400).json({ error: 'Invalid role' });
      // allow system roles or company roles
      if (role.companyId != null && Number(role.companyId) !== companyId) return res.status(400).json({ error: 'Role not in this company' });
      roleId = role.id;
    } else {
      const fallback = await Role.findOne({ where: { key: 'viewer' } });
      roleId = fallback ? fallback.id : null;
    }

    let user = await User.findOne({ where: { email } });
    if (user) {
      // attach to company (upsert access). Do not change password.
      if (mobile && !user.mobile) user.mobile = mobile;
      if (name && !user.name) user.name = name;
      await user.save();

      const [access] = await UserCompanyAccess.findOrCreate({
        where: { userId: user.id, companyId },
        defaults: { userId: user.id, companyId, roleId },
      });
      if (roleId && access.roleId !== roleId) {
        access.roleId = roleId;
        await access.save();
      }

      return res.json({
        user: { id: user.id, email: user.email, mobile: user.mobile, name: user.name },
        attached: true,
      });
    }

    if (!password) return res.status(400).json({ error: 'Password required for new user' });

    if (mobile) {
      const existingMobile = await User.findOne({ where: { mobile } });
      if (existingMobile) return res.status(409).json({ error: 'Mobile already in use' });
    }

    const passwordHash = await hashPassword(password);
    user = await User.create({ email, mobile, name, passwordHash });

    await UserCompanyAccess.create({ userId: user.id, companyId, roleId });

    return res.json({
      user: { id: user.id, email: user.email, mobile: user.mobile, name: user.name },
      attached: true,
    });
  } catch (e) {
    console.error('user.createCompanyUser error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const updateUserValidators = [
  body('name').optional().isString(),
  body('mobile').optional().isString(),
];

async function updateUser(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const userId = Number(req.params.id);
    const companyId = Number(req.companyContext.id);

    const access = await UserCompanyAccess.findOne({ where: { userId, companyId } });
    if (!access) return res.status(404).json({ error: 'User not in this company' });

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.body.name != null) user.name = String(req.body.name || '').trim();
    if (req.body.mobile != null) user.mobile = String(req.body.mobile || '').trim();
    await user.save();
    return res.json({ user: { id: user.id, email: user.email, mobile: user.mobile, name: user.name } });
  } catch (e) {
    console.error('user.updateUser error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const setUserRoleValidators = [body('roleId').isInt()];

async function setUserRole(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const userId = Number(req.params.id);
    const companyId = Number(req.companyContext.id);

    const role = await Role.findByPk(Number(req.body.roleId));
    if (!role) return res.status(400).json({ error: 'Invalid role' });
    if (role.companyId != null && Number(role.companyId) !== companyId) return res.status(400).json({ error: 'Role not in this company' });

    const access = await UserCompanyAccess.findOne({ where: { userId, companyId } });
    if (!access) return res.status(404).json({ error: 'User not in this company' });
    access.roleId = role.id;
    await access.save();
    return res.json({ ok: true });
  } catch (e) {
    console.error('user.setUserRole error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const setUserBranchesValidators = [
  body('branchIds').isArray(),
];

async function setUserBranches(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const userId = Number(req.params.id);
    const companyId = Number(req.companyContext.id);
    const access = await UserCompanyAccess.findOne({ where: { userId, companyId } });
    if (!access) return res.status(404).json({ error: 'User not in this company' });

    const branchIds = (Array.isArray(req.body.branchIds) ? req.body.branchIds : [])
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x));

    const branches = await Branch.findAll({ where: { id: branchIds, companyId } });
    const allowedIds = branches.map((b) => b.id);

    // clear existing branch access in this company
    const companyBranches = await Branch.findAll({ where: { companyId } });
    const companyBranchIds = companyBranches.map((b) => b.id);
    if (companyBranchIds.length) {
      await UserBranchAccess.destroy({ where: { userId, branchId: companyBranchIds } });
    }

    for (const branchId of allowedIds) {
      await UserBranchAccess.create({ userId, branchId });
    }

    return res.json({ ok: true, branchIds: allowedIds });
  } catch (e) {
    console.error('user.setUserBranches error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const setUserWarehousesValidators = [
  body('warehouseIds').isArray(),
];

async function setUserWarehouses(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const userId = Number(req.params.id);
    const companyId = Number(req.companyContext.id);
    const access = await UserCompanyAccess.findOne({ where: { userId, companyId } });
    if (!access) return res.status(404).json({ error: 'User not in this company' });

    const warehouseIds = (Array.isArray(req.body.warehouseIds) ? req.body.warehouseIds : [])
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x));

    const warehouses = await Warehouse.findAll({ where: { id: warehouseIds, companyId } });
    const allowedIds = warehouses.map((w) => w.id);

    await clearUserWarehousesInCompany(userId, companyId);
    for (const warehouseId of allowedIds) {
      await UserWarehouseAccess.create({ userId, warehouseId });
    }

    return res.json({ ok: true, warehouseIds: allowedIds });
  } catch (e) {
    console.error('user.setUserWarehouses error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

async function removeUserFromCompany(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const userId = Number(req.params.id);
    const companyId = Number(req.companyContext.id);

    const access = await UserCompanyAccess.findOne({ where: { userId, companyId } });
    if (!access) return res.status(404).json({ error: 'User not in this company' });

    // Clear branch access within company
    const companyBranches = await Branch.findAll({ where: { companyId } });
    const companyBranchIds = companyBranches.map((b) => b.id);
    if (companyBranchIds.length) {
      await UserBranchAccess.destroy({ where: { userId, branchId: companyBranchIds } });
    }

    // Clear warehouse access within company
    await clearUserWarehousesInCompany(userId, companyId);

    await access.destroy();
    return res.json({ ok: true });
  } catch (e) {
    console.error('user.removeUserFromCompany error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// List users and their roles for the current company
async function listCompanyUsers(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const rows = await UserCompanyAccess.findAll({
      where: { companyId: req.companyContext.id },
      include: [User, Role],
    });

    const companyId = Number(req.companyContext.id);
    const userIds = rows.map((r) => r.userId).filter(Boolean);

    const branchRows = userIds.length
      ? await UserBranchAccess.findAll({
        where: { userId: { [Op.in]: userIds } },
        include: [{ model: Branch, required: true, where: { companyId } }],
      })
      : [];

    const warehouseRows = userIds.length
      ? await UserWarehouseAccess.findAll({
        where: { userId: { [Op.in]: userIds } },
        include: [{ model: Warehouse, required: true, where: { companyId } }],
      })
      : [];

    const branchIdsByUser = new Map();
    for (const r of branchRows) {
      const list = branchIdsByUser.get(r.userId) || [];
      list.push(r.branchId);
      branchIdsByUser.set(r.userId, list);
    }

    const warehouseIdsByUser = new Map();
    for (const r of warehouseRows) {
      const list = warehouseIdsByUser.get(r.userId) || [];
      list.push(r.warehouseId);
      warehouseIdsByUser.set(r.userId, list);
    }

    const users = rows
      .map((r) => {
        const u = r.User;
        const role = r.Role;
        return {
          userId: u ? u.id : r.userId,
          email: u ? u.email : null,
          mobile: u ? u.mobile : null,
          name: u ? u.name : null,
          accessId: r.id,
          roleId: role ? role.id : r.roleId,
          roleKey: role ? role.key : null,
          roleLabel: role ? role.label : null,
          branchIds: branchIdsByUser.get(u ? u.id : r.userId) || [],
          warehouseIds: warehouseIdsByUser.get(u ? u.id : r.userId) || [],
        };
      })
      .sort((a, b) => {
        const an = String(a.name || a.email || '').toLowerCase();
        const bn = String(b.name || b.email || '').toLowerCase();
        return an.localeCompare(bn);
      });

    return res.json({ users });
  } catch (e) {
    console.error('user.listCompanyUsers error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

/**
 * Get a single user with all their assignments (roles, branches, warehouses)
 * GET /users/:id
 */
async function getUser(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const userId = Number(req.params.id);
    const companyId = Number(req.companyContext.id);

    // Check user has access to this company
    const access = await UserCompanyAccess.findOne({
      where: { userId, companyId },
      include: [{ model: User }, { model: Role }],
    });
    if (!access) return res.status(404).json({ error: 'User not found in this company' });

    const user = access.User;
    const companyRole = access.Role;

    // Get direct role assignments via UserRole
    const directRoles = await UserRole.findAll({
      where: { userId },
      include: [{ model: Role, as: 'role', where: { companyId }, required: true }],
    });

    // Get branch assignments
    const branchAccess = await UserBranchAccess.findAll({
      where: { userId },
      include: [{ model: Branch, required: true, where: { companyId } }],
    });

    // Get warehouse assignments
    const warehouseAccess = await UserWarehouseAccess.findAll({
      where: { userId },
      include: [{ model: Warehouse, required: true, where: { companyId } }],
    });

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        mobile: user.mobile,
        name: user.name,
        isActive: user.isActive,
        isSystemAdmin: user.isSystemAdmin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      companyAccess: {
        accessId: access.id,
        roleId: companyRole?.id || null,
        roleKey: companyRole?.key || null,
        roleLabel: companyRole?.label || null,
      },
      directRoles: directRoles.map(dr => ({
        roleId: dr.roleId,
        roleKey: dr.role?.key,
        roleLabel: dr.role?.label,
        assignedAt: dr.assignedAt,
      })),
      branches: branchAccess.map(ba => ({
        branchId: ba.branchId,
        branchName: ba.Branch?.name,
        branchCode: ba.Branch?.code,
        assignedAt: ba.assignedAt,
      })),
      warehouses: warehouseAccess.map(wa => ({
        warehouseId: wa.warehouseId,
        warehouseName: wa.Warehouse?.name,
        warehouseCode: wa.Warehouse?.code,
        branchId: wa.Warehouse?.branchId,
        assignedAt: wa.assignedAt,
      })),
    });
  } catch (e) {
    console.error('user.getUser error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

/**
 * Update user's isActive status
 * PUT /users/:id/status
 */
const setUserStatusValidators = [body('isActive').isBoolean()];

async function setUserStatus(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const userId = Number(req.params.id);
    const companyId = Number(req.companyContext.id);

    // Check user has access to this company
    const access = await UserCompanyAccess.findOne({ where: { userId, companyId } });
    if (!access) return res.status(404).json({ error: 'User not found in this company' });

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Prevent deactivating yourself
    if (userId === req.user.id && !req.body.isActive) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }

    user.isActive = Boolean(req.body.isActive);
    await user.save();

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        isActive: user.isActive,
      },
    });
  } catch (e) {
    console.error('user.setUserStatus error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

/**
 * Assign a direct role to user (via UserRole junction)
 * POST /users/:id/roles
 */
const assignUserDirectRoleValidators = [
  param('id').isInt({ min: 1 }),
  body('roleId').isInt({ min: 1 }),
];

async function assignUserDirectRole(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const userId = Number(req.params.id);
    const roleId = Number(req.body.roleId);
    const companyId = Number(req.companyContext.id);

    // Verify user has access to this company
    const access = await UserCompanyAccess.findOne({ where: { userId, companyId } });
    if (!access) return res.status(404).json({ error: 'User not found in this company' });

    // Verify role belongs to this company
    const role = await Role.findByPk(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (Number(role.companyId) !== companyId) return res.status(400).json({ error: 'Role does not belong to this company' });

    // Check for existing assignment
    const existing = await UserRole.findOne({ where: { userId, roleId } });
    if (existing) return res.status(409).json({ error: 'Role already assigned to user' });

    const assignment = await UserRole.create({
      userId,
      roleId,
      assignedAt: new Date(),
    });

    return res.status(201).json({
      assignment: {
        id: assignment.id,
        userId: assignment.userId,
        roleId: assignment.roleId,
        assignedAt: assignment.assignedAt,
      },
    });
  } catch (e) {
    console.error('user.assignUserDirectRole error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

/**
 * Remove a direct role from user
 * DELETE /users/:id/roles/:roleId
 */
const removeUserDirectRoleValidators = [
  param('id').isInt({ min: 1 }),
  param('roleId').isInt({ min: 1 }),
];

async function removeUserDirectRole(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const userId = Number(req.params.id);
    const roleId = Number(req.params.roleId);
    const companyId = Number(req.companyContext.id);

    // Verify user has access to this company
    const access = await UserCompanyAccess.findOne({ where: { userId, companyId } });
    if (!access) return res.status(404).json({ error: 'User not found in this company' });

    // Verify role belongs to this company
    const role = await Role.findByPk(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (Number(role.companyId) !== companyId) return res.status(400).json({ error: 'Role does not belong to this company' });

    const assignment = await UserRole.findOne({ where: { userId, roleId } });
    if (!assignment) return res.status(404).json({ error: 'Role assignment not found' });

    await assignment.destroy();
    return res.json({ ok: true });
  } catch (e) {
    console.error('user.removeUserDirectRole error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

/**
 * Get all direct roles for a user in current company
 * GET /users/:id/roles
 */
async function getUserDirectRoles(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const userId = Number(req.params.id);
    const companyId = Number(req.companyContext.id);

    // Verify user has access to this company
    const access = await UserCompanyAccess.findOne({ where: { userId, companyId } });
    if (!access) return res.status(404).json({ error: 'User not found in this company' });

    const directRoles = await UserRole.findAll({
      where: { userId },
      include: [{ model: Role, as: 'role', where: { companyId }, required: true }],
    });

    return res.json({
      roles: directRoles.map(dr => ({
        assignmentId: dr.id,
        roleId: dr.roleId,
        roleKey: dr.role?.key,
        roleLabel: dr.role?.label,
        roleDescription: dr.role?.description,
        assignedAt: dr.assignedAt,
      })),
    });
  } catch (e) {
    console.error('user.getUserDirectRoles error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

module.exports = {
  assignUserToCompany,
  assignUserToCompanyValidators: assignUserCompanyValidators,
  assignUserToBranch,
  assignUserToBranchValidators: assignUserBranchValidators,
  createCompanyUserValidators,
  createCompanyUser,
  updateUserValidators,
  updateUser,
  setUserRoleValidators,
  setUserRole,
  setUserBranchesValidators,
  setUserBranches,
  setUserWarehousesValidators,
  setUserWarehouses,
  removeUserFromCompany,
  listCompanyUsers,
  getUser,
  setUserStatusValidators,
  setUserStatus,
  assignUserDirectRoleValidators,
  assignUserDirectRole,
  removeUserDirectRoleValidators,
  removeUserDirectRole,
  getUserDirectRoles,
};
