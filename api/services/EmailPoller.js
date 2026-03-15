/**
 * IMAP Email Poller Service
 * Polls an IMAP inbox for new emails and converts them to tickets / comments.
 *
 * - New emails → new ticket
 * - Replies (In-Reply-To or ticket number in subject) → comment on existing ticket
 * - Unknown senders → auto-created as user
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, queryOne, insert, getPool } = require('../config/database');
const NotificationService = require('./NotificationService');

class EmailPoller {
  constructor() {
    this.running = false;
    this.interval = null;
  }

  // Load IMAP config from DB, fallback to .env
  async getImapConfig() {
    try {
      const rows = await query("SELECT key_name, value FROM settings WHERE key_name IN ('imap_host','imap_port','imap_user','imap_pass','imap_auth_method','imap_encryption','mail_poll_interval')");
      const db = {};
      for (const r of rows) {
        try { db[r.key_name] = JSON.parse(r.value); } catch { db[r.key_name] = r.value; }
      }
      return {
        host: db.imap_host || process.env.MAIL_IMAP_HOST || '',
        port: parseInt(db.imap_port || process.env.MAIL_IMAP_PORT || '993'),
        user: db.imap_user || process.env.MAIL_IMAP_USER || '',
        pass: db.imap_pass || process.env.MAIL_IMAP_PASS || '',
        authMethod: db.imap_auth_method || 'password',
        encryption: db.imap_encryption || 'tls',
        pollMinutes: parseInt(db.mail_poll_interval || process.env.MAIL_POLL_INTERVAL_MINUTES || '2')
      };
    } catch {
      return {
        host: process.env.MAIL_IMAP_HOST || '',
        port: parseInt(process.env.MAIL_IMAP_PORT || '993'),
        user: process.env.MAIL_IMAP_USER || '',
        pass: process.env.MAIL_IMAP_PASS || '',
        authMethod: 'password',
        encryption: 'tls',
        pollMinutes: parseInt(process.env.MAIL_POLL_INTERVAL_MINUTES || '2')
      };
    }
  }

  // Get OAuth2 access token for IMAP (Microsoft 365)
  async getOAuth2Token(config) {
    // Read OAuth credentials from DB first, fallback to .env
    let clientId = process.env.MS_OAUTH_CLIENT_ID;
    let clientSecret = process.env.MS_OAUTH_CLIENT_SECRET;
    let tenantId = process.env.MS_OAUTH_TENANT_ID || 'common';

    try {
      const rows = await query("SELECT key_name, value FROM settings WHERE key_name IN ('ms_oauth_client_id','ms_oauth_client_secret','ms_oauth_tenant_id')");
      for (const r of rows) {
        let v; try { v = JSON.parse(r.value); } catch { v = r.value; }
        if (r.key_name === 'ms_oauth_client_id' && v) clientId = v;
        if (r.key_name === 'ms_oauth_client_secret' && v) clientSecret = v;
        if (r.key_name === 'ms_oauth_tenant_id' && v) tenantId = v;
      }
    } catch {}

    if (!clientId || !clientSecret) {
      throw new Error('MS OAuth nicht konfiguriert (Client-ID/Secret fehlt). Bitte unter Einstellungen -> Microsoft OAuth konfigurieren.');
    }

    // Client Credentials flow for IMAP
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://outlook.office365.com/.default',
      grant_type: 'client_credentials'
    });

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(`OAuth2 Token-Fehler: ${err.error_description || err.error || resp.status}`);
    }

    const data = await resp.json();
    return data.access_token;
  }

  // Start polling at configured interval
  async start() {
    const config = await this.getImapConfig();

    if (!config.host || !config.user) {
      console.log('[EMAIL-POLLER] IMAP not configured — polling disabled');
      // Re-check every 60s in case settings get configured later
      setTimeout(() => this.start(), 60000);
      return;
    }

    console.log(`[EMAIL-POLLER] Starting, polling every ${config.pollMinutes} min (${config.host})`);
    this.poll(); // First run immediately
    this.interval = setInterval(() => this.poll(), config.pollMinutes * 60 * 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async poll() {
    if (this.running) return;
    this.running = true;

    try {
      await this.fetchEmails();
    } catch (err) {
      console.error('[EMAIL-POLLER] Error:', err.message);
    } finally {
      this.running = false;
    }
  }

  async fetchEmails() {
    const config = await this.getImapConfig();

    if (!config.host || !config.user) return;

    // Build IMAP connection options
    const useTls = config.encryption !== 'starttls' && config.encryption !== 'none';
    const imapOpts = {
      user: config.user,
      host: config.host,
      port: config.port,
      tls: useTls,
      autotls: config.encryption === 'starttls' ? 'always' : 'never',
      tlsOptions: { rejectUnauthorized: false, servername: config.host },
      authTimeout: 15000
    };

    if (config.authMethod === 'oauth2') {
      // Microsoft 365 OAuth2 (XOAUTH2)
      try {
        const accessToken = await this.getOAuth2Token(config);
        imapOpts.xoauth2 = this.buildXOAuth2Token(config.user, accessToken);
      } catch (err) {
        console.error('[EMAIL-POLLER] OAuth2 Token-Fehler:', err.message);
        return;
      }
    } else {
      // Basic Auth (password)
      imapOpts.password = config.pass;
    }

    return new Promise((resolve, reject) => {
      const imap = new Imap(imapOpts);

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          // Search for unseen emails
          imap.search(['UNSEEN'], (err, uids) => {
            if (err) {
              imap.end();
              return reject(err);
            }

            if (!uids || uids.length === 0) {
              console.log('[EMAIL-POLLER] No new emails');
              imap.end();
              return resolve();
            }

            console.log(`[EMAIL-POLLER] Found ${uids.length} new email(s)`);

            const fetch = imap.fetch(uids, { bodies: '', markSeen: true });
            const emailPromises = [];

            fetch.on('message', (msg) => {
              let buffer = '';
              msg.on('body', (stream) => {
                stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); });
                stream.on('end', () => {
                  emailPromises.push(this.processEmail(buffer));
                });
              });
            });

            fetch.once('error', (err) => {
              console.error('[EMAIL-POLLER] Fetch error:', err.message);
            });

            fetch.once('end', async () => {
              await Promise.allSettled(emailPromises);
              imap.end();
              resolve();
            });
          });
        });
      });

      imap.once('error', (err) => {
        if (err.source === 'authentication') {
          console.error(`[EMAIL-POLLER] Authentifizierung fehlgeschlagen (${config.host}). ` +
            (config.authMethod === 'oauth2'
              ? 'OAuth2-Token ungueltig. Pruefen Sie MS OAuth Client-ID/Secret und API-Berechtigungen (IMAP.AccessAsApp).'
              : 'Passwort falsch oder Basic Auth deaktiviert. Fuer M365 auf "OAuth2 (Microsoft 365)" umstellen.'));
        } else {
          console.error('[EMAIL-POLLER] IMAP error:', err.message);
        }
        reject(err);
      });

      imap.once('end', () => {});

      imap.connect();
    });
  }

  // Build XOAUTH2 token string for IMAP
  buildXOAuth2Token(user, accessToken) {
    const str = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
    return Buffer.from(str).toString('base64');
  }

  async processEmail(rawEmail) {
    try {
      const parsed = await simpleParser(rawEmail);

      const fromAddress = parsed.from?.value?.[0]?.address;
      const fromName = parsed.from?.value?.[0]?.name || fromAddress;
      const subject = parsed.subject || '(Kein Betreff)';
      const textBody = parsed.text || '';
      const htmlBody = parsed.html || textBody;
      const messageId = parsed.messageId;
      const inReplyTo = parsed.inReplyTo;

      if (!fromAddress) {
        console.log('[EMAIL-POLLER] Skipping email without from address');
        return;
      }

      console.log(`[EMAIL-POLLER] Processing: "${subject}" from ${fromAddress}`);

      // Check if this is a reply to an existing ticket
      const existingTicket = await this.findExistingTicket(subject, inReplyTo, messageId);

      if (existingTicket) {
        await this.addCommentToTicket(existingTicket, fromAddress, fromName, textBody, messageId);
      } else {
        await this.createTicketFromEmail(fromAddress, fromName, subject, textBody, parsed.attachments, messageId);
      }

      // Log the incoming email
      await NotificationService.logEmail(
        'in', fromAddress,
        process.env.MAIL_IMAP_USER || '',
        subject, htmlBody,
        existingTicket?.id || null
      );

    } catch (err) {
      console.error('[EMAIL-POLLER] Process error:', err.message);
    }
  }

  // Try to find an existing ticket by ticket number in subject or In-Reply-To header
  async findExistingTicket(subject, inReplyTo, messageId) {
    // 1. Check ticket number pattern in subject: #IT-2025-0001
    const ticketMatch = subject.match(/#IT-\d{4}-\d{4}/);
    if (ticketMatch) {
      const ticket = await queryOne(
        'SELECT * FROM tickets WHERE ticket_number = ?',
        [ticketMatch[0]]
      );
      if (ticket) return ticket;
    }

    // 2. Check In-Reply-To against our sent message IDs in email_logs
    if (inReplyTo) {
      const log = await queryOne(
        'SELECT ticket_id FROM email_logs WHERE message_id = ? AND ticket_id IS NOT NULL',
        [inReplyTo]
      );
      if (log?.ticket_id) {
        return queryOne('SELECT * FROM tickets WHERE id = ?', [log.ticket_id]);
      }
    }

    return null;
  }

  // Add email as comment to existing ticket
  async addCommentToTicket(ticket, fromEmail, fromName, body, messageId) {
    // Find or create user
    const user = await this.findOrCreateUser(fromEmail, fromName);

    // Clean body (remove quoted text heuristic)
    const cleanBody = this.stripQuotedText(body);

    await insert(
      'INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal) VALUES (?, ?, ?, 0)',
      [ticket.id, user.id, cleanBody]
    );

    // Update ticket timestamp
    await insert('UPDATE tickets SET updated_at = NOW() WHERE id = ?', [ticket.id]);

    console.log(`[EMAIL-POLLER] Added comment to ticket ${ticket.ticket_number} from ${fromEmail}`);

    // Notify assignee if different from commenter
    if (ticket.assignee_id && ticket.assignee_id !== user.id) {
      const assignee = await queryOne('SELECT email FROM users WHERE id = ?', [ticket.assignee_id]);
      if (assignee) {
        await NotificationService.ticketCommented(ticket, fromName, assignee.email);
      }
    }
  }

  // Create new ticket from email
  async createTicketFromEmail(fromEmail, fromName, subject, body, attachments, messageId) {
    const user = await this.findOrCreateUser(fromEmail, fromName);

    // Generate ticket number
    const year = new Date().getFullYear();
    const db = getPool();
    await db.execute(
      'INSERT INTO ticket_counters (year, last_number) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_number = last_number + 1',
      [year]
    );
    const counter = await queryOne('SELECT last_number FROM ticket_counters WHERE year = ?', [year]);
    const ticketNumber = `#IT-${year}-${String(counter.last_number).padStart(4, '0')}`;

    // SLA
    const slaDue = new Date(Date.now() + 24 * 3600000);

    const result = await insert(
      `INSERT INTO tickets (ticket_number, title, description, category, priority, requester_id, source, sla_due_at)
       VALUES (?, ?, ?, 'Sonstiges', 'medium', ?, 'email', ?)`,
      [ticketNumber, subject, body, user.id, slaDue]
    );

    const ticketId = result.insertId;

    // Log history
    await insert(
      'INSERT INTO ticket_history (ticket_id, changed_by, field_changed, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
      [ticketId, user.id, 'status', null, 'open']
    );

    // Save attachments
    if (attachments && attachments.length > 0) {
      const fs = require('fs');
      const path = require('path');
      const { v4: uuidv4 } = require('uuid');
      const uploadDir = path.join(__dirname, '..', '..', 'uploads');

      for (const att of attachments) {
        if (!att.filename || !att.content) continue;

        const ext = path.extname(att.filename);
        const savedName = `${uuidv4()}${ext}`;
        const savedPath = path.join(uploadDir, savedName);

        fs.writeFileSync(savedPath, att.content);

        await insert(
          'INSERT INTO ticket_attachments (ticket_id, filename, filepath, filesize) VALUES (?, ?, ?, ?)',
          [ticketId, att.filename, `uploads/${savedName}`, att.size || 0]
        );
      }
    }

    console.log(`[EMAIL-POLLER] Created ticket ${ticketNumber} from ${fromEmail}`);

    // Send confirmation email
    const ticket = await queryOne('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    await NotificationService.ticketCreated(ticket, fromEmail);
  }

  // Find user by email or auto-create
  async findOrCreateUser(email, name) {
    let user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      // Auto-create user with random password
      const randomPw = crypto.randomBytes(16).toString('hex');
      const hash = await bcrypt.hash(randomPw, 12);
      const displayName = name || email.split('@')[0];

      const result = await insert(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [displayName, email, hash, 'user']
      );

      user = await queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
      console.log(`[EMAIL-POLLER] Auto-created user: ${email}`);
    }

    return user;
  }

  // Strip quoted reply text (best-effort heuristic)
  stripQuotedText(text) {
    if (!text) return '';

    const lines = text.split('\n');
    const result = [];

    for (const line of lines) {
      // Stop at common reply markers
      if (
        line.match(/^>/) ||
        line.match(/^Am .+ schrieb .+:/) ||
        line.match(/^On .+ wrote:/) ||
        line.match(/^-{3,}\s*Original/) ||
        line.match(/^_{3,}/) ||
        line.match(/^Von:.*@/) ||
        line.match(/^From:.*@/)
      ) {
        break;
      }
      result.push(line);
    }

    return result.join('\n').trim() || text.trim();
  }
}

module.exports = new EmailPoller();
