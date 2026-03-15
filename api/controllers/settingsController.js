const { query, queryOne, insert } = require('../config/database');

// GET /api/settings
async function getAll(req, res) {
  try {
    const rows = await query('SELECT key_name, value FROM settings');
    const settings = {};
    for (const row of rows) {
      try {
        settings[row.key_name] = JSON.parse(row.value);
      } catch {
        settings[row.key_name] = row.value;
      }
    }
    // Never return passwords to frontend
    if (settings.smtp_pass) settings.smtp_pass = '••••••••';
    if (settings.imap_pass) settings.imap_pass = '••••••••';

    res.json({ success: true, data: settings });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// PUT /api/settings
async function update(req, res) {
  try {
    const settings = req.body;

    // Don't save masked passwords
    if (settings.smtp_pass === '••••••••') delete settings.smtp_pass;
    if (settings.imap_pass === '••••••••') delete settings.imap_pass;

    for (const [key, value] of Object.entries(settings)) {
      const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await insert(
        'INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
        [key, val, val]
      );
    }

    // Reset email service cache so it picks up new settings
    const NotificationService = require('../services/NotificationService');
    NotificationService.resetConfig();

    res.json({ success: true, message: 'Einstellungen gespeichert' });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/settings/test-email
async function testEmail(req, res) {
  try {
    const NotificationService = require('../services/NotificationService');
    const { host, port, user, pass, from_address, to } = req.body || {};
    const recipientEmail = to || req.user.email;

    let result;

    if (host && user) {
      // Test with explicitly provided params (from form)
      result = await NotificationService.testWithParams({ host, port: port || 587, user, pass: pass || '' });
    } else {
      // Test with saved config
      result = await NotificationService.testConnection();
    }

    if (result.success) {
      // Determine which transport to use for sending test mail
      const config = await NotificationService.getSmtpConfig();
      const sendResult = await NotificationService.send(
        recipientEmail,
        'IT-Helpdesk — Test-E-Mail',
        'ticket-created',
        {
          ticket_number: '#TEST-0000',
          title: 'Dies ist eine Test-E-Mail',
          description: 'Wenn Sie diese E-Mail erhalten, funktioniert die SMTP-Konfiguration korrekt.',
          status: 'Test',
          priority: 'info',
          app_url: process.env.APP_URL || 'http://localhost:3000'
        }
      );

      if (sendResult.success && !sendResult.stub) {
        res.json({ success: true, message: `Verbindung OK. Test-E-Mail gesendet an ${recipientEmail}` });
      } else if (sendResult.stub) {
        res.json({ success: true, message: 'Verbindungstest erfolgreich, aber E-Mail-Versand ist noch als Stub aktiv.' });
      } else {
        res.json({ success: false, error: sendResult.error || 'Senden fehlgeschlagen' });
      }
    } else {
      res.json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/settings/email-logs
async function getEmailLogs(req, res) {
  try {
    const logs = await query(
      `SELECT id, direction, from_email, to_email, subject,
        DATE_FORMAT(received_at, '%d.%m.%Y %H:%i') as date_formatted,
        received_at
       FROM email_logs ORDER BY received_at DESC LIMIT 30`
    );
    res.json({ success: true, data: logs });
  } catch (err) {
    console.error('Email logs error:', err);
    res.status(500).json({ success: false, error: 'Serverfehler' });
  }
}

// POST /api/settings/test-imap
async function testImap(req, res) {
  try {
    const Imap = require('imap');
    const EmailPoller = require('../services/EmailPoller');
    const config = await EmailPoller.getImapConfig();

    if (!config.host || !config.user) {
      return res.json({ success: false, error: 'IMAP nicht konfiguriert (Host oder Benutzer fehlt)' });
    }

    const useTls = config.encryption !== 'starttls' && config.encryption !== 'none';
    const imapOpts = {
      user: config.user,
      password: config.pass,
      host: config.host,
      port: config.port,
      tls: useTls,
      autotls: config.encryption === 'starttls' ? 'always' : 'never',
      tlsOptions: { rejectUnauthorized: false, servername: config.host },
      authTimeout: 15000
    };

    // OAuth2 if configured
    if (config.authMethod === 'oauth2') {
      try {
        const token = await EmailPoller.getOAuth2Token(config);
        imapOpts.xoauth2 = EmailPoller.buildXOAuth2Token(config.user, token);
        delete imapOpts.password;
      } catch (err) {
        return res.json({ success: false, error: 'OAuth2 Token-Fehler: ' + err.message });
      }
    }

    // Test connection with timeout
    const result = await new Promise((resolve) => {
      const imap = new Imap(imapOpts);
      const timeout = setTimeout(() => { try { imap.end(); } catch {} resolve({ success: false, error: 'Timeout nach 15 Sekunden' }); }, 16000);

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
          clearTimeout(timeout);
          if (err) { imap.end(); resolve({ success: false, error: 'Inbox-Fehler: ' + err.message }); return; }
          const info = `Verbunden! ${box.messages.total} Nachrichten in der Inbox.`;
          imap.search(['UNSEEN'], (err2, uids) => {
            imap.end();
            const unread = uids ? uids.length : 0;
            resolve({ success: true, message: `${info} ${unread} ungelesene E-Mail(s).` });
          });
        });
      });

      imap.once('error', (err) => {
        clearTimeout(timeout);
        let msg = err.message;
        if (err.source === 'authentication') {
          msg = 'Authentifizierung fehlgeschlagen. ';
          if (config.authMethod === 'oauth2') {
            msg += 'OAuth2-Token ungültig oder IMAP-Berechtigung fehlt.';
          } else {
            msg += 'Passwort falsch, MFA aktiv, oder Basic Auth für IMAP deaktiviert.';
          }
        }
        resolve({ success: false, error: msg });
      });

      imap.connect();
    });

    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
}

module.exports = { getAll, update, testEmail, getEmailLogs, testImap };
