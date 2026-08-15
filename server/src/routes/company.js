const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/companyController');
const { authenticateJWT } = require('../middleware/auth');

router.post('/', authenticateJWT, ctrl.createCompanyValidators, ctrl.createCompany);
module.exports = router;
