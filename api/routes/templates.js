const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin', 'agent'));

router.get('/', templateController.list);
router.get('/suggest', templateController.suggest);
router.get('/:id', templateController.getById);
router.post('/', templateController.create);
router.put('/:id', templateController.update);
router.delete('/:id', requireRole('admin'), templateController.remove);

module.exports = router;
