const bcrypt = require('bcryptjs');
const { query, queryOne, insert } = require('../config/database');

// GET /api/users
async function list(req, res) {
  try {
    const { role, department, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = 'SELECT id, name, email, role, department, location, is_manager, phone, avatar_url, active, created_at FROM users WHERE 1=1';
    const params = [];

    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    if (department) {
      sql += ' AND department = ?';
      params.push(department);
    }
    if (search) {
      sql += ' AND (name LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Count total
    const countSql = sql.replace('SELECT id, name, email, role, department, location, is_manager, phone, avatar_url, active, created_at', 'SELECT COUNT(*) as total');
    const countResult = await queryOne(countSql, params);

    sql += ' ORDER BY name ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const users = await query(sql, params);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.total,
        pages: Math.ceil(countResult.total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// POST /api/users
async function create(req, res) {
  try {
    const { name, email, password, role, department, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, E-Mail und Passwort erforderlich' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Passwort muss mindestens 8 Zeichen lang sein' });
    }

    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ success: false, error: 'E-Mail-Adresse bereits vergeben' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await insert(
      'INSERT INTO users (name, email, password_hash, role, department, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hash, role || 'user', department || null, phone || null]
    );

    const user = await queryOne(
      'SELECT id, name, email, role, department, phone, active, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({ success: true, data: user });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/users/:id
async function getById(req, res) {
  try {
    const user = await queryOne(
      'SELECT id, name, email, role, department, location, is_manager, phone, avatar_url, active, created_at FROM users WHERE id = ?',
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden' });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/users/:id
async function update(req, res) {
  try {
    const { name, email, role, department, location, is_manager, phone, active, password } = req.body;
    const userId = req.params.id;

    const user = await queryOne('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden' });
    }

    if (email) {
      const existing = await queryOne('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
      if (existing) {
        return res.status(409).json({ success: false, error: 'E-Mail-Adresse bereits vergeben' });
      }
    }

    let sql = 'UPDATE users SET ';
    const fields = [];
    const params = [];

    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (email !== undefined) { fields.push('email = ?'); params.push(email); }
    if (role !== undefined) { fields.push('role = ?'); params.push(role); }
    if (department !== undefined) { fields.push('department = ?'); params.push(department); }
    if (location !== undefined) { fields.push('location = ?'); params.push(location || null); }
    if (is_manager !== undefined) { fields.push('is_manager = ?'); params.push(is_manager ? 1 : 0); }
    if (phone !== undefined) { fields.push('phone = ?'); params.push(phone); }
    if (active !== undefined) { fields.push('active = ?'); params.push(active ? 1 : 0); }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      fields.push('password_hash = ?');
      params.push(hash);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'Keine Änderungen angegeben' });
    }

    sql += fields.join(', ') + ' WHERE id = ?';
    params.push(userId);

    await insert(sql, params);

    const updated = await queryOne(
      'SELECT id, name, email, role, department, location, is_manager, phone, avatar_url, active, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// DELETE /api/users/:id
async function remove(req, res) {
  try {
    const userId = req.params.id;

    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ success: false, error: 'Eigenen Account kann man nicht löschen' });
    }

    const user = await queryOne('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden' });
    }

    // Soft-deactivate instead of hard delete to preserve references
    await insert('UPDATE users SET active = 0 WHERE id = ?', [userId]);

    res.json({ success: true, message: 'Benutzer deaktiviert' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { list, create, getById, update, remove };
