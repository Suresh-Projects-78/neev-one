const jwt = require('jsonwebtoken');
const config = require('../config');
const { User, Company, UserCompanyAccess, Role } = require('../models');
const { hasPermission } = require('../services/permissionCatalog');

// Authenticate JWT and attach req.user with accountId
async function authenticateJWT(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findByPk(payload.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found or token invalid' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Attach user info including accountId for data isolation
    req.user = { 
      id: user.id, 
      accountId: user.accountId,
      email: user.email, 
      name: user.name, 
      isSystemAdmin: user.isSystemAdmin,
    };

    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Company context middleware: set req.companyContext and req.companyRole based on header
// Also validates that user has access to the company and sets orgId
async function requireCompanyContext(req, res, next) {
  const companyId = req.headers['x-company-id'] || req.body.companyId || req.query.companyId;
  
  if (!companyId) {
    return res.status(400).json({ error: 'Company context required. Please select a company.' });
  }

  const company = await Company.findByPk(companyId);
  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }

  // Check user access to this company
  const access = await UserCompanyAccess.findOne({ 
    where: { userId: req.user.id, companyId: company.id } 
  });

  if (!access && !req.user.isSystemAdmin) {
    return res.status(403).json({ error: 'You do not have access to this company' });
  }

  // Set company context with orgId
  req.companyContext = {
    id: company.id,
    orgId: company.orgId,
    name: company.name,
    ownerAccountId: company.ownerAccountId,
  };

  // Attach role + permissions
  if (req.user.isSystemAdmin) {
    req.companyRole = 'Admin';
    req.companyRoleKey = 'admin';
    req.companyPermissions = ['*'];
    req.companyRoleId = null;
  } else {
    const roleRecord = access?.roleId ? await Role.findByPk(access.roleId) : null;
    req.companyRole = roleRecord ? roleRecord.label : null;
    req.companyRoleKey = roleRecord ? roleRecord.key : null;
    req.companyPermissions = roleRecord && Array.isArray(roleRecord.permissions) ? roleRecord.permissions : [];
    req.companyRoleId = roleRecord ? roleRecord.id : null;
  }

  next();
}

// Permission check middleware
function requirePermission(permissionKey) {
  return (req, res, next) => {
    const perms = req.companyPermissions;
    if (hasPermission(perms, permissionKey)) return next();
    return res.status(403).json({ error: 'You do not have permission to perform this action' });
  };
}

/**
 * Data Isolation Middleware
 * Ensures queries are filtered by accountId and/or orgId
 * Use this to attach isolation context to the request
 */
function requireDataIsolation(req, res, next) {
  // Ensure we have the necessary context for data isolation
  if (!req.user?.accountId) {
    return res.status(401).json({ error: 'Account context required for data access' });
  }

  // Attach isolation helpers to request
  req.isolation = {
    accountId: req.user.accountId,
    userId: req.user.id,
    orgId: req.companyContext?.orgId || null,
    companyId: req.companyContext?.id || null,
  };

  next();
}

/**
 * Helper function to build WHERE clause for data isolation
 * @param {Object} req - Express request with user and companyContext
 * @param {Object} additionalWhere - Additional WHERE conditions
 * @returns {Object} Sequelize WHERE clause
 */
function getIsolatedWhere(req, additionalWhere = {}) {
  const where = { ...additionalWhere };
  
  // Always filter by companyId when company context exists
  if (req.companyContext?.id) {
    where.companyId = req.companyContext.id;
  }

  return where;
}

/**
 * Validates that a record belongs to the current user's company
 * @param {Object} record - Database record
 * @param {Object} req - Express request
 * @returns {Boolean} True if record belongs to user's company
 */
function validateRecordOwnership(record, req) {
  if (!record) return false;
  if (req.user?.isSystemAdmin) return true;
  if (!req.companyContext?.id) return false;
  return Number(record.companyId) === Number(req.companyContext.id);
}

module.exports = { 
  authenticateJWT, 
  requireCompanyContext, 
  requirePermission,
  requireDataIsolation,
  getIsolatedWhere,
  validateRecordOwnership,
};
