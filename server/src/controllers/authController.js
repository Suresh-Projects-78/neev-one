const { User, Company, Branch, Role, UserCompanyAccess, UserBranchAccess } = require('../models');
const { hashPassword, verifyPassword, generateJwt } = require('../services/authService');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const config = require('../config');
const emailer = require('../utils/email');

// POST /auth/signup
const signupValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('name').optional().isString().trim(),
  body('mobile').optional().isString().trim(),
];

async function signup(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = req.body.name ? String(req.body.name).trim() : null;
    const mobile = req.body.mobile ? String(req.body.mobile).trim() : null;

    // Check if email already exists
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ 
        error: 'Email already registered',
        hint: 'Please use Login instead, or use Forgot Password if you forgot your password.'
      });
    }

    // Check if mobile already exists (if provided)
    if (mobile) {
      const existingMobile = await User.findOne({ where: { mobile } });
      if (existingMobile) {
        return res.status(409).json({ error: 'Mobile number already in use' });
      }
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({ 
      email, 
      mobile, 
      passwordHash, 
      name,
      isActive: true,
    });

    // Generate JWT with accountId
    const token = generateJwt({ 
      userId: user.id, 
      accountId: user.accountId,
      email: user.email,
    });

    console.log(`[auth] New user signed up: ${email} (Account: ${user.accountId})`);

    return res.json({ 
      token, 
      user: { 
        id: user.id, 
        accountId: user.accountId,
        email: user.email, 
        mobile: user.mobile, 
        name: user.name,
      } 
    });
  } catch (e) {
    console.error('auth.signup error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// POST /auth/login
const loginValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').exists().withMessage('Password is required'),
];

async function login(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      console.log(`[auth] Login failed - user not found: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated. Please contact support.' });
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      console.log(`[auth] Login failed - wrong password for: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Get user's companies for context
    const companyAccess = await UserCompanyAccess.findAll({
      where: { userId: user.id },
      include: [{ model: Company }, { model: Role }],
    });

    const companies = companyAccess.map(ca => ({
      id: ca.Company?.id,
      orgId: ca.Company?.orgId,
      name: ca.Company?.name,
      roleKey: ca.Role?.key,
      roleLabel: ca.Role?.label,
    })).filter(c => c.id);

    // Generate JWT with accountId
    const token = generateJwt({ 
      userId: user.id, 
      accountId: user.accountId,
      email: user.email,
    });

    console.log(`[auth] User logged in: ${email} (Account: ${user.accountId})`);

    return res.json({ 
      token, 
      user: { 
        id: user.id, 
        accountId: user.accountId,
        email: user.email, 
        mobile: user.mobile, 
        name: user.name,
      },
      companies,
    });
  } catch (e) {
    console.error('auth.login error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// POST /auth/setup-company
const setupCompanyValidators = [body('companyName').isString().trim().notEmpty()];

async function setupCompany(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const existingAccess = await UserCompanyAccess.count({ where: { userId: req.user.id } });
    if (existingAccess > 0 && !req.user.isSystemAdmin) {
      return res.status(409).json({ error: 'Company setup already completed' });
    }

    const { companyName } = req.body;
    
    // Get user's accountId
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Create company with owner accountId
    const company = await Company.create({ 
      name: String(companyName).trim(),
      ownerAccountId: user.accountId,
    });
    
    const branch = await Branch.create({ companyId: company.id, name: 'Main' });

    const adminRole = await Role.findOne({ where: { key: 'admin' } });
    if (!adminRole) return res.status(500).json({ error: 'Admin role missing' });

    await UserCompanyAccess.create({ userId: req.user.id, companyId: company.id, roleId: adminRole.id });
    await UserBranchAccess.create({ userId: req.user.id, branchId: branch.id });

    console.log(`[auth] Company created: ${company.name} (Org: ${company.orgId}) by Account: ${user.accountId}`);

    return res.json({ 
      ok: true, 
      company: { 
        id: company.id, 
        orgId: company.orgId,
        name: company.name,
      }, 
      branch: { 
        id: branch.id, 
        name: branch.name,
      },
    });
  } catch (e) {
    console.error('auth.setupCompany error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// POST /auth/forgot-password
const forgotPasswordValidators = [body('email').isEmail().normalizeEmail()];

async function forgotPassword(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ where: { email } });
    
    // Always return success to prevent email enumeration
    if (!user) {
      console.log(`[auth] Password reset requested for non-existent email: ${email}`);
      return res.json({ ok: true, message: 'If an account exists with this email, a reset link has been sent.' });
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + config.passwordResetExpiresMin * 60 * 1000);
    
    user.resetToken = token;
    user.resetTokenExpiry = expiry;
    await user.save();

    // Send email (in dev mode, logs to console)
    await emailer.sendPasswordReset(user.email, token);

    console.log(`[auth] Password reset token generated for: ${email}`);

    return res.json({ 
      ok: true, 
      message: 'If an account exists with this email, a reset link has been sent.',
      // In dev mode, include the token for testing
      ...(process.env.NODE_ENV !== 'production' ? { devToken: token } : {}),
    });
  } catch (e) {
    console.error('auth.forgotPassword error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// POST /auth/reset-password
const resetPasswordValidators = [
  body('token').exists().withMessage('Reset token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

async function resetPassword(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { token, password } = req.body;
    
    const user = await User.findOne({ where: { resetToken: token } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    // Hash new password
    user.passwordHash = await hashPassword(password);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    console.log(`[auth] Password reset completed for: ${user.email}`);

    return res.json({ ok: true, message: 'Password has been reset successfully. You can now login.' });
  } catch (e) {
    console.error('auth.resetPassword error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

// GET /auth/me - Get current user info
async function getCurrentUser(req, res) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Get user's companies
    const companyAccess = await UserCompanyAccess.findAll({
      where: { userId: user.id },
      include: [{ model: Company }, { model: Role }],
    });

    const companies = companyAccess.map(ca => ({
      id: ca.Company?.id,
      orgId: ca.Company?.orgId,
      name: ca.Company?.name,
      roleKey: ca.Role?.key,
      roleLabel: ca.Role?.label,
    })).filter(c => c.id);

    return res.json({
      user: {
        id: user.id,
        accountId: user.accountId,
        email: user.email,
        mobile: user.mobile,
        name: user.name,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      companies,
    });
  } catch (e) {
    console.error('auth.getCurrentUser error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

module.exports = {
  signupValidators,
  signup,
  loginValidators,
  login,
  setupCompanyValidators,
  setupCompany,
  forgotPasswordValidators,
  forgotPassword,
  resetPasswordValidators,
  resetPassword,
  getCurrentUser,
};
