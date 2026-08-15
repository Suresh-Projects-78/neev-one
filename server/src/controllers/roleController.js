const { Role, UserCompanyAccess, UserRole, User } = require('../models');
const { body, param, validationResult } = require('express-validator');
const { CATALOG, normalizePermissions } = require('../services/permissionCatalog');

function isAdmin(req) {
  return Boolean(req.user?.isSystemAdmin || req.companyRoleKey === 'admin' || req.companyRole === 'Admin');
}

function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function ensureUniqueRoleKey(baseKey) {
  let key = baseKey;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await Role.findOne({ where: { key } });
    if (!exists) return key;
    suffix += 1;
    key = `${baseKey}-${suffix}`;
  }
}

async function listCompanyRoles(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const companyId = Number(req.companyContext.id);
    const roles = await Role.findAll({
      where: {
        // include system roles and company custom roles
        // sequelize treats null as "IS NULL" when using plain object
        // so we have to fetch all and filter below, or use Op.or.
      },
    });

    const filtered = roles
      .filter((r) => r.companyId == null || Number(r.companyId) === companyId)
      .map((r) => ({
        id: r.id,
        key: r.key,
        label: r.label,
        companyId: r.companyId,
        isSystem: r.isSystem,
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
      }))
      .sort((a, b) => {
        if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
        return String(a.label || '').localeCompare(String(b.label || ''));
      });

    return res.json({ roles: filtered });
  } catch (e) {
    console.error('role.listCompanyRoles error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const createRoleValidators = [
  body('label').isString().trim().notEmpty(),
  body('description').optional().isString().trim(),
  body('permissions').optional(),
];

async function createRole(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const companyId = Number(req.companyContext.id);
    const label = String(req.body.label || '').trim();
    const description = req.body.description ? String(req.body.description).trim() : null;
    const requestedPermissions = req.body.permissions;
    const permissions = normalizePermissions(requestedPermissions);

    const baseKey = `c${companyId}:${slugify(label) || 'role'}`;
    const key = await ensureUniqueRoleKey(baseKey);

    const role = await Role.create({
      key,
      label,
      description,
      companyId,
      permissions,
      isSystem: false,
      isActive: true,
    });

    return res.json({
      role: {
        id: role.id,
        key: role.key,
        label: role.label,
        description: role.description || '',
        companyId: role.companyId,
        isSystem: role.isSystem,
        isActive: role.isActive,
        permissions: role.permissions,
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
    });
  } catch (e) {
    console.error('role.createRole error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const updateRoleValidators = [
  body('label').optional().isString().trim().notEmpty(),
  body('description').optional().isString().trim(),
  body('permissions').optional(),
  body('isActive').optional().isBoolean(),
];

async function updateRole(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const companyId = Number(req.companyContext.id);
    const roleId = Number(req.params.id);

    const role = await Role.findByPk(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.isSystem) return res.status(400).json({ error: 'System role cannot be edited' });
    if (Number(role.companyId) !== companyId) return res.status(403).json({ error: 'Forbidden' });

    if (req.body.label != null) role.label = String(req.body.label || '').trim();
    if (req.body.description !== undefined) role.description = req.body.description ? String(req.body.description).trim() : null;
    if (req.body.permissions != null) role.permissions = normalizePermissions(req.body.permissions);
    if (req.body.isActive != null) role.isActive = Boolean(req.body.isActive);

    await role.save();

    return res.json({
      role: {
        id: role.id,
        key: role.key,
        label: role.label,
        description: role.description || '',
        companyId: role.companyId,
        isSystem: role.isSystem,
        isActive: role.isActive,
        permissions: Array.isArray(role.permissions) ? role.permissions : [],
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      },
    });
  } catch (e) {
    console.error('role.updateRole error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

async function deleteRole(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const companyId = Number(req.companyContext.id);
    const roleId = Number(req.params.id);

    const role = await Role.findByPk(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.isSystem) return res.status(400).json({ error: 'System role cannot be deleted' });
    if (Number(role.companyId) !== companyId) return res.status(403).json({ error: 'Forbidden' });

    // Check if role is assigned via UserCompanyAccess
    const assignedCount = await UserCompanyAccess.count({ where: { companyId, roleId: role.id } });
    if (assignedCount > 0) {
      return res.status(409).json({ error: 'Role is assigned to users. Reassign those users before deleting.' });
    }

    // Also check direct UserRole assignments
    const directAssignments = await UserRole.count({ where: { roleId: role.id } });
    if (directAssignments > 0) {
      return res.status(409).json({ error: 'Role is directly assigned to users. Remove those assignments first.' });
    }

    await role.destroy();
    return res.json({ ok: true });
  } catch (e) {
    console.error('role.deleteRole error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

/* ------------------------------ Role-User Assignment Functions ------------------------------ */

const assignRoleValidators = [
  param('id').isInt({ min: 1 }),
  body('userId').isInt({ min: 1 }),
];

/**
 * Assign a role directly to a user (via UserRole junction)
 * POST /roles/:id/users
 */
async function assignRoleToUser(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const companyId = Number(req.companyContext.id);
    const roleId = Number(req.params.id);
    const userId = Number(req.body.userId);

    // Verify role exists and belongs to this company
    const role = await Role.findByPk(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (Number(role.companyId) !== companyId) return res.status(403).json({ error: 'Role does not belong to this company' });

    // Verify user exists and has access to this company
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userAccess = await UserCompanyAccess.findOne({ where: { userId, companyId } });
    if (!userAccess) return res.status(400).json({ error: 'User does not have access to this company' });

    // Check if assignment already exists
    const existing = await UserRole.findOne({ where: { userId, roleId } });
    if (existing) {
      return res.status(409).json({ error: 'Role already assigned to this user' });
    }

    // Create assignment
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
      user: { id: user.id, name: user.name, email: user.email },
      role: { id: role.id, key: role.key, label: role.label },
    });
  } catch (e) {
    console.error('role.assignRoleToUser error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const unassignRoleValidators = [
  param('id').isInt({ min: 1 }),
  param('userId').isInt({ min: 1 }),
];

/**
 * Unassign a role from a user
 * DELETE /roles/:id/users/:userId
 */
async function unassignRoleFromUser(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const companyId = Number(req.companyContext.id);
    const roleId = Number(req.params.id);
    const userId = Number(req.params.userId);

    // Verify role exists and belongs to this company
    const role = await Role.findByPk(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (Number(role.companyId) !== companyId) return res.status(403).json({ error: 'Role does not belong to this company' });

    // Find and delete assignment
    const assignment = await UserRole.findOne({ where: { userId, roleId } });
    if (!assignment) {
      return res.status(404).json({ error: 'Role assignment not found' });
    }

    await assignment.destroy();
    return res.json({ ok: true });
  } catch (e) {
    console.error('role.unassignRoleFromUser error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

/**
 * Get all users assigned to a specific role
 * GET /roles/:id/users
 */
async function getRoleUsers(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });

    const companyId = Number(req.companyContext.id);
    const roleId = Number(req.params.id);

    // Verify role exists and belongs to this company
    const role = await Role.findByPk(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (Number(role.companyId) !== companyId) return res.status(403).json({ error: 'Role does not belong to this company' });

    // Get users with direct role assignment
    const directAssignments = await UserRole.findAll({
      where: { roleId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'isActive'] }],
    });

    // Also get users who have this role via UserCompanyAccess
    const companyAssignments = await UserCompanyAccess.findAll({
      where: { companyId, roleId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'isActive'] }],
    });

    const usersMap = new Map();

    // Add users from direct assignments
    directAssignments.forEach(a => {
      if (a.user) {
        usersMap.set(a.user.id, {
          id: a.user.id,
          name: a.user.name,
          email: a.user.email,
          isActive: a.user.isActive,
          assignmentType: 'direct',
          assignedAt: a.assignedAt,
        });
      }
    });

    // Add users from company assignments (mark as 'company' type)
    companyAssignments.forEach(a => {
      if (a.user && !usersMap.has(a.user.id)) {
        usersMap.set(a.user.id, {
          id: a.user.id,
          name: a.user.name,
          email: a.user.email,
          isActive: a.user.isActive,
          assignmentType: 'company',
          assignedAt: a.createdAt,
        });
      }
    });

    return res.json({
      role: { id: role.id, key: role.key, label: role.label },
      users: Array.from(usersMap.values()),
    });
  } catch (e) {
    console.error('role.getRoleUsers error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

async function listPermissionCatalog(req, res) {
  try {
    if (!req.companyContext) return res.status(400).json({ error: 'Company context required' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden - admin only' });
    return res.json({ permissions: CATALOG });
  } catch (e) {
    console.error('role.listPermissionCatalog error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

module.exports = {
  listCompanyRoles,
  listPermissionCatalog,
  createRoleValidators,
  createRole,
  updateRoleValidators,
  updateRole,
  deleteRole,
  assignRoleValidators,
  assignRoleToUser,
  unassignRoleValidators,
  unassignRoleFromUser,
  getRoleUsers,
};
