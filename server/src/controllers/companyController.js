const { Company } = require('../models');
const { body, validationResult } = require('express-validator');

const createCompanyValidators = [body('name').isString().notEmpty()];

async function createCompany(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    // Only system admins can create companies (backend enforced)
    if (!req.user || !req.user.isSystemAdmin) return res.status(403).json({ error: 'Forbidden' });
    const { name, description } = req.body;
    const c = await Company.create({ name, description });
    return res.json({ company: c });
  } catch (e) {
    console.error('company.createCompany error', e && e.stack ? e.stack : e);
    return res.status(500).json({
      error: 'Server error',
      ...(process.env.NODE_ENV !== 'production' ? { details: String(e?.message || e) } : {}),
    });
  }
}

module.exports = { createCompany, createCompanyValidators };
