const { Company, Branch } = require('../models');
const accessService = require('../services/accessService');

async function getMyCompanies(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    // system admin can see all companies
    if (req.user.isSystemAdmin) {
      const all = await Company.findAll();
      return res.json({ companies: all.map((c) => ({ company: c, roleKey: 'admin' })) });
    }
    const list = await accessService.getAccessibleCompanies(req.user.id);
    return res.json({ companies: list });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function getBranches(req, res) {
  try {
    const companyId = req.query.companyId || req.body.companyId || (req.companyContext && req.companyContext.id);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const branches = await accessService.getBranchesForCompany(companyId);
    return res.json({ branches });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getMyCompanies, getBranches };
