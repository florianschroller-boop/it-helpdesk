const { query, queryOne, insert } = require('../config/database');

// GET /api/kb/categories
async function listCategories(req, res) {
  try {
    const categories = await query('SELECT * FROM kb_categories ORDER BY sort_order, name');
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/kb/articles
async function listArticles(req, res) {
  try {
    const { category, tag, search, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const selectFields = 'SELECT a.*, c.name as category_name, u.name as author_name';
    const fromClause = ' FROM kb_articles a LEFT JOIN kb_categories c ON a.category_id = c.id LEFT JOIN users u ON a.author_id = u.id';
    let where = ' WHERE 1=1';
    const params = [];

    // Users only see published articles
    if (!req.user || req.user.role === 'user') {
      where += " AND a.status = 'published'";
    } else if (status) {
      where += ' AND a.status = ?'; params.push(status);
    }

    if (category) {
      where += ' AND (c.slug = ? OR c.id = ?)'; params.push(category, category);
    }
    if (tag) {
      where += ' AND a.id IN (SELECT article_id FROM kb_tags WHERE tag = ?)'; params.push(tag);
    }
    if (search) {
      where += ' AND MATCH(a.title, a.content_html) AGAINST(? IN BOOLEAN MODE)'; params.push(search + '*');
    }

    const countSql = `SELECT COUNT(*) as total${fromClause}${where}`;
    const total = await queryOne(countSql, params);

    let sql = selectFields + fromClause + where;
    sql += ' ORDER BY a.updated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    const articles = await query(sql, params);

    // Get tags for each article
    for (const article of articles) {
      const tags = await query('SELECT tag FROM kb_tags WHERE article_id = ?', [article.id]);
      article.tags = tags.map(t => t.tag);
    }

    res.json({ success: true, data: articles, pagination: { page: parseInt(page), limit: parseInt(limit), total: total.total, pages: Math.ceil(total.total / parseInt(limit)) } });
  } catch (err) {
    console.error('List KB articles error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/kb/articles/:slug
async function getBySlug(req, res) {
  try {
    const article = await queryOne(
      `SELECT a.*, c.name as category_name, u.name as author_name
       FROM kb_articles a
       LEFT JOIN kb_categories c ON a.category_id = c.id
       LEFT JOIN users u ON a.author_id = u.id
       WHERE a.slug = ? OR a.id = ?`,
      [req.params.slug, req.params.slug]
    );

    if (!article) return res.status(404).json({ success: false, error: 'Artikel nicht gefunden' });

    // Increment views
    await insert('UPDATE kb_articles SET views = views + 1 WHERE id = ?', [article.id]);

    // Get tags
    const tags = await query('SELECT tag FROM kb_tags WHERE article_id = ?', [article.id]);
    article.tags = tags.map(t => t.tag);

    // Related articles (same category)
    article.related = await query(
      "SELECT id, title, slug FROM kb_articles WHERE category_id = ? AND id != ? AND status = 'published' LIMIT 5",
      [article.category_id, article.id]
    );

    res.json({ success: true, data: article });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/kb/articles
async function createArticle(req, res) {
  try {
    const { title, content_html, category_id, status, tags } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Titel erforderlich' });

    const slug = title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '').substring(0, 200);

    // Ensure unique slug
    let finalSlug = slug;
    let counter = 1;
    while (await queryOne('SELECT id FROM kb_articles WHERE slug = ?', [finalSlug])) {
      finalSlug = `${slug}-${counter++}`;
    }

    const result = await insert(
      'INSERT INTO kb_articles (title, slug, content_html, category_id, author_id, status) VALUES (?, ?, ?, ?, ?, ?)',
      [title, finalSlug, content_html || '', category_id || null, req.user.id, status || 'draft']
    );

    // Insert tags
    if (tags && Array.isArray(tags)) {
      for (const tag of tags) {
        if (tag.trim()) await insert('INSERT INTO kb_tags (article_id, tag) VALUES (?, ?)', [result.insertId, tag.trim()]);
      }
    }

    const article = await queryOne('SELECT * FROM kb_articles WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: article });
  } catch (err) {
    console.error('Create KB article error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/kb/articles/:id
async function updateArticle(req, res) {
  try {
    const { title, content_html, category_id, status, tags } = req.body;
    const id = req.params.id;

    const fields = [];
    const params = [];
    if (title !== undefined) { fields.push('title = ?'); params.push(title); }
    if (content_html !== undefined) { fields.push('content_html = ?'); params.push(content_html); }
    if (category_id !== undefined) { fields.push('category_id = ?'); params.push(category_id || null); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }

    if (fields.length > 0) {
      params.push(id);
      await insert(`UPDATE kb_articles SET ${fields.join(', ')} WHERE id = ?`, params);
    }

    // Update tags
    if (tags !== undefined && Array.isArray(tags)) {
      await insert('DELETE FROM kb_tags WHERE article_id = ?', [id]);
      for (const tag of tags) {
        if (tag.trim()) await insert('INSERT INTO kb_tags (article_id, tag) VALUES (?, ?)', [id, tag.trim()]);
      }
    }

    const article = await queryOne('SELECT * FROM kb_articles WHERE id = ?', [id]);
    res.json({ success: true, data: article });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/kb/articles/:id/vote
async function vote(req, res) {
  try {
    const { helpful } = req.body;
    const id = req.params.id;

    if (helpful) {
      await insert('UPDATE kb_articles SET helpful_votes = helpful_votes + 1 WHERE id = ?', [id]);
    } else {
      await insert('UPDATE kb_articles SET unhelpful_votes = unhelpful_votes + 1 WHERE id = ?', [id]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/kb/search — quick search for ticket integration
async function search(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });

    const articles = await query(
      "SELECT id, title, slug FROM kb_articles WHERE status = 'published' AND (title LIKE ? OR content_html LIKE ?) LIMIT 5",
      [`%${q}%`, `%${q}%`]
    );
    res.json({ success: true, data: articles });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { listCategories, listArticles, getBySlug, createArticle, updateArticle, vote, search };
