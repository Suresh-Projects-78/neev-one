const express = require('express');
const router = express.Router();
const { authenticateJWT, requireCompanyContext } = require('../middleware/auth');

// Sample protected ledger endpoint demonstrating company/branch scoping
router.get('/ledger', authenticateJWT, requireCompanyContext, async (req, res) => {
  // In real implementation, query ledger entries filtered by companyId and optionally branchId
  const companyId = req.companyContext?.id;
  const branchId = req.branchContext?.id || null;
  // enforce that returned data only belongs to this company
  return res.json({ ok: true, companyId, branchId, message: 'This is a company-scoped ledger sample' });
});

module.exports = router;
