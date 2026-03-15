const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.get('/me/assets', authenticate, authController.myAssets);
router.get('/branding', authController.getBranding);
router.post('/reset-password', authController.resetPassword);
router.post('/change-password', authenticate, authController.changePassword);

// Microsoft OAuth
router.get('/microsoft', authController.microsoftRedirect);
router.get('/microsoft/callback', authController.microsoftCallback);
router.get('/microsoft/status', authController.microsoftStatus);

module.exports = router;
