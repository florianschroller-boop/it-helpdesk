const { query, queryOne, insert } = require('../config/database');

// GET /api/locations
async function list(req, res) {
  try {
    const locations = await query('SELECT * FROM locations WHERE active = 1 ORDER BY sort_order, name');

    // Enrich each location with device counts & asset counts
    for (const loc of locations) {
      // Network devices (optional — table may not exist if plugin not installed)
      try {
        const devices = await query(
          `SELECT d.id, d.name, d.type, d.is_monitored,
            (SELECT status FROM ping_results WHERE device_id = d.id ORDER BY checked_at DESC LIMIT 1) as last_status
           FROM network_devices d WHERE d.location = ?`,
          [loc.name]
        );
        loc.device_count = devices.length;
        loc.devices_online = devices.filter(d => d.last_status === 'up').length;
        loc.devices_offline = devices.filter(d => d.last_status === 'down').length;
      } catch {
        loc.device_count = 0;
        loc.devices_online = 0;
        loc.devices_offline = 0;
      }

      try {
        const assets = await queryOne('SELECT COUNT(*) as c FROM assets WHERE location = ?', [loc.name]);
        loc.asset_count = assets.c;
      } catch {
        loc.asset_count = 0;
      }
    }

    res.json({ success: true, data: locations });
  } catch (err) {
    console.error('List locations error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// GET /api/locations/:slug
async function getBySlug(req, res) {
  try {
    const location = await queryOne(
      'SELECT * FROM locations WHERE (slug = ? OR id = ?) AND active = 1',
      [req.params.slug, req.params.slug]
    );
    if (!location) {
      return res.status(404).json({ success: false, error: 'Standort nicht gefunden' });
    }

    // Network devices at this location (optional — table may not exist)
    try {
      location.devices = await query(
        `SELECT d.*,
          (SELECT status FROM ping_results WHERE device_id = d.id ORDER BY checked_at DESC LIMIT 1) as last_status,
          (SELECT response_time_ms FROM ping_results WHERE device_id = d.id ORDER BY checked_at DESC LIMIT 1) as last_response_time,
          (SELECT checked_at FROM ping_results WHERE device_id = d.id ORDER BY checked_at DESC LIMIT 1) as last_check
         FROM network_devices d WHERE d.location = ? ORDER BY d.type, d.name`,
        [location.name]
      );
    } catch {
      location.devices = [];
    }

    // Assets at this location (optional — table may not exist)
    try {
      location.assets = await query(
        `SELECT a.*, u.name as assigned_to_name FROM assets a LEFT JOIN users u ON a.assigned_to_user_id = u.id WHERE a.location = ? ORDER BY a.type, a.asset_tag`,
        [location.name]
      );
    } catch { location.assets = []; }

    // Open tickets related to assets at this location
    try {
      location.tickets = await query(
        `SELECT t.id, t.ticket_number, t.title, t.status, t.priority, t.created_at, a.asset_tag, a.name as asset_name FROM tickets t JOIN assets a ON t.asset_id = a.id WHERE a.location = ? AND t.status NOT IN ('closed') ORDER BY t.created_at DESC LIMIT 20`,
        [location.name]
      );
    } catch { location.tickets = []; }

    res.json({ success: true, data: location });
  } catch (err) {
    console.error('Get location error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// POST /api/locations
async function create(req, res) {
  try {
    const { name, address, directions, contact_name, contact_phone, contact_email, notes, sort_order } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name erforderlich' });

    const slug = name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '');

    const result = await insert(
      `INSERT INTO locations (name, slug, address, directions, contact_name, contact_phone, contact_email, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, slug, address || null, directions || null, contact_name || null, contact_phone || null, contact_email || null, notes || null, sort_order || 0]
    );

    const location = await queryOne('SELECT * FROM locations WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: location });
  } catch (err) {
    console.error('Create location error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// PUT /api/locations/:id
async function update(req, res) {
  try {
    const { name, address, directions, contact_name, contact_phone, contact_email, notes, sort_order, active } = req.body;
    const id = req.params.id;

    const fields = [];
    const params = [];

    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (address !== undefined) { fields.push('address = ?'); params.push(address || null); }
    if (directions !== undefined) { fields.push('directions = ?'); params.push(directions || null); }
    if (contact_name !== undefined) { fields.push('contact_name = ?'); params.push(contact_name || null); }
    if (contact_phone !== undefined) { fields.push('contact_phone = ?'); params.push(contact_phone || null); }
    if (contact_email !== undefined) { fields.push('contact_email = ?'); params.push(contact_email || null); }
    if (notes !== undefined) { fields.push('notes = ?'); params.push(notes || null); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order); }
    if (active !== undefined) { fields.push('active = ?'); params.push(active ? 1 : 0); }

    if (fields.length === 0) return res.status(400).json({ success: false, error: 'Keine Änderungen' });

    params.push(id);
    await insert(`UPDATE locations SET ${fields.join(', ')} WHERE id = ?`, params);

    const location = await queryOne('SELECT * FROM locations WHERE id = ?', [id]);
    res.json({ success: true, data: location });
  } catch (err) {
    console.error('Update location error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// DELETE /api/locations/:id
async function remove(req, res) {
  try {
    await insert('UPDATE locations SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { list, getBySlug, create, update, remove };
