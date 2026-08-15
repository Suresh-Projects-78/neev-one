const express = require('express');
const router = express.Router();
const { getMyCompanies, getBranches } = require('../controllers/contextController');
const { authenticateJWT, requireCompanyContext } = require('../middleware/auth');

router.get('/companies', authenticateJWT, getMyCompanies);
router.get('/branches', authenticateJWT, requireCompanyContext, getBranches);

module.exports = router;
