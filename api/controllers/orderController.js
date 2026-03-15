const { query, queryOne, insert } = require('../config/database');
const NotificationService = require('../services/NotificationService');

const DEFAULT_STEPS = [
  { step_name: 'Anfrage eingegangen', step_order: 1 },
  { step_name: 'In Prüfung', step_order: 2 },
  { step_name: 'Genehmigt', step_order: 3 },
  { step_name: 'Bestellung aufgegeben', step_order: 4 },
  { step_name: 'Versandt', step_order: 5 },
  { step_name: 'Geliefert', step_order: 6 },
  { step_name: 'Abgeschlossen', step_order: 7 }
];

async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const count = await queryOne("SELECT COUNT(*) as c FROM orders WHERE YEAR(created_at) = ?", [year]);
  return `ORD-${year}-${String((count.c || 0) + 1).padStart(4, '0')}`;
}

// GET /api/orders
async function list(req, res) {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const selectFields = 'SELECT o.*, r.name as requested_by_name, a.name as approved_by_name';
    const fromClause = ' FROM orders o LEFT JOIN users r ON o.requested_by = r.id LEFT JOIN users a ON o.approved_by = a.id';
    let where = ' WHERE 1=1';
    const params = [];

    if (req.user.role === 'user') {
      where += ' AND o.requested_by = ?'; params.push(req.user.id);
    }
    if (status) { where += ' AND o.status = ?'; params.push(status); }
    if (search) { where += ' AND (o.title LIKE ? OR o.order_number LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const countSql = `SELECT COUNT(*) as total${fromClause}${where}`;
    const total = await queryOne(countSql, params);

    let sql = selectFields + fromClause + where;
    sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    const orders = await query(sql, params);

    res.json({ success: true, data: orders, pagination: { page: parseInt(page), limit: parseInt(limit), total: total.total, pages: Math.ceil(total.total / parseInt(limit)) } });
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/orders
async function create(req, res) {
  try {
    const { title, description, priority, items } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Titel erforderlich' });

    const orderNumber = await generateOrderNumber();
    const result = await insert(
      'INSERT INTO orders (order_number, title, description, requested_by, priority) VALUES (?, ?, ?, ?, ?)',
      [orderNumber, title, description || '', req.user.id, priority || 'medium']
    );
    const orderId = result.insertId;

    // Insert items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.item_name) {
          await insert('INSERT INTO order_items (order_id, item_name, quantity, unit_price, specs) VALUES (?, ?, ?, ?, ?)',
            [orderId, item.item_name, item.quantity || 1, item.unit_price || null, item.specs || null]);
        }
      }
    }

    // Create default steps
    for (const step of DEFAULT_STEPS) {
      const status = step.step_order === 1 ? 'completed' : 'pending';
      await insert('INSERT INTO order_progress_steps (order_id, step_name, step_order, status, completed_at, completed_by) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, step.step_name, step.step_order, status, step.step_order === 1 ? new Date() : null, step.step_order === 1 ? req.user.id : null]);
    }
    // Set step 2 as active
    await insert("UPDATE order_progress_steps SET status = 'active' WHERE order_id = ? AND step_order = 2", [orderId]);

    const order = await queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// GET /api/orders/:id
async function getById(req, res) {
  try {
    const order = await queryOne(
      `SELECT o.*, r.name as requested_by_name, r.email as requested_by_email, a.name as approved_by_name
       FROM orders o LEFT JOIN users r ON o.requested_by = r.id LEFT JOIN users a ON o.approved_by = a.id WHERE o.id = ?`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ success: false, error: 'Bestellung nicht gefunden' });

    if (req.user.role === 'user' && order.requested_by !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Keine Berechtigung' });
    }

    order.items = await query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    order.steps = await query(
      `SELECT s.*, u.name as completed_by_name FROM order_progress_steps s LEFT JOIN users u ON s.completed_by = u.id WHERE s.order_id = ? ORDER BY s.step_order`,
      [order.id]
    );

    res.json({ success: true, data: order });
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/orders/:id/step — advance to next step
async function advanceStep(req, res) {
  try {
    const orderId = req.params.id;
    const { notes } = req.body;

    const order = await queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ success: false, error: 'Bestellung nicht gefunden' });

    // Find current active step
    const activeStep = await queryOne("SELECT * FROM order_progress_steps WHERE order_id = ? AND status = 'active'", [orderId]);
    if (!activeStep) return res.status(400).json({ success: false, error: 'Kein aktiver Schritt' });

    // Complete current step
    await insert("UPDATE order_progress_steps SET status = 'completed', completed_at = NOW(), completed_by = ?, notes = ? WHERE id = ?",
      [req.user.id, notes || null, activeStep.id]);

    // Activate next step
    const nextStep = await queryOne("SELECT * FROM order_progress_steps WHERE order_id = ? AND step_order = ?",
      [orderId, activeStep.step_order + 1]);

    if (nextStep) {
      await insert("UPDATE order_progress_steps SET status = 'active' WHERE id = ?", [nextStep.id]);
    }

    // Update order status based on step
    const statusMap = { 3: 'approved', 4: 'ordered', 5: 'shipped', 6: 'delivered', 7: 'completed' };
    const newStatus = statusMap[activeStep.step_order];
    if (newStatus) {
      await insert('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, orderId]);
      if (newStatus === 'approved') {
        await insert('UPDATE orders SET approved_by = ? WHERE id = ?', [req.user.id, orderId]);
      }
    }

    // Notify requester
    const requester = await queryOne('SELECT email FROM users WHERE id = ?', [order.requested_by]);
    if (requester) {
      NotificationService.send(requester.email,
        `[${order.order_number}] Bestellstatus: ${activeStep.step_name} abgeschlossen`,
        'ticket-updated',
        { ticket_number: order.order_number, title: order.title, changes: `Schritt "${activeStep.step_name}" abgeschlossen`, app_url: process.env.APP_URL || 'http://localhost:3000' }
      ).catch(() => {});
    }

    res.json({ success: true, message: `Schritt "${activeStep.step_name}" abgeschlossen` });
  } catch (err) {
    console.error('Advance step error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/orders/:id/reject
async function reject(req, res) {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, error: 'Begründung erforderlich' });

    const order = await queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, error: 'Bestellung nicht gefunden' });

    await insert("UPDATE orders SET status = 'rejected', rejection_reason = ?, approved_by = ?, updated_at = NOW() WHERE id = ?",
      [reason, req.user.id, req.params.id]);

    // Mark all pending steps as completed (cancelled)
    await insert("UPDATE order_progress_steps SET status = 'completed' WHERE order_id = ? AND status IN ('active', 'pending')", [req.params.id]);

    res.json({ success: true, message: 'Bestellung abgelehnt' });
  } catch (err) {
    console.error('Reject order error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { list, create, getById, advanceStep, reject };
