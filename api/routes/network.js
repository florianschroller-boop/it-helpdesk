const express = require('express');
const router = express.Router();
const networkController = require('../controllers/networkController');
const { authenticate, requireRole } = require('../middleware/auth');

// Public status (can be accessed by any authenticated user)
router.get('/status', authenticate, networkController.publicStatus);

// Admin/Agent routes
router.get('/devices', authenticate, requireRole('admin', 'agent'), networkController.listDevices);
router.post('/devices', authenticate, requireRole('admin'), networkController.createDevice);
router.put('/devices/:id', authenticate, requireRole('admin'), networkController.updateDevice);
router.delete('/devices/:id', authenticate, requireRole('admin'), networkController.deleteDevice);
router.get('/devices/:id/status', authenticate, networkController.deviceStatus);
router.post('/ping/:id', authenticate, requireRole('admin', 'agent'), networkController.manualPing);

module.exports = router;
