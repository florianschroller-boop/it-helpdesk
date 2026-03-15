const { query, queryOne, insert } = require('../config/database');

// GET /api/assets
async function list(req, res) {
  try {
    const { type, status, user, location, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const selectFields = 'SELECT a.*, u.name as assigned_to_name, u.email as assigned_to_email';
    const fromClause = ' FROM assets a LEFT JOIN users u ON a.assigned_to_user_id = u.id';
    let where = ' WHERE 1=1';
    const params = [];

    if (type) { where += ' AND a.type = ?'; params.push(type); }
    if (status) { where += ' AND a.status = ?'; params.push(status); }
    if (user) { where += ' AND a.assigned_to_user_id = ?'; params.push(user); }
    if (location) { where += ' AND a.location LIKE ?'; params.push(`%${location}%`); }
    if (search) {
      where += ' AND (a.name LIKE ? OR a.asset_tag LIKE ? OR a.serial_number LIKE ? OR a.brand LIKE ? OR a.model LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countSql = `SELECT COUNT(*) as total${fromClause}${where}`;
    const countResult = await queryOne(countSql, params);

    let sql = selectFields + fromClause + where;

    sql += ' ORDER BY a.asset_tag ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const assets = await query(sql, params);

    res.json({
      success: true,
      data: assets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.total,
        pages: Math.ceil(countResult.total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('List assets error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/assets/stats
async function stats(req, res) {
  try {
    const total = await queryOne('SELECT COUNT(*) as c FROM assets');
    const active = await queryOne("SELECT COUNT(*) as c FROM assets WHERE status = 'active'");
    const inRepair = await queryOne("SELECT COUNT(*) as c FROM assets WHERE status = 'in_repair'");
    const available = await queryOne("SELECT COUNT(*) as c FROM assets WHERE status = 'available'");
    const unassigned = await queryOne("SELECT COUNT(*) as c FROM assets WHERE assigned_to_user_id IS NULL AND status = 'active'");

    // Warranty expiring within 90 days
    const warrantyExpiring = await queryOne(
      "SELECT COUNT(*) as c FROM assets WHERE warranty_until IS NOT NULL AND warranty_until BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)"
    );

    // Type distribution
    const byType = await query(
      "SELECT type, COUNT(*) as count FROM assets GROUP BY type ORDER BY count DESC"
    );

    res.json({
      success: true,
      data: {
        total: total.c,
        active: active.c,
        in_repair: inRepair.c,
        available: available.c,
        unassigned: unassigned.c,
        warranty_expiring: warrantyExpiring.c,
        by_type: byType
      }
    });
  } catch (err) {
    console.error('Asset stats error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/assets
async function create(req, res) {
  try {
    const { asset_tag, name, type, brand, model, serial_number, status, assigned_to_user_id, purchase_date, warranty_until, location, notes } = req.body;

    if (!asset_tag || !name) {
      return res.status(400).json({ success: false, error: 'Asset-Tag und Name sind erforderlich' });
    }

    const existing = await queryOne('SELECT id FROM assets WHERE asset_tag = ?', [asset_tag]);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Asset-Tag bereits vergeben' });
    }

    const result = await insert(
      `INSERT INTO assets (asset_tag, name, type, brand, model, serial_number, status, assigned_to_user_id, purchase_date, warranty_until, location, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [asset_tag, name, type || 'other', brand || null, model || null, serial_number || null,
       status || 'available', assigned_to_user_id || null, purchase_date || null, warranty_until || null,
       location || null, notes || null]
    );

    // Log history
    await insert(
      'INSERT INTO asset_history (asset_id, event_type, description, performed_by) VALUES (?, ?, ?, ?)',
      [result.insertId, 'created', 'Asset angelegt', req.user.id]
    );

    const asset = await queryOne('SELECT * FROM assets WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: asset });
  } catch (err) {
    console.error('Create asset error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/assets/:id
async function getById(req, res) {
  try {
    const asset = await queryOne(
      `SELECT a.*, u.name as assigned_to_name, u.email as assigned_to_email
       FROM assets a LEFT JOIN users u ON a.assigned_to_user_id = u.id
       WHERE a.id = ?`,
      [req.params.id]
    );

    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset nicht gefunden' });
    }

    // Get history
    const history = await query(
      `SELECT h.*, u.name as performed_by_name
       FROM asset_history h LEFT JOIN users u ON h.performed_by = u.id
       WHERE h.asset_id = ? ORDER BY h.performed_at DESC LIMIT 50`,
      [req.params.id]
    );

    // Get related tickets
    const tickets = await query(
      `SELECT id, ticket_number, title, status, priority, created_at
       FROM tickets WHERE asset_id = ? ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    );

    asset.history = history;
    asset.tickets = tickets;

    res.json({ success: true, data: asset });
  } catch (err) {
    console.error('Get asset error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/assets/:id
async function update(req, res) {
  try {
    const assetId = req.params.id;
    const asset = await queryOne('SELECT * FROM assets WHERE id = ?', [assetId]);
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset nicht gefunden' });
    }

    const { name, type, brand, model, serial_number, status, assigned_to_user_id, purchase_date, warranty_until, location, notes, status_comment } = req.body;

    const fields = [];
    const params = [];
    const changes = [];

    const trackField = (fieldName, dbField, newVal) => {
      if (newVal !== undefined && String(newVal || '') !== String(asset[dbField] || '')) {
        fields.push(`${dbField} = ?`);
        params.push(newVal || null);
        changes.push(`${fieldName}: ${asset[dbField] || '—'} → ${newVal || '—'}`);
      }
    };

    trackField('Name', 'name', name);
    trackField('Typ', 'type', type);
    trackField('Marke', 'brand', brand);
    trackField('Modell', 'model', model);
    trackField('Seriennummer', 'serial_number', serial_number);
    trackField('Status', 'status', status);
    trackField('Standort', 'location', location);
    trackField('Kaufdatum', 'purchase_date', purchase_date);
    trackField('Garantie bis', 'warranty_until', warranty_until);
    trackField('Notizen', 'notes', notes);

    if (assigned_to_user_id !== undefined) {
      const oldId = asset.assigned_to_user_id;
      const newId = assigned_to_user_id || null;
      if (String(oldId || '') !== String(newId || '')) {
        fields.push('assigned_to_user_id = ?');
        params.push(newId);
        const oldName = oldId ? (await queryOne('SELECT name FROM users WHERE id = ?', [oldId]))?.name : '—';
        const newName = newId ? (await queryOne('SELECT name FROM users WHERE id = ?', [newId]))?.name : '—';
        changes.push(`Zugewiesen: ${oldName} → ${newName}`);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'Keine Änderungen' });
    }

    params.push(assetId);
    await insert(`UPDATE assets SET ${fields.join(', ')} WHERE id = ?`, params);

    // Log history
    const desc = changes.join('; ') + (status_comment ? ` — ${status_comment}` : '');
    await insert(
      'INSERT INTO asset_history (asset_id, event_type, description, performed_by) VALUES (?, ?, ?, ?)',
      [assetId, 'updated', desc, req.user.id]
    );

    const updated = await queryOne(
      'SELECT a.*, u.name as assigned_to_name FROM assets a LEFT JOIN users u ON a.assigned_to_user_id = u.id WHERE a.id = ?',
      [assetId]
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Update asset error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// DELETE /api/assets/:id
async function remove(req, res) {
  try {
    const asset = await queryOne('SELECT id FROM assets WHERE id = ?', [req.params.id]);
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset nicht gefunden' });
    }

    // Soft-retire instead of delete
    await insert("UPDATE assets SET status = 'retired' WHERE id = ?", [req.params.id]);
    await insert(
      'INSERT INTO asset_history (asset_id, event_type, description, performed_by) VALUES (?, ?, ?, ?)',
      [req.params.id, 'retired', 'Asset ausgemustert', req.user.id]
    );

    res.json({ success: true, message: 'Asset ausgemustert' });
  } catch (err) {
    console.error('Delete asset error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/assets/import-csv
async function importCsv(req, res) {
  try {
    const { rows, mapping } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Keine Daten zum Importieren' });
    }

    const results = { imported: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const data = {};
        for (const [systemField, csvField] of Object.entries(mapping)) {
          if (csvField && row[csvField] !== undefined) {
            data[systemField] = row[csvField];
          }
        }

        if (!data.asset_tag || !data.name) {
          results.errors.push({ row: i + 1, error: 'Asset-Tag oder Name fehlt' });
          results.skipped++;
          continue;
        }

        // Duplicate check
        const existing = await queryOne(
          'SELECT id FROM assets WHERE asset_tag = ? OR (serial_number IS NOT NULL AND serial_number = ? AND serial_number != "")',
          [data.asset_tag, data.serial_number || '']
        );

        if (existing) {
          results.errors.push({ row: i + 1, error: `Duplikat: ${data.asset_tag}` });
          results.skipped++;
          continue;
        }

        // Resolve user by email
        let userId = null;
        if (data.assigned_to_email) {
          const user = await queryOne('SELECT id FROM users WHERE email = ?', [data.assigned_to_email]);
          userId = user?.id || null;
        }

        await insert(
          `INSERT INTO assets (asset_tag, name, type, brand, model, serial_number, status, assigned_to_user_id, purchase_date, warranty_until, location)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.asset_tag, data.name, data.type || 'other', data.brand || null,
            data.model || null, data.serial_number || null, data.status || 'available',
            userId, data.purchase_date || null, data.warranty_until || null, data.location || null
          ]
        );

        results.imported++;
      } catch (err) {
        results.errors.push({ row: i + 1, error: err.message });
        results.skipped++;
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Import CSV error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/assets/export
async function exportCsv(req, res) {
  try {
    const assets = await query(
      `SELECT a.asset_tag, a.name, a.type, a.brand, a.model, a.serial_number, a.status,
        u.email as assigned_to_email, a.location, a.purchase_date, a.warranty_until, a.notes
       FROM assets a LEFT JOIN users u ON a.assigned_to_user_id = u.id
       ORDER BY a.asset_tag`
    );

    const header = 'Asset-Tag,Name,Typ,Marke,Modell,Seriennummer,Status,Benutzer-Email,Standort,Kaufdatum,Garantie bis,Notizen';
    const csvRows = assets.map(a =>
      [a.asset_tag, a.name, a.type, a.brand, a.model, a.serial_number, a.status,
       a.assigned_to_email, a.location, a.purchase_date, a.warranty_until, a.notes]
        .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    );

    const csv = [header, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=assets-export.csv');
    res.send('\uFEFF' + csv); // BOM for Excel
  } catch (err) {
    console.error('Export CSV error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { list, stats, create, getById, update, remove, importCsv, exportCsv };
