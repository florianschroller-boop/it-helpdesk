/**
 * Notification Service
 * Handles outgoing email notifications via SMTP (Nodemailer).
 * Reads config from DB settings (fallback to .env).
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { query, queryOne } = require('../config/database');

class NotificationService {
  constructor() {
    this.templatesDir = path.join(__dirname, '..', '..', 'templates');
    this.transporter = null;
    this._cachedConfig = null;
    this._configAge = 0;
  }

  // Load SMTP config from DB settings, fallback to .env
  async getSmtpConfig() {
    // Cache for 60 seconds
    if (this._cachedConfig && (Date.now() - this._configAge) < 60000) {
      return this._cachedConfig;
    }

    try {
      const rows = await query("SELECT key_name, value FROM settings WHERE key_name IN ('smtp_host','smtp_port','smtp_user','smtp_pass','mail_from_address','mail_from_name')");
      const db = {};
      for (const r of rows) {
        try { db[r.key_name] = JSON.parse(r.value); } catch { db[r.key_name] = r.value; }
      }

      this._cachedConfig = {
        host: db.smtp_host || process.env.MAIL_SMTP_HOST || '',
        port: parseInt(db.smtp_port || process.env.MAIL_SMTP_PORT || '587'),
        user: db.smtp_user || process.env.MAIL_SMTP_USER || '',
        pass: db.smtp_pass || process.env.MAIL_SMTP_PASS || '',
        fromAddress: db.mail_from_address || process.env.MAIL_FROM_ADDRESS || 'helpdesk@localhost',
        fromName: db.mail_from_name || process.env.MAIL_FROM_NAME || 'IT-Helpdesk'
      };
      this._configAge = Date.now();
    } catch {
      // Fallback to env only
      this._cachedConfig = {
        host: process.env.MAIL_SMTP_HOST || '',
        port: parseInt(process.env.MAIL_SMTP_PORT || '587'),
        user: process.env.MAIL_SMTP_USER || '',
        pass: process.env.MAIL_SMTP_PASS || '',
        fromAddress: process.env.MAIL_FROM_ADDRESS || 'helpdesk@localhost',
        fromName: process.env.MAIL_FROM_NAME || 'IT-Helpdesk'
      };
      this._configAge = Date.now();
    }

    return this._cachedConfig;
  }

  // Create transporter from config
  async getTransporter() {
    const config = await this.getSmtpConfig();

    if (!config.host || !config.user) {
      return null;
    }

    // Always create fresh to pick up config changes
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }

  // Create transporter from explicit params (for testing)
  createTransporterFromParams(params) {
    const port = parseInt(params.port || '587');
    return nodemailer.createTransport({
      host: params.host,
      port,
      secure: port === 465,
      auth: { user: params.user, pass: params.pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }

  // Load & render an HTML template
  renderTemplate(templateName, variables) {
    const filePath = path.join(this.templatesDir, `${templateName}.html`);
    let html;
    try {
      html = fs.readFileSync(filePath, 'utf8');
    } catch {
      return `<p>${Object.entries(variables).map(([k, v]) => `<b>${k}:</b> ${v}`).join('<br>')}</p>`;
    }
    for (const [key, value] of Object.entries(variables)) {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
    }
    return html;
  }

  // Send an email
  async send(to, subject, templateName, variables, ticketId = null) {
    const html = this.renderTemplate(templateName, variables);
    const config = await this.getSmtpConfig();
    const transport = await this.getTransporter();

    if (!transport) {
      console.log(`[MAIL-STUB] To: ${to} | Subject: ${subject}`);
      await this.logEmail('out', config.fromAddress, to, subject, html, ticketId);
      return { success: true, stub: true };
    }

    try {
      const info = await transport.sendMail({
        from: `"${config.fromName}" <${config.fromAddress}>`,
        to,
        subject,
        html,
        headers: ticketId ? { 'X-Ticket-ID': String(ticketId) } : {}
      });

      console.log(`[MAIL] Sent to ${to}: ${subject} (${info.messageId})`);
      await this.logEmail('out', config.fromAddress, to, subject, html, ticketId);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`[MAIL-ERROR] Failed to send to ${to}:`, err.message);
      return { success: false, error: err.message };
    } finally {
      transport.close();
    }
  }

  // Log email to database
  async logEmail(direction, from, to, subject, body, ticketId = null) {
    try {
      await query(
        'INSERT INTO email_logs (ticket_id, direction, from_email, to_email, subject, body) VALUES (?, ?, ?, ?, ?, ?)',
        [ticketId, direction, from, to, subject, body]
      );
    } catch (err) {
      console.error('Email log error:', err.message);
    }
  }

  // Test SMTP connection with explicit params
  async testWithParams(params) {
    try {
      const transport = this.createTransporterFromParams(params);
      await transport.verify();
      transport.close();
      return { success: true, message: 'SMTP-Verbindung erfolgreich' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Test current config
  async testConnection() {
    const transport = await this.getTransporter();
    if (!transport) {
      return { success: false, error: 'SMTP nicht konfiguriert (Host oder Benutzer fehlt)' };
    }
    try {
      await transport.verify();
      transport.close();
      return { success: true, message: 'SMTP-Verbindung erfolgreich' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Reset cached config
  resetConfig() {
    this._cachedConfig = null;
    this._configAge = 0;
  }

  // ---- Ticket notification helpers ----

  async ticketCreated(ticket, requesterEmail) {
    return this.send(requesterEmail,
      `[${ticket.ticket_number}] Ticket erstellt: ${ticket.title}`,
      'ticket-created',
      { ticket_number: ticket.ticket_number, title: ticket.title, description: (ticket.description || '').substring(0, 500), status: 'Offen', priority: ticket.priority, app_url: process.env.APP_URL || 'http://localhost:3000' },
      ticket.id
    );
  }

  async ticketUpdated(ticket, requesterEmail, changes) {
    return this.send(requesterEmail,
      `[${ticket.ticket_number}] Ticket aktualisiert: ${ticket.title}`,
      'ticket-updated',
      { ticket_number: ticket.ticket_number, title: ticket.title, changes: changes.map(c => `${c.field}: ${c.old} → ${c.new}`).join('<br>'), app_url: process.env.APP_URL || 'http://localhost:3000' },
      ticket.id
    );
  }

  async ticketCommented(ticket, commenterName, recipientEmail) {
    return this.send(recipientEmail,
      `[${ticket.ticket_number}] Neue Antwort: ${ticket.title}`,
      'ticket-comment',
      { ticket_number: ticket.ticket_number, title: ticket.title, commenter: commenterName, app_url: process.env.APP_URL || 'http://localhost:3000' },
      ticket.id
    );
  }
}

module.exports = new NotificationService();
