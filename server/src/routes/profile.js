const express = require('express');
const router = express.Router();
const { authenticateJWT, requireCompanyContext } = require('../middleware/auth');
const ctrl = require('../controllers/profileController');

router.get('/me', authenticateJWT, ctrl.getMyProfile);
router.put('/me', authenticateJWT, ctrl.updateMyProfileValidators, ctrl.updateMyProfile);

router.get('/company', authenticateJWT, requireCompanyContext, ctrl.getCompanyProfile);
router.put('/company', authenticateJWT, requireCompanyContext, ctrl.updateCompanyProfileValidators, ctrl.updateCompanyProfile);

module.exports = router;
