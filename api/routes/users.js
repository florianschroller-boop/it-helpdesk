const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', requireRole('admin', 'agent'), userController.list);
router.post('/', requireRole('admin'), userController.create);
router.get('/:id', requireRole('admin', 'agent'), userController.getById);
router.put('/:id', requireRole('admin'), userController.update);
router.delete('/:id', requireRole('admin'), userController.remove);

module.exports = router;
