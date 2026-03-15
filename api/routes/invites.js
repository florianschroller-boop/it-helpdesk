const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inviteController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin', 'agent'));

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', requireRole('admin'), ctrl.remove);

module.exports = router;
