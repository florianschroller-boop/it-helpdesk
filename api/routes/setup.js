/**
 * Setup Wizard API
 * Only accessible when no admin user exists (first-run).
 * After setup completes, these routes return 403.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, queryOne, insert } = require('../config/database');

// Middleware: block setup if already completed
async function setupGuard(req, res, next) {
  try {
    const admin = await queryOne("SELECT id FROM users WHERE role LIKE '%admin%' LIMIT 1");
    if (admin) {
      return res.status(403).json({ success: false, error: 'Setup bereits abgeschlossen' });
    }
    next();
  } catch {
    next(); // Tables might not exist yet
  }
}

// GET /api/setup/status — check if setup is needed
router.get('/status', async (req, res) => {
  try {
    const admin = await queryOne("SELECT id FROM users WHERE role LIKE '%admin%' LIMIT 1");
    const settings = await queryOne("SELECT COUNT(*) as c FROM settings");
    res.json({
      success: true,
      data: {
        needs_setup: !admin,
        has_settings: settings?.c > 0,
        app_url: process.env.APP_URL || 'http://localhost:' + (process.env.APP_PORT || 3000)
      }
    });
  } catch {
    res.json({ success: true, data: { needs_setup: true, has_settings: false } });
  }
});

// POST /api/setup/admin — create first admin user
router.post('/admin', setupGuard, async (req, res) => {
  try {
    const { name, email, password, phone, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, E-Mail und Passwort erforderlich' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Passwort muss mindestens 8 Zeichen lang sein' });
    }

    const hash = await bcrypt.hash(password, 12);
    await insert(
      'INSERT INTO users (name, email, password_hash, role, department, phone, is_manager) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [name, email, hash, 'admin', department || null, phone || null]
    );

    // Generate invite key
    const inviteKey = crypto.randomBytes(4).toString('hex').toUpperCase();
    await insert('INSERT IGNORE INTO invite_keys (key_code, label, created_by) VALUES (?, ?, 1)', [inviteKey, 'Standard']);

    // Generate mailhook key
    await insert("INSERT INTO settings (key_name, value) VALUES ('mailhook_api_key', ?) ON DUPLICATE KEY UPDATE key_name=key_name",
      [crypto.randomBytes(32).toString('hex')]);

    res.json({ success: true, data: { inviteKey } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/setup/company — configure company/branding
router.post('/company', setupGuard, async (req, res) => {
  try {
    const { company_name, formality, primary_color, registration_enabled } = req.body;

    const settings = {
      'wl_company_name': company_name || 'IT-Helpdesk',
      'wl_formality': formality || 'sie',
      'wl_primary_color': primary_color || '#4F46E5',
      'wl_registration_enabled': registration_enabled !== false ? 'true' : 'false',
      'wl_logo_url': '',
      'wl_logo_login_url': '',
      'wl_favicon_url': ''
    };

    for (const [k, v] of Object.entries(settings)) {
      await insert('INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', [k, v, v]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/setup/organization — departments, positions, categories
router.post('/organization', setupGuard, async (req, res) => {
  try {
    const { departments, positions, ticket_categories } = req.body;

    if (departments) {
      const val = JSON.stringify(departments);
      await insert("INSERT INTO settings (key_name, value) VALUES ('departments', ?) ON DUPLICATE KEY UPDATE value = ?", [val, val]);
    }
    if (positions) {
      const val = JSON.stringify(positions);
      await insert("INSERT INTO settings (key_name, value) VALUES ('positions', ?) ON DUPLICATE KEY UPDATE value = ?", [val, val]);
    }
    if (ticket_categories) {
      const val = JSON.stringify(ticket_categories);
      await insert("INSERT INTO settings (key_name, value) VALUES ('ticket_categories', ?) ON DUPLICATE KEY UPDATE value = ?", [val, val]);
    }

    // KB categories
    for (const cat of [['Hardware','hardware',1],['Software','software',2],['Netzwerk','netzwerk',3],['Anleitungen','anleitungen',4]]) {
      await insert('INSERT IGNORE INTO kb_categories (name, slug, sort_order) VALUES (?, ?, ?)', cat);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/setup/email — SMTP configuration
router.post('/email', setupGuard, async (req, res) => {
  try {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, mail_from_address, mail_from_name } = req.body;

    const settings = { smtp_host, smtp_port, smtp_user, smtp_pass, mail_from_address, mail_from_name };
    for (const [k, v] of Object.entries(settings)) {
      if (v !== undefined && v !== '') {
        await insert('INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', [k, v, v]);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/setup/complete — finalize setup
router.post('/complete', async (req, res) => {
  try {
    // Ensure default settings exist
    const defaults = {
      'company_name': 'IT-Helpdesk',
      'sla_default_hours': '24',
      'network_check_method': 'http'
    };
    for (const [k, v] of Object.entries(defaults)) {
      await insert('INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_name=key_name', [k, v]);
    }

    res.json({ success: true, message: 'Setup abgeschlossen! Sie können sich jetzt anmelden.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/setup/demo — insert demo data
router.post('/demo', setupGuard, async (req, res) => {
  try {
    const hash = await bcrypt.hash('demo123', 12);
    const year = new Date().getFullYear();

    for (const u of [
      ['Max Mustermann','max@demo.local',hash,'agent','IT'],
      ['Hans Schmidt','hans@demo.local',hash,'user','Vertrieb'],
      ['Anna Weber','anna@demo.local',hash,'user','Buchhaltung']
    ]) await insert('INSERT IGNORE INTO users (name,email,password_hash,role,department) VALUES (?,?,?,?,?)', u);

    await insert('INSERT IGNORE INTO ticket_counters (year,last_number) VALUES (?,0)', [year]);

    for (const [title, cat, prio] of [['Laptop defekt','Hardware','high'],['Outlook-Problem','Software','medium'],['Passwort-Reset','Zugang/Passwort','medium']]) {
      await insert('UPDATE ticket_counters SET last_number=last_number+1 WHERE year=?', [year]);
      const c = await queryOne('SELECT last_number FROM ticket_counters WHERE year=?', [year]);
      await insert("INSERT IGNORE INTO tickets (ticket_number,title,category,priority,status,requester_id,source,sla_due_at) VALUES (?,?,?,?,'open',1,'web',DATE_ADD(NOW(),INTERVAL 24 HOUR))",
        [`#IT-${year}-${String(c.last_number).padStart(4,'0')}`, title, cat, prio]);
    }

    for (const t of [
      ['Begruessung','Hallo {{name}},\n\nvielen Dank fuer Ihre Anfrage.\n\nMit freundlichen Gruessen\nIhr IT-Team',null],
      ['Ticket geloest','Hallo {{name}},\n\nIhr Anliegen wurde bearbeitet.\n\nMit freundlichen Gruessen\nIhr IT-Team',null]
    ]) await insert('INSERT IGNORE INTO response_templates (title,content,category) VALUES (?,?,?)', t);

    res.json({ success: true, message: 'Demo-Daten eingefügt (max@demo.local / demo123)' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
