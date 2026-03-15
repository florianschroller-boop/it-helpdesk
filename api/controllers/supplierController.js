const { query, queryOne, insert } = require('../config/database');
const NotificationService = require('../services/NotificationService');

// GET /api/suppliers
async function list(req, res) {
  try {
    const suppliers = await query('SELECT * FROM suppliers WHERE active = 1 ORDER BY name');
    res.json({ success: true, data: suppliers });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// GET /api/suppliers/:id
async function getById(req, res) {
  try {
    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ success: false, error: 'Lieferant nicht gefunden' });

    // Related assets
    supplier.assets = await query(
      'SELECT id, asset_tag, name, type, model FROM assets WHERE supplier_id = ? ORDER BY asset_tag', [supplier.id]
    );
    // Related inventory items
    supplier.inventory_items = await query(
      'SELECT id, name, sku, quantity, min_quantity FROM inventory_items WHERE supplier_id = ? ORDER BY name', [supplier.id]
    );
    // Quote history
    supplier.quotes = await query(
      'SELECT q.*, u.name as sent_by_name FROM quote_requests q LEFT JOIN users u ON q.sent_by = u.id WHERE q.supplier_id = ? ORDER BY q.sent_at DESC LIMIT 20', [supplier.id]
    );

    res.json({ success: true, data: supplier });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// POST /api/suppliers
async function create(req, res) {
  try {
    const { name, contact_name, contact_email, contact_phone, website, address, customer_number, notes, quote_email_template } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name erforderlich' });

    const result = await insert(
      'INSERT INTO suppliers (name, contact_name, contact_email, contact_phone, website, address, customer_number, notes, quote_email_template) VALUES (?,?,?,?,?,?,?,?,?)',
      [name, contact_name||null, contact_email||null, contact_phone||null, website||null, address||null, customer_number||null, notes||null, quote_email_template||null]
    );
    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: supplier });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler: ' + err.message });
  }
}

// PUT /api/suppliers/:id
async function update(req, res) {
  try {
    const { name, contact_name, contact_email, contact_phone, website, address, customer_number, notes, quote_email_template, active } = req.body;
    const fields = []; const params = [];
    if (name !== undefined) { fields.push('name=?'); params.push(name); }
    if (contact_name !== undefined) { fields.push('contact_name=?'); params.push(contact_name||null); }
    if (contact_email !== undefined) { fields.push('contact_email=?'); params.push(contact_email||null); }
    if (contact_phone !== undefined) { fields.push('contact_phone=?'); params.push(contact_phone||null); }
    if (website !== undefined) { fields.push('website=?'); params.push(website||null); }
    if (address !== undefined) { fields.push('address=?'); params.push(address||null); }
    if (customer_number !== undefined) { fields.push('customer_number=?'); params.push(customer_number||null); }
    if (notes !== undefined) { fields.push('notes=?'); params.push(notes||null); }
    if (quote_email_template !== undefined) { fields.push('quote_email_template=?'); params.push(quote_email_template||null); }
    if (active !== undefined) { fields.push('active=?'); params.push(active?1:0); }
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'Keine Änderungen' });
    params.push(req.params.id);
    await insert(`UPDATE suppliers SET ${fields.join(',')} WHERE id=?`, params);
    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: supplier });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/suppliers/:id/quote — send quote request
async function sendQuote(req, res) {
  try {
    const { subject, body, asset_id } = req.body;
    const supplier = await queryOne('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier) return res.status(404).json({ success: false, error: 'Lieferant nicht gefunden' });
    if (!supplier.contact_email) return res.status(400).json({ success: false, error: 'Keine E-Mail beim Lieferanten hinterlegt' });
    if (!subject || !body) return res.status(400).json({ success: false, error: 'Betreff und Text erforderlich' });

    const config = await NotificationService.getSmtpConfig();
    const transport = await NotificationService.getTransporter();

    if (!transport) {
      return res.status(400).json({ success: false, error: 'SMTP nicht konfiguriert' });
    }

    // Send email with the user-composed body
    const htmlBody = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    await transport.sendMail({
      from: `"${config.fromName}" <${config.fromAddress}>`,
      to: supplier.contact_email,
      subject,
      text: body,
      html: htmlBody
    });
    transport.close();

    // Log quote request
    await insert(
      'INSERT INTO quote_requests (supplier_id, asset_id, subject, body, sent_to, sent_by) VALUES (?,?,?,?,?,?)',
      [supplier.id, asset_id || null, subject, body, supplier.contact_email, req.user.id]
    );

    // Log in email_logs
    await NotificationService.logEmail('out', config.fromAddress, supplier.contact_email, subject, htmlBody, null);

    console.log(`[QUOTE] Sent to ${supplier.contact_email}: ${subject}`);
    res.json({ success: true, message: `Angebotsanfrage gesendet an ${supplier.contact_email}` });
  } catch (err) {
    console.error('Send quote error:', err);
    res.status(500).json({ success: false, error: 'Fehler beim Senden: ' + err.message });
  }
}

// GET /api/suppliers/quote-template
async function getQuoteTemplate(req, res) {
  try {
    const setting = await queryOne("SELECT value FROM settings WHERE key_name = 'quote_email_template'");
    res.json({ success: true, data: setting?.value || '' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

module.exports = { list, getById, create, update, sendQuote, getQuoteTemplate };
