const { User, Company, UserCompanyAccess, Role } = require('../models');
const { body, validationResult } = require('express-validator');

const updateMyProfileValidators = [
  body('name').optional().isString(),
  body('profile').optional().isObject(),
];

async function getMyProfile(req, res) {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSystemAdmin: user.isSystemAdmin,
        profile: user.profile || {},
      },
    });
  } catch (e) {
    console.error('profile.getMyProfile error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

async function updateMyProfile(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, profile } = req.body || {};
    if (typeof name === 'string') user.name = name;
    if (profile && typeof profile === 'object') user.profile = profile;
    await user.save();

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSystemAdmin: user.isSystemAdmin,
        profile: user.profile || {},
      },
    });
  } catch (e) {
    console.error('profile.updateMyProfile error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

const updateCompanyProfileValidators = [
  body('companyProfile').optional().isObject(),
  body('userCompanyProfile').optional().isObject(),
];

async function getCompanyProfile(req, res) {
  try {
    const company = req.companyContext ? await Company.findByPk(req.companyContext.id) : null;
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const access = await UserCompanyAccess.findOne({ where: { userId: req.user.id, companyId: company.id } });
    let roleKey = null;
    if (req.user.isSystemAdmin) roleKey = 'admin';
    else if (access) {
      const role = await Role.findByPk(access.roleId);
      roleKey = role ? role.key : null;
    }

    return res.json({
      company: {
        id: company.id,
        name: company.name,
        description: company.description,
        profile: company.profile || {},
      },
      userCompany: {
        roleKey,
        profile: access ? (access.profile || {}) : {},
      },
    });
  } catch (e) {
    console.error('profile.getCompanyProfile error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

async function updateCompanyProfile(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const company = req.companyContext ? await Company.findByPk(req.companyContext.id) : null;
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const { companyProfile, userCompanyProfile } = req.body || {};

    // Any user with access can update their own per-company profile.
    const access = await UserCompanyAccess.findOne({ where: { userId: req.user.id, companyId: company.id } });
    if (!access && !req.user.isSystemAdmin) return res.status(403).json({ error: 'No access to this company' });

    if (userCompanyProfile && typeof userCompanyProfile === 'object') {
      if (!access && req.user.isSystemAdmin) {
        // system admin might not have explicit access row
      } else if (access) {
        access.profile = userCompanyProfile;
        await access.save();
      }
    }

    // Only company admin/system admin can update company profile.
    const canUpdateCompany = req.user.isSystemAdmin || req.companyRoleKey === 'admin';
    if (companyProfile && typeof companyProfile === 'object') {
      if (!canUpdateCompany) return res.status(403).json({ error: 'Forbidden - admin only' });
      company.profile = companyProfile;
      await company.save();
    }

    return getCompanyProfile(req, res);
  } catch (e) {
    console.error('profile.updateCompanyProfile error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  updateMyProfileValidators,
  getCompanyProfile,
  updateCompanyProfile,
  updateCompanyProfileValidators,
};
