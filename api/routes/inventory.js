const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventoryController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin', 'agent'));

router.get('/', ctrl.list);
router.get('/stats', ctrl.stats);
router.get('/warnings', ctrl.warnings);
router.get('/custom-fields', ctrl.getCustomFields);
router.post('/custom-fields', requireRole('admin'), ctrl.createCustomField);
router.put('/custom-fields/:id', requireRole('admin'), ctrl.updateCustomField);
router.delete('/custom-fields/:id', requireRole('admin'), ctrl.deleteCustomField);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.post('/:id/stock', ctrl.adjustStock);
router.get('/:id/movements', ctrl.getMovements);

module.exports = router;
