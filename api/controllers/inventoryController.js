const { query, queryOne, insert } = require('../config/database');

// GET /api/inventory
async function list(req, res) {
  try {
    const { category, search, low_stock } = req.query;
    let sql = 'SELECT i.*, s.name as supplier_name FROM inventory_items i LEFT JOIN suppliers s ON i.supplier_id = s.id WHERE i.active = 1';
    const params = [];

    if (category) { sql += ' AND i.category = ?'; params.push(category); }
    if (search) { sql += ' AND (i.name LIKE ? OR i.sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (low_stock === '1') { sql += ' AND i.quantity <= i.min_quantity AND i.min_quantity > 0'; }

    sql += ' ORDER BY i.category, i.name';
    const items = await query(sql, params);

    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// GET /api/inventory/stats
async function stats(req, res) {
  try {
    const total = await queryOne('SELECT COUNT(*) as c FROM inventory_items WHERE active = 1');
    const lowStock = await queryOne('SELECT COUNT(*) as c FROM inventory_items WHERE active = 1 AND quantity <= min_quantity AND min_quantity > 0');
    const totalValue = await queryOne('SELECT COALESCE(SUM(quantity * price), 0) as v FROM inventory_items WHERE active = 1 AND price IS NOT NULL');
    const byCategory = await query('SELECT category, COUNT(*) as count, SUM(quantity) as total_qty FROM inventory_items WHERE active = 1 GROUP BY category');

    res.json({ success: true, data: { total: total.c, low_stock: lowStock.c, total_value: totalValue.v, by_category: byCategory } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/inventory/warnings — items below min stock
async function warnings(req, res) {
  try {
    const items = await query(
      'SELECT i.*, s.name as supplier_name FROM inventory_items i LEFT JOIN suppliers s ON i.supplier_id = s.id WHERE i.active = 1 AND i.quantity <= i.min_quantity AND i.min_quantity > 0 ORDER BY (i.quantity - i.min_quantity) ASC'
    );
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/inventory
async function create(req, res) {
  try {
    const { name, category, sku, location, quantity, min_quantity, unit, supplier_id, price, notes, order_method, shop_url } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name erforderlich' });

    const result = await insert(
      'INSERT INTO inventory_items (name, category, sku, location, quantity, min_quantity, unit, supplier_id, price, notes, order_method, shop_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [name, category||'accessory', sku||null, location||'Lager', quantity||0, min_quantity||0, unit||'Stk.', supplier_id||null, price||null, notes||null, order_method||'none', shop_url||null]
    );

    // Log initial stock
    if (quantity > 0) {
      await insert('INSERT INTO inventory_movements (item_id, type, quantity, reason, performed_by) VALUES (?,?,?,?,?)',
        [result.insertId, 'in', quantity, 'Erstbestand', req.user.id]);
    }

    const item = await queryOne('SELECT * FROM inventory_items WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// PUT /api/inventory/:id
async function update(req, res) {
  try {
    const { name, category, sku, location, min_quantity, unit, supplier_id, price, notes, order_method, shop_url, active } = req.body;
    const fields = []; const params = [];
    if (name !== undefined) { fields.push('name=?'); params.push(name); }
    if (category !== undefined) { fields.push('category=?'); params.push(category); }
    if (sku !== undefined) { fields.push('sku=?'); params.push(sku||null); }
    if (location !== undefined) { fields.push('location=?'); params.push(location||null); }
    if (min_quantity !== undefined) { fields.push('min_quantity=?'); params.push(min_quantity); }
    if (unit !== undefined) { fields.push('unit=?'); params.push(unit); }
    if (supplier_id !== undefined) { fields.push('supplier_id=?'); params.push(supplier_id||null); }
    if (price !== undefined) { fields.push('price=?'); params.push(price||null); }
    if (notes !== undefined) { fields.push('notes=?'); params.push(notes||null); }
    if (order_method !== undefined) { fields.push('order_method=?'); params.push(order_method||'none'); }
    if (shop_url !== undefined) { fields.push('shop_url=?'); params.push(shop_url||null); }
    if (active !== undefined) { fields.push('active=?'); params.push(active?1:0); }
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'Keine Änderungen' });
    params.push(req.params.id);
    await insert(`UPDATE inventory_items SET ${fields.join(',')} WHERE id=?`, params);
    const item = await queryOne('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/inventory/:id/stock — stock in/out
async function adjustStock(req, res) {
  try {
    const { type, quantity, reason } = req.body;
    if (!type || !quantity) return res.status(400).json({ success: false, error: 'Typ und Menge erforderlich' });

    const item = await queryOne('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
    if (!item) return res.status(404).json({ success: false, error: 'Artikel nicht gefunden' });

    const qty = parseInt(quantity);
    let newQty;
    if (type === 'in') newQty = item.quantity + qty;
    else if (type === 'out') newQty = Math.max(0, item.quantity - qty);
    else if (type === 'correction') newQty = qty;
    else return res.status(400).json({ success: false, error: 'Typ muss in, out oder correction sein' });

    await insert('UPDATE inventory_items SET quantity = ? WHERE id = ?', [newQty, req.params.id]);
    await insert('INSERT INTO inventory_movements (item_id, type, quantity, reason, performed_by) VALUES (?,?,?,?,?)',
      [req.params.id, type, qty, reason || null, req.user.id]);

    res.json({ success: true, data: { quantity: newQty } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/inventory/:id/movements
async function getMovements(req, res) {
  try {
    const movements = await query(
      'SELECT m.*, u.name as performed_by_name FROM inventory_movements m LEFT JOIN users u ON m.performed_by = u.id WHERE m.item_id = ? ORDER BY m.performed_at DESC LIMIT 50',
      [req.params.id]
    );
    res.json({ success: true, data: movements });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/inventory/custom-fields
async function getCustomFields(req, res) {
  try {
    const fields = await query('SELECT * FROM asset_custom_fields WHERE active = 1 ORDER BY sort_order');
    res.json({ success: true, data: fields });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/inventory/custom-fields
async function createCustomField(req, res) {
  try {
    const { field_name, field_type, options_json, sort_order } = req.body;
    if (!field_name) return res.status(400).json({ success: false, error: 'Feldname erforderlich' });
    const result = await insert('INSERT INTO asset_custom_fields (field_name, field_type, options_json, sort_order) VALUES (?,?,?,?)',
      [field_name, field_type||'text', options_json ? JSON.stringify(options_json) : null, sort_order||0]);
    const field = await queryOne('SELECT * FROM asset_custom_fields WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: field });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/inventory/custom-fields/:id
async function updateCustomField(req, res) {
  try {
    const { field_name, field_type, options_json, sort_order, active } = req.body;
    const fields = []; const params = [];
    if (field_name !== undefined) { fields.push('field_name=?'); params.push(field_name); }
    if (field_type !== undefined) { fields.push('field_type=?'); params.push(field_type); }
    if (options_json !== undefined) { fields.push('options_json=?'); params.push(JSON.stringify(options_json)); }
    if (sort_order !== undefined) { fields.push('sort_order=?'); params.push(sort_order); }
    if (active !== undefined) { fields.push('active=?'); params.push(active?1:0); }
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'Keine Änderungen' });
    params.push(req.params.id);
    await insert(`UPDATE asset_custom_fields SET ${fields.join(',')} WHERE id=?`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// DELETE /api/inventory/custom-fields/:id
async function deleteCustomField(req, res) {
  try {
    await insert('DELETE FROM asset_custom_fields WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { list, stats, warnings, create, update, adjustStock, getMovements, getCustomFields, createCustomField, updateCustomField, deleteCustomField };
