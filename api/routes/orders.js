const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', orderController.list);
router.post('/', orderController.create);
router.get('/:id', orderController.getById);
router.put('/:id/step', requireRole('admin', 'agent'), orderController.advanceStep);
router.put('/:id/reject', requireRole('admin', 'agent'), orderController.reject);

module.exports = router;
