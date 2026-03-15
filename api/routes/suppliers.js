const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/supplierController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin', 'agent'));

router.get('/', ctrl.list);
router.get('/quote-template', ctrl.getQuoteTemplate);
router.get('/:id', ctrl.getById);
router.post('/', requireRole('admin'), ctrl.create);
router.put('/:id', ctrl.update);
router.post('/:id/quote', ctrl.sendQuote);

module.exports = router;
