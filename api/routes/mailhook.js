/**
 * Mail Webhook — empfängt weitergeleitete E-Mails per HTTP POST.
 *
 * Nutzung:
 * 1. Outlook-Regel: Alle eingehenden Mails an Helpdesk-Postfach weiterleiten
 * 2. Power Automate: Bei neuer Mail → HTTP POST an /api/mailhook/incoming
 * 3. Oder: Externer Forwarder der Mails per HTTP sendet
 *
 * Endpunkt: POST /api/mailhook/incoming
 * Body: { from, subject, body, message_id }
 * Auth: Bearer Token (API-Key in Settings)
 */

const express = require('express');
const router = express.Router();
const { query, queryOne, insert, getPool } = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// POST /api/mailhook/incoming
router.post('/incoming', async (req, res) => {
  try {
    // Auth via API key or Bearer token
    const authHeader = req.headers.authorization || '';
    const apiKey = authHeader.replace('Bearer ', '');

    const storedKey = await queryOne("SELECT value FROM settings WHERE key_name = 'mailhook_api_key'");
    if (!storedKey || !storedKey.value || apiKey !== storedKey.value) {
      return res.status(401).json({ success: false, error: 'Ungültiger API-Key' });
    }

    const { from, from_name, subject, body, message_id, in_reply_to } = req.body;

    if (!from || !subject) {
      return res.status(400).json({ success: false, error: 'from und subject erforderlich' });
    }

    const fromEmail = from;
    const fromDisplayName = from_name || from.split('@')[0];
    const textBody = body || '';

    console.log(`[MAILHOOK] Received: "${subject}" from ${fromEmail}`);

    // Check if reply to existing ticket
    let existingTicket = null;
    const ticketMatch = subject.match(/#IT-\d{4}-\d{4}/);
    if (ticketMatch) {
      existingTicket = await queryOne('SELECT * FROM tickets WHERE ticket_number = ?', [ticketMatch[0]]);
    }

    if (existingTicket) {
      // Add as comment
      let user = await queryOne('SELECT * FROM users WHERE email = ?', [fromEmail]);
      if (!user) {
        const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
        const result = await insert('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
          [fromDisplayName, fromEmail, hash, 'user']);
        user = await queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
      }

      await insert('INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal) VALUES (?, ?, ?, 0)',
        [existingTicket.id, user.id, textBody]);
      await insert('UPDATE tickets SET updated_at = NOW() WHERE id = ?', [existingTicket.id]);

      // Log
      await insert('INSERT INTO email_logs (ticket_id, direction, from_email, to_email, subject, body) VALUES (?, ?, ?, ?, ?, ?)',
        [existingTicket.id, 'in', fromEmail, '', subject, textBody]);

      console.log(`[MAILHOOK] Added comment to ${existingTicket.ticket_number}`);
      return res.json({ success: true, action: 'comment', ticket: existingTicket.ticket_number });
    }

    // Create new ticket
    let user = await queryOne('SELECT * FROM users WHERE email = ?', [fromEmail]);
    if (!user) {
      const hash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
      const result = await insert('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [fromDisplayName, fromEmail, hash, 'user']);
      user = await queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
      console.log(`[MAILHOOK] Auto-created user: ${fromEmail}`);
    }

    // Generate ticket number
    const year = new Date().getFullYear();
    const db = getPool();
    await db.query('INSERT INTO ticket_counters (year, last_number) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_number = last_number + 1', [year]);
    const counter = await queryOne('SELECT last_number FROM ticket_counters WHERE year = ?', [year]);
    const ticketNumber = `#IT-${year}-${String(counter.last_number).padStart(4, '0')}`;

    const slaDue = new Date(Date.now() + 24 * 3600000);
    const result = await insert(
      "INSERT INTO tickets (ticket_number, title, description, category, priority, requester_id, source, sla_due_at) VALUES (?, ?, ?, 'Sonstiges', 'medium', ?, 'email', ?)",
      [ticketNumber, subject, textBody, user.id, slaDue]
    );

    await insert('INSERT INTO ticket_history (ticket_id, changed_by, field_changed, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
      [result.insertId, user.id, 'status', null, 'open']);

    // Log
    await insert('INSERT INTO email_logs (ticket_id, direction, from_email, to_email, subject, body) VALUES (?, ?, ?, ?, ?, ?)',
      [result.insertId, 'in', fromEmail, '', subject, textBody]);

    console.log(`[MAILHOOK] Created ticket ${ticketNumber} from ${fromEmail}`);

    // Send confirmation
    const NotificationService = require('../services/NotificationService');
    const ticket = await queryOne('SELECT * FROM tickets WHERE id = ?', [result.insertId]);
    NotificationService.ticketCreated(ticket, fromEmail).catch(() => {});

    res.json({ success: true, action: 'created', ticket: ticketNumber });
  } catch (err) {
    console.error('[MAILHOOK] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/mailhook/test — verify API key
router.get('/test', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const apiKey = authHeader.replace('Bearer ', '');
  const storedKey = await queryOne("SELECT value FROM settings WHERE key_name = 'mailhook_api_key'");
  if (!storedKey || !storedKey.value || apiKey !== storedKey.value) {
    return res.status(401).json({ success: false, error: 'Ungültiger API-Key' });
  }
  res.json({ success: true, message: 'API-Key gültig' });
});

module.exports = router;
