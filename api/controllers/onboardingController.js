const { query, queryOne, insert, getPool } = require('../config/database');

// ---- Config ----

// GET /api/onboarding/config
async function getConfig(req, res) {
  try {
    const items = await query('SELECT * FROM onboarding_config WHERE active = 1 ORDER BY config_type, sort_order');
    const config = {
      form_fields: items.filter(i => i.config_type === 'form_field'),
      checklist_items: items.filter(i => i.config_type === 'checklist_item'),
      hardware_options: items.filter(i => i.config_type === 'hardware_option')
    };
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// GET /api/onboarding/config/all (admin — includes inactive)
async function getAllConfig(req, res) {
  try {
    const items = await query('SELECT * FROM onboarding_config ORDER BY config_type, sort_order');
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// POST /api/onboarding/config
async function createConfigItem(req, res) {
  try {
    const { config_type, label, field_type, options_json, required, sort_order } = req.body;
    if (!config_type || !label) return res.status(400).json({ success: false, error: 'Typ und Bezeichnung erforderlich' });

    const result = await insert(
      'INSERT INTO onboarding_config (config_type, label, field_type, options_json, required, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [config_type, label, field_type || null, options_json ? JSON.stringify(options_json) : null, required ? 1 : 0, sort_order || 0]
    );
    const item = await queryOne('SELECT * FROM onboarding_config WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// PUT /api/onboarding/config/:id
async function updateConfigItem(req, res) {
  try {
    const { label, field_type, options_json, required, sort_order, active } = req.body;
    const fields = [];
    const params = [];

    if (label !== undefined) { fields.push('label = ?'); params.push(label); }
    if (field_type !== undefined) { fields.push('field_type = ?'); params.push(field_type); }
    if (options_json !== undefined) { fields.push('options_json = ?'); params.push(JSON.stringify(options_json)); }
    if (required !== undefined) { fields.push('required = ?'); params.push(required ? 1 : 0); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order); }
    if (active !== undefined) { fields.push('active = ?'); params.push(active ? 1 : 0); }

    if (fields.length === 0) return res.status(400).json({ success: false, error: 'Keine Änderungen' });

    params.push(req.params.id);
    await insert(`UPDATE onboarding_config SET ${fields.join(', ')} WHERE id = ?`, params);

    const item = await queryOne('SELECT * FROM onboarding_config WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// DELETE /api/onboarding/config/:id
async function deleteConfigItem(req, res) {
  try {
    await insert('DELETE FROM onboarding_config WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// ---- Requests ----

async function generateRequestNumber() {
  const year = new Date().getFullYear();
  const count = await queryOne("SELECT COUNT(*) as c FROM onboarding_requests WHERE YEAR(created_at) = ?", [year]);
  return `ONB-${year}-${String((count.c || 0) + 1).padStart(4, '0')}`;
}

// GET /api/onboarding/requests
async function listRequests(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let where = ' WHERE 1=1';
    const params = [];

    if (req.user.role === 'user') {
      where += ' AND r.requested_by = ?';
      params.push(req.user.id);
    }
    if (status) { where += ' AND r.status = ?'; params.push(status); }

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM onboarding_requests r${where}`, params);

    const sql = `SELECT r.*, u.name as requested_by_name, a.name as assigned_to_name
       FROM onboarding_requests r
       LEFT JOIN users u ON r.requested_by = u.id
       LEFT JOIN users a ON r.assigned_to = a.id
       ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const requests = await query(sql, params);

    // Add checklist progress
    for (const r of requests) {
      const total = await queryOne('SELECT COUNT(*) as c FROM onboarding_checklist WHERE request_id = ?', [r.id]);
      const done = await queryOne('SELECT COUNT(*) as c FROM onboarding_checklist WHERE request_id = ? AND completed = 1', [r.id]);
      r.checklist_total = total.c;
      r.checklist_done = done.c;
    }

    res.json({
      success: true, data: requests,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRes.total, pages: Math.ceil(countRes.total / parseInt(limit)) }
    });
  } catch (err) {
    console.error('List onboarding error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// POST /api/onboarding/requests
async function createRequest(req, res) {
  try {
    // Only managers and agents/admins can create onboarding requests
    if (req.user.role === 'user') {
      const user = await queryOne('SELECT is_manager FROM users WHERE id = ?', [req.user.id]);
      if (!user?.is_manager) {
        return res.status(403).json({ success: false, error: 'Nur Führungskräfte können Onboarding-Anträge stellen' });
      }
    }

    const { employee_name, employee_email, employee_position, employee_department, employee_location, start_date, manager_notes, form_data, hardware } = req.body;

    if (!employee_name || !start_date) {
      return res.status(400).json({ success: false, error: 'Name und Startdatum erforderlich' });
    }

    const requestNumber = await generateRequestNumber();

    const result = await insert(
      `INSERT INTO onboarding_requests (request_number, employee_name, employee_email, employee_position, employee_department, employee_location, start_date, manager_notes, form_data_json, hardware_json, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [requestNumber, employee_name, employee_email || null, employee_position || null,
       employee_department || null, employee_location || null, start_date, manager_notes || null,
       form_data ? JSON.stringify(form_data) : null, hardware ? JSON.stringify(hardware) : null,
       req.user.id]
    );

    const requestId = result.insertId;

    // Create checklist from config template (with descriptions)
    const checklistItems = await query("SELECT label, description, sort_order FROM onboarding_config WHERE config_type = 'checklist_item' AND active = 1 ORDER BY sort_order");
    for (const item of checklistItems) {
      await insert('INSERT INTO onboarding_checklist (request_id, label, description, sort_order) VALUES (?, ?, ?, ?)',
        [requestId, item.label, item.description || null, item.sort_order]);
    }

    // Create linked ticket
    const year = new Date().getFullYear();
    const db = getPool();
    await db.query('INSERT INTO ticket_counters (year, last_number) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_number = last_number + 1', [year]);
    const counter = await queryOne('SELECT last_number FROM ticket_counters WHERE year = ?', [year]);
    const ticketNumber = `#IT-${year}-${String(counter.last_number).padStart(4, '0')}`;

    const slaDue = new Date(new Date(start_date).getTime() - 86400000);

    const ticketResult = await insert(
      `INSERT INTO tickets (ticket_number, title, description, category, priority, requester_id, source, sla_due_at)
       VALUES (?, ?, ?, 'Zugang/Passwort', 'high', ?, 'web', ?)`,
      [ticketNumber, `Neuer Mitarbeiter: ${employee_name}`,
       `Onboarding-Antrag ${requestNumber}\n\nNeuer Mitarbeiter: ${employee_name}\nPosition: ${employee_position || '—'}\nAbteilung: ${employee_department || '—'}\nStartdatum: ${start_date}`,
       req.user.id, slaDue]
    );

    await insert('UPDATE onboarding_requests SET ticket_id = ? WHERE id = ?', [ticketResult.insertId, requestId]);
    await insert('INSERT INTO ticket_history (ticket_id, changed_by, field_changed, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
      [ticketResult.insertId, req.user.id, 'status', null, 'open']);

    // Create order from hardware selections
    if (hardware && hardware.length > 0) {
      const orderYear = new Date().getFullYear();
      const orderCount = await queryOne("SELECT COUNT(*) as c FROM orders WHERE YEAR(created_at) = ?", [orderYear]);
      const orderNumber = `ORD-${orderYear}-${String((orderCount.c || 0) + 1).padStart(4, '0')}`;

      const orderResult = await insert(
        "INSERT INTO orders (order_number, title, description, requested_by, priority, status) VALUES (?, ?, ?, ?, 'high', 'requested')",
        [orderNumber, `Hardware für ${employee_name} (Onboarding)`,
         `Hardware-Bestellung aus Onboarding-Antrag ${requestNumber}\nMitarbeiter: ${employee_name}\nStartdatum: ${start_date}`,
         req.user.id]
      );

      for (const hw of hardware) {
        await insert('INSERT INTO order_items (order_id, item_name, quantity) VALUES (?, ?, 1)', [orderResult.insertId, hw]);
      }

      // Create default order steps
      const defaultSteps = [
        { step_name: 'Anfrage eingegangen', step_order: 1, status: 'completed' },
        { step_name: 'In Prüfung', step_order: 2, status: 'active' },
        { step_name: 'Genehmigt', step_order: 3, status: 'pending' },
        { step_name: 'Bestellung aufgegeben', step_order: 4, status: 'pending' },
        { step_name: 'Versandt', step_order: 5, status: 'pending' },
        { step_name: 'Geliefert', step_order: 6, status: 'pending' },
        { step_name: 'Abgeschlossen', step_order: 7, status: 'pending' }
      ];
      for (const step of defaultSteps) {
        await insert('INSERT INTO order_progress_steps (order_id, step_name, step_order, status, completed_at, completed_by) VALUES (?, ?, ?, ?, ?, ?)',
          [orderResult.insertId, step.step_name, step.step_order, step.status,
           step.status === 'completed' ? new Date() : null, step.status === 'completed' ? req.user.id : null]);
      }
    }

    const request = await queryOne('SELECT * FROM onboarding_requests WHERE id = ?', [requestId]);
    res.status(201).json({ success: true, data: request });
  } catch (err) {
    console.error('Create onboarding error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// GET /api/onboarding/for-ticket/:ticketId — get onboarding data linked to a ticket
async function getForTicket(req, res) {
  try {
    const r = await queryOne('SELECT * FROM onboarding_requests WHERE ticket_id = ?', [req.params.ticketId]);
    if (!r) return res.json({ success: true, data: null });

    r.form_data = r.form_data_json ? JSON.parse(r.form_data_json) : {};
    r.hardware = r.hardware_json ? JSON.parse(r.hardware_json) : [];
    r.checklist = await query(
      'SELECT c.*, u.name as completed_by_name FROM onboarding_checklist c LEFT JOIN users u ON c.completed_by = u.id WHERE c.request_id = ? ORDER BY c.sort_order',
      [r.id]
    );

    res.json({ success: true, data: r });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/onboarding/requests/:id
async function getRequest(req, res) {
  try {
    const r = await queryOne(
      `SELECT r.*, u.name as requested_by_name, u.email as requested_by_email, a.name as assigned_to_name
       FROM onboarding_requests r
       LEFT JOIN users u ON r.requested_by = u.id
       LEFT JOIN users a ON r.assigned_to = a.id
       WHERE r.id = ?`,
      [req.params.id]
    );
    if (!r) return res.status(404).json({ success: false, error: 'Antrag nicht gefunden' });

    if (req.user.role === 'user' && r.requested_by !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung' });
    }

    // Parse JSON fields
    r.form_data = r.form_data_json ? JSON.parse(r.form_data_json) : {};
    r.hardware = r.hardware_json ? JSON.parse(r.hardware_json) : [];

    // Get checklist
    r.checklist = await query(
      `SELECT c.*, u.name as completed_by_name FROM onboarding_checklist c LEFT JOIN users u ON c.completed_by = u.id WHERE c.request_id = ? ORDER BY c.sort_order`,
      [r.id]
    );

    // Get config labels for form_data display
    r.form_fields = await query("SELECT id, label FROM onboarding_config WHERE config_type = 'form_field' AND active = 1 ORDER BY sort_order");

    res.json({ success: true, data: r });
  } catch (err) {
    console.error('Get onboarding error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// PUT /api/onboarding/requests/:id/assign
async function assignRequest(req, res) {
  try {
    const { assigned_to } = req.body;
    await insert('UPDATE onboarding_requests SET assigned_to = ?, status = "in_progress" WHERE id = ?',
      [assigned_to || req.user.id, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/onboarding/checklist/:id
async function toggleChecklistItem(req, res) {
  try {
    const item = await queryOne('SELECT * FROM onboarding_checklist WHERE id = ?', [req.params.id]);
    if (!item) return res.status(404).json({ success: false, error: 'Eintrag nicht gefunden' });

    const newCompleted = item.completed ? 0 : 1;
    const notes = req.body.notes || null;

    await insert(
      'UPDATE onboarding_checklist SET completed = ?, completed_by = ?, completed_at = ?, notes = ? WHERE id = ?',
      [newCompleted, newCompleted ? req.user.id : null, newCompleted ? new Date() : null, notes, req.params.id]
    );

    // Check if all items are completed
    const total = await queryOne('SELECT COUNT(*) as c FROM onboarding_checklist WHERE request_id = ?', [item.request_id]);
    const done = await queryOne('SELECT COUNT(*) as c FROM onboarding_checklist WHERE request_id = ? AND completed = 1', [item.request_id]);

    const allDone = total.c > 0 && total.c === done.c;

    // Auto-complete request if all done
    if (allDone) {
      await insert("UPDATE onboarding_requests SET status = 'completed', completed_at = NOW() WHERE id = ?", [item.request_id]);
      // Also resolve linked ticket
      const request = await queryOne('SELECT ticket_id FROM onboarding_requests WHERE id = ?', [item.request_id]);
      if (request?.ticket_id) {
        await insert("UPDATE tickets SET status = 'resolved', resolved_at = NOW() WHERE id = ?", [request.ticket_id]);
      }
    } else if (!allDone) {
      // If unchecked and was completed, revert
      const request = await queryOne('SELECT status FROM onboarding_requests WHERE id = ?', [item.request_id]);
      if (request?.status === 'completed') {
        await insert("UPDATE onboarding_requests SET status = 'in_progress', completed_at = NULL WHERE id = ?", [item.request_id]);
      }
    }

    res.json({ success: true, data: { completed: !!newCompleted, all_done: allDone } });
  } catch (err) {
    console.error('Toggle checklist error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { getConfig, getAllConfig, createConfigItem, updateConfigItem, deleteConfigItem, listRequests, createRequest, getRequest, getForTicket, assignRequest, toggleChecklistItem };
