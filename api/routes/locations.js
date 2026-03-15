const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin', 'agent'));

router.get('/', locationController.list);
router.post('/', requireRole('admin'), locationController.create);
router.get('/:slug', locationController.getBySlug);
router.put('/:id', requireRole('admin'), locationController.update);
router.delete('/:id', requireRole('admin'), locationController.remove);

module.exports = router;
