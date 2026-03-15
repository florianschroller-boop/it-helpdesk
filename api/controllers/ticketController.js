const path = require('path');
const fs = require('fs');
const { query, queryOne, insert, getPool } = require('../config/database');
const NotificationService = require('../services/NotificationService');

// Generate ticket number: #IT-2025-0001
async function generateTicketNumber() {
  const year = new Date().getFullYear();
  const db = getPool();
  const [result] = await db.execute(
    'INSERT INTO ticket_counters (year, last_number) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_number = last_number + 1',
    [year]
  );
  const row = await queryOne('SELECT last_number FROM ticket_counters WHERE year = ?', [year]);
  return `#IT-${year}-${String(row.last_number).padStart(4, '0')}`;
}

// GET /api/tickets
async function list(req, res) {
  try {
    const { status, priority, assignee, category, search, source, requester, page = 1, limit = 20, sort = 'created_at', order = 'DESC' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const selectFields = `SELECT t.*, r.name as requester_name, r.email as requester_email, r.location as requester_location, a.name as assignee_name`;
    const fromClause = ` FROM tickets t LEFT JOIN users r ON t.requester_id = r.id LEFT JOIN users a ON t.assignee_id = a.id`;
    let where = ' WHERE 1=1';
    const params = [];

    // Users can only see their own tickets
    if (req.user.role === 'user') {
      where += ' AND t.requester_id = ?';
      params.push(req.user.id);
    }

    if (status) {
      where += ' AND t.status = ?';
      params.push(status);
    }
    if (priority) {
      where += ' AND t.priority = ?';
      params.push(priority);
    }
    if (assignee === 'unassigned') {
      where += ' AND t.assignee_id IS NULL';
    } else if (assignee) {
      where += ' AND t.assignee_id = ?';
      params.push(assignee);
    }
    if (category) {
      where += ' AND t.category = ?';
      params.push(category);
    }
    if (source) {
      where += ' AND t.source = ?';
      params.push(source);
    }
    if (requester) {
      where += ' AND t.requester_id = ?';
      params.push(requester);
    }
    if (search) {
      where += ' AND (t.title LIKE ? OR t.ticket_number LIKE ? OR t.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Count
    const countSql = `SELECT COUNT(*) as total${fromClause}${where}`;
    const countResult = await queryOne(countSql, params);

    let sql = selectFields + fromClause + where;

    // Allowed sort columns
    const allowedSort = ['created_at', 'updated_at', 'priority', 'status', 'ticket_number'];
    const sortCol = allowedSort.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` ORDER BY t.${sortCol} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const tickets = await query(sql, params);

    res.json({
      success: true,
      data: tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.total,
        pages: Math.ceil(countResult.total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('List tickets error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// GET /api/tickets/stats
async function stats(req, res) {
  try {
    let whereUser = '';
    const params = [];

    if (req.user.role === 'user') {
      whereUser = ' AND requester_id = ?';
      params.push(req.user.id);
    }

    const open = await queryOne(`SELECT COUNT(*) as c FROM tickets WHERE status = 'open'${whereUser}`, params);
    const pending = await queryOne(`SELECT COUNT(*) as c FROM tickets WHERE status = 'pending'${whereUser}`, params);
    const inProgress = await queryOne(`SELECT COUNT(*) as c FROM tickets WHERE status = 'in_progress'${whereUser}`, params);

    const today = new Date().toISOString().slice(0, 10);
    const resolved = await queryOne(
      `SELECT COUNT(*) as c FROM tickets WHERE status = 'resolved' AND DATE(resolved_at) = ?${whereUser}`,
      [today, ...params]
    );

    // My assigned (for agents)
    let myAssigned = { c: 0 };
    if (req.user.role !== 'user') {
      myAssigned = await queryOne(
        "SELECT COUNT(*) as c FROM tickets WHERE assignee_id = ? AND status NOT IN ('resolved','closed')",
        [req.user.id]
      );
    }

    // SLA breached
    const slaBreach = await queryOne(
      `SELECT COUNT(*) as c FROM tickets WHERE sla_due_at IS NOT NULL AND sla_due_at < NOW() AND status NOT IN ('resolved','closed')${whereUser}`,
      params
    );

    res.json({
      success: true,
      data: {
        open: open.c,
        pending: pending.c,
        in_progress: inProgress.c,
        resolved_today: resolved.c,
        my_assigned: myAssigned.c,
        sla_breached: slaBreach.c
      }
    });
  } catch (err) {
    console.error('Ticket stats error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/tickets
async function create(req, res) {
  try {
    const { title, description, category, priority, assignee_id, asset_id, source } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Titel ist erforderlich' });
    }

    const ticketNumber = await generateTicketNumber();

    // SLA: default 24h
    const slaHours = 24;
    const slaDue = new Date(Date.now() + slaHours * 3600000);

    const result = await insert(
      `INSERT INTO tickets (ticket_number, title, description, category, priority, requester_id, assignee_id, asset_id, source, sla_due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ticketNumber,
        title,
        description || '',
        category || 'Sonstiges',
        priority || 'medium',
        req.user.id,
        assignee_id || null,
        asset_id || null,
        source || 'web',
        slaDue
      ]
    );

    // Log history
    await insert(
      'INSERT INTO ticket_history (ticket_id, changed_by, field_changed, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
      [result.insertId, req.user.id, 'status', null, 'open']
    );

    const ticket = await queryOne(
      `SELECT t.*, r.name as requester_name, r.email as requester_email, a.name as assignee_name
       FROM tickets t
       LEFT JOIN users r ON t.requester_id = r.id
       LEFT JOIN users a ON t.assignee_id = a.id
       WHERE t.id = ?`,
      [result.insertId]
    );

    // Send confirmation email (async, don't block response)
    NotificationService.ticketCreated(ticket, ticket.requester_email).catch(() => {});

    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/tickets/:id
async function getById(req, res) {
  try {
    let ticket;
    try {
      ticket = await queryOne(
        `SELECT t.*, r.name as requester_name, r.email as requester_email,
          r.location as requester_location, r.department as requester_department,
          a.name as assignee_name, a.email as assignee_email,
          ast.name as asset_name, ast.asset_tag, ast.location as asset_location
         FROM tickets t
         LEFT JOIN users r ON t.requester_id = r.id
         LEFT JOIN users a ON t.assignee_id = a.id
         LEFT JOIN assets ast ON t.asset_id = ast.id
         WHERE t.id = ?`,
        [req.params.id]
      );
    } catch {
      // Fallback without assets join (table might not exist)
      ticket = await queryOne(
        `SELECT t.*, r.name as requester_name, r.email as requester_email,
          r.location as requester_location, r.department as requester_department,
          a.name as assignee_name, a.email as assignee_email
         FROM tickets t
         LEFT JOIN users r ON t.requester_id = r.id
         LEFT JOIN users a ON t.assignee_id = a.id
         WHERE t.id = ?`,
        [req.params.id]
      );
    }

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket nicht gefunden' });
    }

    // Users can only see their own tickets
    if (req.user.role === 'user' && ticket.requester_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung' });
    }

    // Resolve effective location (asset location takes priority, then user location)
    ticket.location = ticket.asset_location || ticket.requester_location || null;

    // If location exists, find the matching location slug for linking
    if (ticket.location) {
      const loc = await queryOne('SELECT slug, name FROM locations WHERE name = ? AND active = 1', [ticket.location]);
      ticket.location_slug = loc?.slug || null;
      ticket.location_name = loc?.name || ticket.location;
    }

    res.json({ success: true, data: ticket });
  } catch (err) {
    console.error('Get ticket error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/tickets/:id
async function update(req, res) {
  try {
    const ticketId = req.params.id;
    const ticket = await queryOne('SELECT * FROM tickets WHERE id = ?', [ticketId]);

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket nicht gefunden' });
    }

    // Users can only close/reopen their own tickets
    if (req.user.role === 'user' && ticket.requester_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung' });
    }

    const { title, description, status, priority, category, assignee_id, asset_id } = req.body;

    const fields = [];
    const params = [];
    const changes = [];

    if (title !== undefined && title !== ticket.title) {
      fields.push('title = ?'); params.push(title);
      changes.push({ field: 'title', old: ticket.title, new: title });
    }
    if (description !== undefined && description !== ticket.description) {
      fields.push('description = ?'); params.push(description);
      changes.push({ field: 'description', old: '(geändert)', new: '(geändert)' });
    }
    if (status !== undefined && status !== ticket.status) {
      fields.push('status = ?'); params.push(status);
      changes.push({ field: 'status', old: ticket.status, new: status });
      if (status === 'resolved' || status === 'closed') {
        fields.push('resolved_at = NOW()');
      }
    }
    if (priority !== undefined && priority !== ticket.priority) {
      fields.push('priority = ?'); params.push(priority);
      changes.push({ field: 'priority', old: ticket.priority, new: priority });
    }
    if (category !== undefined && category !== ticket.category) {
      fields.push('category = ?'); params.push(category);
      changes.push({ field: 'category', old: ticket.category, new: category });
    }
    if (assignee_id !== undefined) {
      const oldId = ticket.assignee_id;
      const newId = assignee_id || null;
      if (oldId !== newId) {
        fields.push('assignee_id = ?'); params.push(newId);
        // Resolve names for history
        const oldName = oldId ? (await queryOne('SELECT name FROM users WHERE id = ?', [oldId]))?.name : null;
        const newName = newId ? (await queryOne('SELECT name FROM users WHERE id = ?', [newId]))?.name : null;
        changes.push({ field: 'assignee', old: oldName || 'Nicht zugewiesen', new: newName || 'Nicht zugewiesen' });
      }
    }
    if (asset_id !== undefined) {
      fields.push('asset_id = ?'); params.push(asset_id || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'Keine Änderungen' });
    }

    params.push(ticketId);
    await insert(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`, params);

    // Record history
    for (const change of changes) {
      await insert(
        'INSERT INTO ticket_history (ticket_id, changed_by, field_changed, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
        [ticketId, req.user.id, change.field, change.old, change.new]
      );
    }

    const updated = await queryOne(
      `SELECT t.*, r.name as requester_name, r.email as requester_email, a.name as assignee_name
       FROM tickets t
       LEFT JOIN users r ON t.requester_id = r.id
       LEFT JOIN users a ON t.assignee_id = a.id
       WHERE t.id = ?`,
      [ticketId]
    );

    // Send update notification (async)
    if (changes.length > 0 && updated.requester_email) {
      NotificationService.ticketUpdated(updated, updated.requester_email, changes).catch(() => {});
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Update ticket error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/tickets/:id/comments
async function addComment(req, res) {
  try {
    const ticketId = req.params.id;
    const { content, is_internal } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Kommentar-Text ist erforderlich' });
    }

    const ticket = await queryOne('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket nicht gefunden' });
    }

    // Users can only comment on their own tickets, and cannot post internal notes
    if (req.user.role === 'user') {
      if (ticket.requester_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Keine Berechtigung' });
      }
    }

    const isInternalNote = req.user.role === 'user' ? 0 : (is_internal ? 1 : 0);

    const result = await insert(
      'INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal) VALUES (?, ?, ?, ?)',
      [ticketId, req.user.id, content, isInternalNote]
    );

    // Update ticket timestamp
    await insert('UPDATE tickets SET updated_at = NOW() WHERE id = ?', [ticketId]);

    const comment = await queryOne(
      `SELECT c.*, u.name as user_name, u.role as user_role, u.avatar_url
       FROM ticket_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      [result.insertId]
    );

    // Send notification (don't notify on internal notes, don't notify self)
    if (!isInternalNote) {
      const requester = await queryOne('SELECT email FROM users WHERE id = ?', [ticket.requester_id]);
      if (requester && ticket.requester_id !== req.user.id) {
        NotificationService.ticketCommented(ticket, req.user.name, requester.email).catch(() => {});
      }
      // Also notify assignee if different
      if (ticket.assignee_id && ticket.assignee_id !== req.user.id && ticket.assignee_id !== ticket.requester_id) {
        const assignee = await queryOne('SELECT email FROM users WHERE id = ?', [ticket.assignee_id]);
        if (assignee) {
          NotificationService.ticketCommented(ticket, req.user.name, assignee.email).catch(() => {});
        }
      }
    }

    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/tickets/:id/comments
async function getComments(req, res) {
  try {
    const ticketId = req.params.id;

    let sql = `SELECT c.*, u.name as user_name, u.role as user_role, u.avatar_url
       FROM ticket_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.ticket_id = ?`;
    const params = [ticketId];

    // Users cannot see internal notes
    if (req.user.role === 'user') {
      sql += ' AND c.is_internal = 0';
    }

    sql += ' ORDER BY c.created_at ASC';

    const comments = await query(sql, params);
    res.json({ success: true, data: comments });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/tickets/:id/history
async function getHistory(req, res) {
  try {
    const history = await query(
      `SELECT h.*, u.name as changed_by_name
       FROM ticket_history h
       JOIN users u ON h.changed_by = u.id
       WHERE h.ticket_id = ?
       ORDER BY h.changed_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: history });
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/tickets/:id/attachments
async function addAttachment(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Keine Datei hochgeladen' });
    }

    const ticketId = req.params.id;
    const ticket = await queryOne('SELECT id FROM tickets WHERE id = ?', [ticketId]);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket nicht gefunden' });
    }

    const result = await insert(
      'INSERT INTO ticket_attachments (ticket_id, filename, filepath, filesize) VALUES (?, ?, ?, ?)',
      [ticketId, req.file.originalname, req.file.path, req.file.size]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        filename: req.file.originalname,
        filepath: `/uploads/${req.file.filename}`,
        filesize: req.file.size
      }
    });
  } catch (err) {
    console.error('Add attachment error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/tickets/:id/attachments
async function getAttachments(req, res) {
  try {
    const attachments = await query(
      'SELECT * FROM ticket_attachments WHERE ticket_id = ? ORDER BY uploaded_at ASC',
      [req.params.id]
    );
    res.json({ success: true, data: attachments });
  } catch (err) {
    console.error('Get attachments error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { list, stats, create, getById, update, addComment, getComments, getHistory, addAttachment, getAttachments };
