const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');

console.log('[MY-ASSETS] Route file loaded');
router.get('/', authenticate, async (req, res) => {
  console.log('[MY-ASSETS] Route hit by', req.user?.email);
  try {
    const assets = await query(
      'SELECT a.*, u.name as assigned_to_name FROM assets a LEFT JOIN users u ON a.assigned_to_user_id = u.id WHERE a.assigned_to_user_id = ? ORDER BY a.name',
      [req.user.id]
    );
    res.json({ success: true, data: assets });
  } catch {
    res.json({ success: true, data: [] });
  }
});

module.exports = router;
