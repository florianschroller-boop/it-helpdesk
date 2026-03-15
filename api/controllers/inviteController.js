const crypto = require('crypto');
const { query, queryOne, insert } = require('../config/database');

// GET /api/invites
async function list(req, res) {
  try {
    const keys = await query(
      'SELECT k.*, u.name as created_by_name FROM invite_keys k LEFT JOIN users u ON k.created_by = u.id ORDER BY k.created_at DESC'
    );
    res.json({ success: true, data: keys });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/invites
async function create(req, res) {
  try {
    const { label, max_uses, expires_at } = req.body;
    const keyCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    const result = await insert(
      'INSERT INTO invite_keys (key_code, label, max_uses, expires_at, created_by) VALUES (?, ?, ?, ?, ?)',
      [keyCode, label || null, max_uses || null, expires_at || null, req.user.id]
    );

    const key = await queryOne('SELECT * FROM invite_keys WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: key });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/invites/:id
async function update(req, res) {
  try {
    const { label, max_uses, expires_at, active } = req.body;
    const fields = []; const params = [];
    if (label !== undefined) { fields.push('label=?'); params.push(label); }
    if (max_uses !== undefined) { fields.push('max_uses=?'); params.push(max_uses || null); }
    if (expires_at !== undefined) { fields.push('expires_at=?'); params.push(expires_at || null); }
    if (active !== undefined) { fields.push('active=?'); params.push(active ? 1 : 0); }
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'Keine Änderungen' });
    params.push(req.params.id);
    await insert(`UPDATE invite_keys SET ${fields.join(',')} WHERE id=?`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// DELETE /api/invites/:id
async function remove(req, res) {
  try {
    await insert('DELETE FROM invite_keys WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { list, create, update, remove };
