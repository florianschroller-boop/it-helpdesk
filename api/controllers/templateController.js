const { query, queryOne, insert } = require('../config/database');

// GET /api/templates
async function list(req, res) {
  try {
    const { category, search, active_only } = req.query;
    let sql = 'SELECT t.*, u.name as created_by_name FROM response_templates t LEFT JOIN users u ON t.created_by = u.id WHERE 1=1';
    const params = [];

    if (active_only !== 'false') {
      sql += ' AND t.active = 1';
    }
    if (category) {
      sql += ' AND (t.category = ? OR t.category IS NULL)';
      params.push(category);
    }
    if (search) {
      sql += ' AND (t.title LIKE ? OR t.content LIKE ? OR t.tags LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY t.sort_order, t.title';
    const templates = await query(sql, params);

    res.json({ success: true, data: templates });
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// GET /api/templates/suggest?category=Hardware&title=Drucker+druckt+nicht
async function suggest(req, res) {
  try {
    const { category, title } = req.query;

    // 1. Category-matching templates
    let sql = "SELECT * FROM response_templates WHERE active = 1 AND (category = ? OR category IS NULL) ORDER BY CASE WHEN category = ? THEN 0 ELSE 1 END, sort_order";
    const params = [category || '', category || ''];
    let templates = await query(sql, params);

    // 2. Score by tag matching against ticket title
    if (title) {
      const titleWords = title.toLowerCase().split(/\s+/);
      templates = templates.map(t => {
        const tags = (t.tags || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        let score = 0;
        // Category match bonus
        if (t.category && t.category === category) score += 10;
        // Tag-word overlap
        for (const tag of tags) {
          for (const word of titleWords) {
            if (word.includes(tag) || tag.includes(word)) score += 5;
          }
        }
        return { ...t, _score: score };
      });

      // Sort by score (highest first), then by sort_order
      templates.sort((a, b) => b._score - a._score || a.sort_order - b.sort_order);
    }

    res.json({ success: true, data: templates });
  } catch (err) {
    console.error('Suggest templates error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/templates/:id
async function getById(req, res) {
  try {
    const template = await queryOne('SELECT * FROM response_templates WHERE id = ?', [req.params.id]);
    if (!template) return res.status(404).json({ success: false, error: 'Vorlage nicht gefunden' });
    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/templates
async function create(req, res) {
  try {
    const { title, content, category, tags, sort_order } = req.body;
    if (!title || !content) return res.status(400).json({ success: false, error: 'Titel und Inhalt erforderlich' });

    const result = await insert(
      'INSERT INTO response_templates (title, content, category, tags, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [title, content, category || null, tags || null, sort_order || 0, req.user.id]
    );

    const template = await queryOne('SELECT * FROM response_templates WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: template });
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/templates/:id
async function update(req, res) {
  try {
    const { title, content, category, tags, sort_order, active } = req.body;
    const id = req.params.id;

    const fields = [];
    const params = [];
    if (title !== undefined) { fields.push('title = ?'); params.push(title); }
    if (content !== undefined) { fields.push('content = ?'); params.push(content); }
    if (category !== undefined) { fields.push('category = ?'); params.push(category || null); }
    if (tags !== undefined) { fields.push('tags = ?'); params.push(tags || null); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order); }
    if (active !== undefined) { fields.push('active = ?'); params.push(active ? 1 : 0); }

    if (fields.length === 0) return res.status(400).json({ success: false, error: 'Keine Änderungen' });

    params.push(id);
    await insert(`UPDATE response_templates SET ${fields.join(', ')} WHERE id = ?`, params);

    const template = await queryOne('SELECT * FROM response_templates WHERE id = ?', [id]);
    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// DELETE /api/templates/:id
async function remove(req, res) {
  try {
    await insert('DELETE FROM response_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { list, suggest, getById, create, update, remove };
