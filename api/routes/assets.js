const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', requireRole('admin', 'agent'), assetController.list);
router.get('/stats', requireRole('admin', 'agent'), assetController.stats);
router.get('/export', requireRole('admin', 'agent'), assetController.exportCsv);
router.post('/', requireRole('admin', 'agent'), assetController.create);
router.post('/import-csv', requireRole('admin', 'agent'), assetController.importCsv);
router.get('/:id', authenticate, assetController.getById);
router.put('/:id', requireRole('admin', 'agent'), assetController.update);
router.delete('/:id', requireRole('admin'), assetController.remove);

module.exports = router;
