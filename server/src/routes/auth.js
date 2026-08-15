const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');
const { authenticateJWT } = require('../middleware/auth');

router.post('/signup', auth.signupValidators, auth.signup);
router.post('/login', auth.loginValidators, auth.login);
router.post('/setup-company', authenticateJWT, auth.setupCompanyValidators, auth.setupCompany);
router.post('/forgot-password', auth.forgotPasswordValidators, auth.forgotPassword);
router.post('/reset-password', auth.resetPasswordValidators, auth.resetPassword);
router.get('/me', authenticateJWT, auth.getCurrentUser);

module.exports = router;
