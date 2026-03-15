const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/onboardingController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// Config (admin only for write)
router.get('/config', ctrl.getConfig);
router.get('/config/all', requireRole('admin'), ctrl.getAllConfig);
router.post('/config', requireRole('admin'), ctrl.createConfigItem);
router.put('/config/:id', requireRole('admin'), ctrl.updateConfigItem);
router.delete('/config/:id', requireRole('admin'), ctrl.deleteConfigItem);

// Requests
router.get('/requests', ctrl.listRequests);
router.post('/requests', ctrl.createRequest);
router.get('/for-ticket/:ticketId', ctrl.getForTicket);
router.get('/requests/:id', ctrl.getRequest);
router.put('/requests/:id/assign', requireRole('admin', 'agent'), ctrl.assignRequest);

// Checklist
router.put('/checklist/:id', requireRole('admin', 'agent'), ctrl.toggleChecklistItem);

module.exports = router;
