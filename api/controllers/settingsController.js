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

// GET /api/settings/ssl-status — check nginx, certbot, current config
async function sslStatus(req, res) {
  const { execSync } = require('child_process');
  const fs = require('fs');
  const isLinux = process.platform === 'linux';

  const status = {
    platform: process.platform,
    isLinux,
    nginx: { installed: false, running: false, config_exists: false },
    certbot: { installed: false },
    domain: '',
    ssl_active: false,
    app_url: process.env.APP_URL || '',
    app_port: process.env.APP_PORT || '3000'
  };

  if (!isLinux) {
    return res.json({ success: true, data: { ...status, message: 'SSL-Setup über die Weboberfläche ist nur auf Linux verfügbar.' } });
  }

  try { execSync('which nginx', { stdio: 'pipe' }); status.nginx.installed = true; } catch {}
  try { const r = execSync('systemctl is-active nginx', { stdio: 'pipe' }).toString().trim(); status.nginx.running = r === 'active'; } catch {}
  try { execSync('which certbot', { stdio: 'pipe' }); status.certbot.installed = true; } catch {}

  status.nginx.config_exists = fs.existsSync('/etc/nginx/sites-available/helpdesk');
  if (status.nginx.config_exists) {
    try {
      const conf = fs.readFileSync('/etc/nginx/sites-available/helpdesk', 'utf8');
      const domainMatch = conf.match(/server_name\s+([^;]+)/);
      if (domainMatch) status.domain = domainMatch[1].trim();
      status.ssl_active = conf.includes('ssl') || conf.includes('443');
    } catch {}
  }

  // Extract domain from APP_URL
  if (!status.domain && process.env.APP_URL) {
    try { status.domain = new URL(process.env.APP_URL).hostname; } catch {}
  }

  res.json({ success: true, data: status });
}

// POST /api/settings/ssl-setup — configure nginx + certbot
async function sslSetup(req, res) {
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');

  if (process.platform !== 'linux') {
    return res.status(400).json({ success: false, error: 'Nur auf Linux-Servern verfügbar' });
  }

  const { action, domain, email } = req.body;
  const port = process.env.APP_PORT || '3000';
  const steps = [];

  try {
    if (action === 'install-nginx') {
      execSync('apt-get update -qq && apt-get install -y -qq nginx', { stdio: 'pipe', timeout: 120000 });
      execSync('systemctl enable nginx && systemctl start nginx', { stdio: 'pipe' });
      steps.push('Nginx installiert und gestartet');
    }

    else if (action === 'install-certbot') {
      execSync('apt-get install -y -qq certbot python3-certbot-nginx', { stdio: 'pipe', timeout: 120000 });
      steps.push('Certbot installiert');
    }

    else if (action === 'configure-nginx') {
      if (!domain) return res.status(400).json({ success: false, error: 'Domain erforderlich' });

      const nginxConf = `server {
    listen 80;
    server_name ${domain};

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
      fs.writeFileSync('/etc/nginx/sites-available/helpdesk', nginxConf);
      steps.push('Nginx-Konfiguration erstellt');

      // Enable site
      try { fs.unlinkSync('/etc/nginx/sites-enabled/helpdesk'); } catch {}
      fs.symlinkSync('/etc/nginx/sites-available/helpdesk', '/etc/nginx/sites-enabled/helpdesk');
      steps.push('Site aktiviert');

      // Remove default if exists
      try { fs.unlinkSync('/etc/nginx/sites-enabled/default'); } catch {}

      // Test and reload
      execSync('nginx -t', { stdio: 'pipe' });
      execSync('systemctl reload nginx', { stdio: 'pipe' });
      steps.push('Nginx neu geladen');

      // Update .env
      const envPath = path.resolve(__dirname, '..', '..', '.env');
      if (fs.existsSync(envPath)) {
        let env = fs.readFileSync(envPath, 'utf8');
        env = env.replace(/APP_URL=.*/g, `APP_URL=http://${domain}`);
        fs.writeFileSync(envPath, env);
        steps.push('APP_URL aktualisiert');
      }
    }

    else if (action === 'setup-ssl') {
      if (!domain) return res.status(400).json({ success: false, error: 'Domain erforderlich' });
      if (!email) return res.status(400).json({ success: false, error: 'E-Mail erforderlich' });

      // Run certbot
      const cmd = `certbot --nginx -d ${domain} --non-interactive --agree-tos --email ${email} --redirect`;
      execSync(cmd, { stdio: 'pipe', timeout: 120000 });
      steps.push('SSL-Zertifikat erstellt');
      steps.push('HTTPS-Redirect konfiguriert');

      // Update .env to https
      const envPath = path.resolve(__dirname, '..', '..', '.env');
      if (fs.existsSync(envPath)) {
        let env = fs.readFileSync(envPath, 'utf8');
        env = env.replace(/APP_URL=.*/g, `APP_URL=https://${domain}`);
        fs.writeFileSync(envPath, env);
        steps.push('APP_URL auf HTTPS aktualisiert');
      }
    }

    else {
      return res.status(400).json({ success: false, error: 'Unbekannte Aktion' });
    }

    res.json({ success: true, data: { steps } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: { steps } });
  }
}

module.exports = { getAll, update, testEmail, getEmailLogs, testImap, sslStatus, sslSetup };
