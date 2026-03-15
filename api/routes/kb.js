const express = require('express');
const router = express.Router();
const kbController = require('../controllers/kbController');
const { authenticate, requireRole } = require('../middleware/auth');

router.get('/categories', authenticate, kbController.listCategories);
router.get('/articles', authenticate, kbController.listArticles);
router.get('/search', authenticate, kbController.search);
router.get('/articles/:slug', authenticate, kbController.getBySlug);
router.post('/articles', authenticate, requireRole('admin', 'agent'), kbController.createArticle);
router.put('/articles/:id', authenticate, requireRole('admin', 'agent'), kbController.updateArticle);
router.post('/articles/:id/vote', authenticate, kbController.vote);

module.exports = router;
