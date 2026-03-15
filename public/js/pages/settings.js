// ============================================
// Settings Page
// ============================================

const SettingsPage = {
  async render(container) {
    if (App.user.role !== 'admin') {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Keine Berechtigung</div></div>';
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Einstellungen</h1>
          <p class="page-subtitle">System- und E-Mail-Konfiguration</p>
        </div>
      </div>

      <div class="tabs" id="settingsTabs">
        <div class="tab active" data-tab="general" onclick="SettingsPage.switchTab('general')">Allgemein</div>
        <div class="tab" data-tab="email" onclick="SettingsPage.switchTab('email')">E-Mail</div>
        <div class="tab" data-tab="tickets" onclick="SettingsPage.switchTab('tickets')">Tickets</div>
        <div class="tab" data-tab="mailhook" onclick="SettingsPage.switchTab('mailhook')">E-Mail-Webhook</div>
        <div class="tab" data-tab="ssl" onclick="SettingsPage.switchTab('ssl')">SSL / HTTPS</div>
        <div class="tab" data-tab="org" onclick="SettingsPage.switchTab('org')">Organisation</div>
        <div class="tab" data-tab="oauth" onclick="SettingsPage.switchTab('oauth')">Microsoft OAuth</div>
      </div>

      <div id="settingsContent"></div>
    `;

    this.switchTab('general');
  },

  async switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add('active');

    const content = document.getElementById('settingsContent');
    if (!content) return;

    // Load current settings
    const res = await API.get('/settings');
    const settings = res.success ? res.data : {};

    switch (tab) {
      case 'general':
        content.innerHTML = this.renderGeneral(settings);
        break;
      case 'ssl':
        content.innerHTML = await this.renderSSL();
        break;
      case 'email':
        content.innerHTML = this.renderEmail(settings);
        break;
      case 'tickets':
        content.innerHTML = this.renderTickets(settings);
        break;
      case 'mailhook':
        content.innerHTML = this.renderMailhook(settings);
        break;
      case 'org':
        content.innerHTML = this.renderOrg(settings);
        break;
      case 'oauth':
        content.innerHTML = await this.renderOAuth(settings);
        break;
    }
  },

  renderGeneral(s) {
    return `
      <div class="card" style="max-width:640px">
        <div class="card-body">
          <form onsubmit="SettingsPage.save(event)">
            <div class="form-group">
              <label class="form-label">Firmenname</label>
              <input type="text" class="form-control" name="company_name" value="${this.esc(s.company_name || 'IT-Helpdesk')}">
            </div>
            <button type="submit" class="btn btn-primary">Speichern</button>
          </form>
        </div>
      </div>
    `;
  },

  // Email provider presets
  _emailPresets: {
    'exchange': { label: 'Microsoft Exchange / Microsoft 365', smtp_host: 'smtp.office365.com', smtp_port: 587, imap_host: 'outlook.office365.com', imap_port: 993, imap_encryption: 'tls' },
    'gmail': { label: 'Google Workspace / Gmail', smtp_host: 'smtp.gmail.com', smtp_port: 587, imap_host: 'imap.gmail.com', imap_port: 993, imap_encryption: 'tls' },
    'ionos': { label: 'IONOS (1&1)', smtp_host: 'smtp.ionos.de', smtp_port: 587, imap_host: 'imap.ionos.de', imap_port: 993, imap_encryption: 'tls' },
    'strato': { label: 'Strato', smtp_host: 'smtp.strato.de', smtp_port: 465, imap_host: 'imap.strato.de', imap_port: 993, imap_encryption: 'tls' },
    'hosteurope': { label: 'Host Europe', smtp_host: 'smtp.hosteurope.de', smtp_port: 587, imap_host: 'imap.hosteurope.de', imap_port: 993, imap_encryption: 'tls' },
    'allinkl': { label: 'ALL-INKL.COM', smtp_host: 'smtp.all-inkl.com', smtp_port: 587, imap_host: 'imap.all-inkl.com', imap_port: 993, imap_encryption: 'tls' },
    'yahoo': { label: 'Yahoo Mail', smtp_host: 'smtp.mail.yahoo.com', smtp_port: 587, imap_host: 'imap.mail.yahoo.com', imap_port: 993, imap_encryption: 'tls' },
    'custom': { label: 'Benutzerdefiniert', smtp_host: '', smtp_port: 587, imap_host: '', imap_port: 993, imap_encryption: 'tls' }
  },

  applyEmailPreset(key) {
    const preset = this._emailPresets[key];
    if (!preset) return;
    const f = (name) => document.querySelector(`[name="${name}"]`);
    if (f('smtp_host')) f('smtp_host').value = preset.smtp_host;
    if (f('smtp_port')) f('smtp_port').value = preset.smtp_port;
    if (f('imap_host')) f('imap_host').value = preset.imap_host;
    if (f('imap_port')) f('imap_port').value = preset.imap_port;
    if (f('imap_encryption')) f('imap_encryption').value = preset.imap_encryption;
  },

  renderEmail(s) {
    // Detect current provider
    const currentSmtp = s.smtp_host || '';
    let currentPreset = 'custom';
    for (const [key, preset] of Object.entries(this._emailPresets)) {
      if (preset.smtp_host && currentSmtp === preset.smtp_host) { currentPreset = key; break; }
    }

    return `
      <div class="card mb-4" style="max-width:640px">
        <div class="card-header">
          <h3 class="card-title">E-Mail-Anbieter</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Vorlage w\u00E4hlen</label>
            <select class="form-control" onchange="SettingsPage.applyEmailPreset(this.value)">
              ${Object.entries(this._emailPresets).map(([key, p]) => `<option value="${key}" ${currentPreset === key ? 'selected' : ''}>${p.label}</option>`).join('')}
            </select>
            <div class="form-hint">W\u00E4hlen Sie Ihren E-Mail-Anbieter aus, um SMTP/IMAP-Einstellungen automatisch auszuf\u00FCllen.</div>
          </div>
        </div>
      </div>

      <div class="card mb-4" style="max-width:640px">
        <div class="card-header">
          <h3 class="card-title">SMTP (Ausgehende E-Mails)</h3>
        </div>
        <div class="card-body">
          <form id="smtpForm" onsubmit="SettingsPage.save(event)">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">SMTP-Host</label>
                <input type="text" class="form-control" name="smtp_host" value="${this.esc(s.smtp_host || '')}" placeholder="smtp.office365.com">
              </div>
              <div class="form-group">
                <label class="form-label">SMTP-Port</label>
                <input type="number" class="form-control" name="smtp_port" value="${s.smtp_port || 587}" placeholder="587">
                <div class="form-hint">587 (STARTTLS) oder 465 (SSL)</div>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">SMTP-Benutzer</label>
                <input type="text" class="form-control" name="smtp_user" value="${this.esc(s.smtp_user || '')}" placeholder="helpdesk@firma.de">
              </div>
              <div class="form-group">
                <label class="form-label">SMTP-Passwort</label>
                <input type="password" class="form-control" name="smtp_pass" value="${s.smtp_pass && s.smtp_pass !== '••••••••' ? '' : ''}" placeholder="${s.smtp_pass === '••••••••' ? 'Gespeichert — leer lassen' : 'Passwort eingeben'}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Absender-Adresse</label>
                <input type="email" class="form-control" name="mail_from_address" value="${this.esc(s.mail_from_address || '')}" placeholder="helpdesk@firma.de">
              </div>
              <div class="form-group">
                <label class="form-label">Absender-Name</label>
                <input type="text" class="form-control" name="mail_from_name" value="${this.esc(s.mail_from_name || 'IT-Helpdesk')}">
              </div>
            </div>
            <button type="submit" class="btn btn-primary">Speichern</button>

            <div class="card mt-4" style="background:var(--color-bg-secondary);border:1px solid var(--color-border)">
              <div class="card-body">
                <div class="fw-600 text-sm" style="margin-bottom:8px">Verbindung testen</div>
                <div class="form-row">
                  <div class="form-group" style="margin-bottom:0">
                    <input type="email" class="form-control" id="testEmailTo" value="${this.esc(App.user.email)}" placeholder="empfaenger@firma.de">
                  </div>
                  <div class="form-group" style="margin-bottom:0">
                    <button type="button" class="btn btn-secondary" onclick="SettingsPage.testEmail()" id="testEmailBtn">Test-E-Mail senden</button>
                  </div>
                </div>
                <div id="testEmailResult" class="mt-2"></div>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div class="card" style="max-width:640px">
        <div class="card-header">
          <h3 class="card-title">IMAP (Eingehende E-Mails)</h3>
        </div>
        <div class="card-body">
          <form onsubmit="SettingsPage.save(event)">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">IMAP-Host</label>
                <input type="text" class="form-control" name="imap_host" value="${this.esc(s.imap_host || '')}" placeholder="outlook.office365.com">
              </div>
              <div class="form-group">
                <label class="form-label">IMAP-Port</label>
                <input type="number" class="form-control" name="imap_port" value="${s.imap_port || 993}" placeholder="993">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">IMAP-Benutzer</label>
                <input type="text" class="form-control" name="imap_user" value="${this.esc(s.imap_user || '')}" placeholder="helpdesk@firma.de">
              </div>
              <div class="form-group">
                <label class="form-label">IMAP-Passwort</label>
                <input type="password" class="form-control" name="imap_pass" value="" placeholder="${s.imap_pass === '••••••••' ? 'Gespeichert — leer lassen' : 'Passwort eingeben'}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Verschl\u00FCsselung</label>
                <select class="form-control" name="imap_encryption">
                  <option value="tls" ${(s.imap_encryption||'tls')==='tls'?'selected':''}>SSL/TLS (Port 993)</option>
                  <option value="starttls" ${s.imap_encryption==='starttls'?'selected':''}>STARTTLS (Port 143)</option>
                  <option value="none" ${s.imap_encryption==='none'?'selected':''}>Keine</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Authentifizierung</label>
                <select class="form-control" name="imap_auth_method">
                  <option value="password" ${(s.imap_auth_method||'password')==='password'?'selected':''}>Passwort (Basic Auth)</option>
                  <option value="oauth2" ${s.imap_auth_method==='oauth2'?'selected':''}>OAuth2 (Microsoft 365)</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Poll-Intervall (Minuten)</label>
              <input type="number" class="form-control" name="mail_poll_interval" value="${s.mail_poll_interval || 2}" min="1" max="60" style="max-width:120px">
            </div>

            <div class="card mt-2 mb-4" style="background:var(--color-bg-secondary);border:1px solid var(--color-border)">
              <div class="card-body text-xs">
                <strong>Hinweis f\u00FCr Microsoft 365 (OAuth2):</strong><br>
                1. MS OAuth muss konfiguriert sein (Tab "Microsoft OAuth")<br>
                2. In Azure App: API-Berechtigungen \u2192 <code>IMAP.AccessAsApp</code> (Anwendungsberechtigung) hinzuf\u00FCgen + Admin-Einwilligung erteilen<br>
                3. Exchange Admin \u2192 Postfach \u2192 E-Mail-Apps \u2192 "Authentifiziertes SMTP" aktivieren<br>
                4. IMAP-Host: <code>outlook.office365.com</code> (nicht smtp.office365.com)
              </div>
            </div>

            <div class="flex gap-2">
              <button type="submit" class="btn btn-primary">Speichern</button>
              <button type="button" class="btn btn-secondary" onclick="SettingsPage.testImap()" id="testImapBtn">IMAP-Verbindung testen</button>
            </div>
            <div id="testImapResult" class="mt-2"></div>
          </form>
        </div>
      </div>

      <div class="card mt-4" style="max-width:640px">
        <div class="card-header">
          <h3 class="card-title">E-Mail-Protokoll</h3>
          <span class="text-xs text-muted">Letzte 20 E-Mails</span>
        </div>
        <div class="card-body" style="padding:0">
          <div id="emailLogTable">Laden...</div>
        </div>
      </div>
    `;

    // Load email logs after render
    setTimeout(() => this.loadEmailLogs(), 0);
  },

  renderTickets(s) {
    const categories = Array.isArray(s.ticket_categories) ? s.ticket_categories : ['Hardware', 'Software', 'Netzwerk', 'Zugang/Passwort', 'Bestellung', 'Sonstiges'];

    return `
      <div class="card" style="max-width:640px">
        <div class="card-body">
          <form onsubmit="SettingsPage.save(event)">
            <div class="form-group">
              <label class="form-label">Standard-SLA (Stunden)</label>
              <input type="number" class="form-control" name="sla_default_hours" value="${s.sla_default_hours || 24}" min="1" max="720" style="max-width:120px">
              <div class="form-hint">Standard-Antwortzeit f\u00FCr neue Tickets</div>
            </div>
            <div class="form-group">
              <label class="form-label">Ticket-Kategorien</label>
              <textarea class="form-control" name="ticket_categories" rows="6" placeholder="Eine Kategorie pro Zeile">${categories.join('\n')}</textarea>
              <div class="form-hint">Eine Kategorie pro Zeile</div>
            </div>
            <button type="submit" class="btn btn-primary">Speichern</button>
          </form>
        </div>
      </div>
    `;
  },

  async save(e) {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target));

    // Handle special fields — convert newline-lists to arrays
    for (const field of ['ticket_categories', 'departments', 'positions']) {
      if (formData[field] !== undefined) {
        formData[field] = formData[field].split('\n').map(s => s.trim()).filter(Boolean);
      }
    }

    // Remove empty password fields
    if (formData.smtp_pass === '') delete formData.smtp_pass;
    if (formData.imap_pass === '') delete formData.imap_pass;

    const result = await API.put('/settings', formData);
    if (result.success) {
      Toast.success('Einstellungen gespeichert');
    } else {
      Toast.error(result.error);
    }
  },

  async testEmail() {
    const btn = document.getElementById('testEmailBtn');
    const resultDiv = document.getElementById('testEmailResult');
    const toField = document.getElementById('testEmailTo');
    const to = toField?.value?.trim();

    if (!to) {
      Toast.error('Bitte Empf\u00E4nger-Adresse eingeben');
      toField?.focus();
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Teste...'; }
    if (resultDiv) resultDiv.innerHTML = '<div class="text-sm text-muted">Verbindung wird gepr\u00FCft...</div>';

    // Zuerst speichern, damit die aktuellen Werte in der DB sind
    const form = document.getElementById('smtpForm');
    if (form) {
      const saveData = Object.fromEntries(new FormData(form));
      if (saveData.smtp_pass === '') delete saveData.smtp_pass;
      await API.put('/settings', saveData);
    }

    // Dann testen mit Empf\u00E4nger
    const result = await API.post('/settings/test-email', { to });

    if (btn) { btn.disabled = false; btn.textContent = 'Test-E-Mail senden'; }

    if (result.success) {
      if (resultDiv) resultDiv.innerHTML = `<div class="text-sm" style="color:var(--color-success);padding:4px 0">\u2713 ${result.message}</div>`;
    } else {
      if (resultDiv) resultDiv.innerHTML = `<div class="text-sm" style="color:var(--color-error);padding:4px 0">\u2717 ${result.error || 'Verbindung fehlgeschlagen'}</div>`;
    }
  },

  renderMailhook(s) {
    const apiKey = s.mailhook_api_key || '';
    const webhookUrl = window.location.origin + '/api/mailhook/incoming';

    return `
      <div class="card mb-4" style="max-width:700px">
        <div class="card-header">
          <h3 class="card-title">E-Mail-Webhook (Alternative zu IMAP)</h3>
          <span class="badge badge-active">Empfohlen f\u00FCr Microsoft 365</span>
        </div>
        <div class="card-body">
          <p class="text-sm mb-4">Wenn IMAP blockiert ist (z.B. durch Security Defaults bei Microsoft 365), k\u00F6nnen E-Mails \u00FCber einen <strong>Webhook</strong> empfangen werden. Eingehende E-Mails werden per HTTP POST an das Helpdesk gesendet und automatisch als Tickets oder Kommentare verarbeitet.</p>

          <div class="detail-field mb-4">
            <div class="detail-label">Webhook-URL</div>
            <div class="flex gap-2 items-center">
              <code class="text-sm" style="padding:8px 12px;background:var(--color-bg-tertiary);border-radius:var(--border-radius);flex:1;word-break:break-all">${webhookUrl}</code>
              <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${webhookUrl}');Toast.success('URL kopiert')">Kopieren</button>
            </div>
          </div>

          <div class="detail-field mb-4">
            <div class="detail-label">API-Key</div>
            <div class="flex gap-2 items-center">
              <code class="text-sm" style="padding:8px 12px;background:var(--color-bg-tertiary);border-radius:var(--border-radius);flex:1;word-break:break-all" id="mailhookKeyDisplay">${apiKey ? apiKey.substring(0, 8) + '\u2022'.repeat(20) : 'Nicht generiert'}</code>
              <button class="btn btn-ghost btn-sm" onclick="SettingsPage.showMailhookKey()">Anzeigen</button>
              <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${this.esc(apiKey)}');Toast.success('Key kopiert')">Kopieren</button>
            </div>
          </div>

          <div class="card" style="background:var(--color-bg-secondary);border:1px solid var(--color-border)">
            <div class="card-body text-sm">
              <strong>Einrichtung mit Power Automate (Microsoft 365):</strong>
              <ol style="margin:8px 0 0 20px;line-height:2">
                <li>Power Automate \u2192 Neuer Flow \u2192 "Automatisierter Cloud-Flow"</li>
                <li>Trigger: "Wenn eine neue E-Mail eintrifft (V3)" \u2192 Ordner: Posteingang</li>
                <li>Aktion hinzuf\u00FCgen: "HTTP" \u2192 Methode: POST</li>
                <li>URI: <code>${webhookUrl}</code></li>
                <li>Headers: <code>Authorization: Bearer ${apiKey ? apiKey.substring(0, 8) + '...' : 'API-KEY'}</code> und <code>Content-Type: application/json</code></li>
                <li>Body:<br><code>{"from": "@{triggerOutputs()?['body/from']}", "from_name": "@{triggerOutputs()?['body/from']}", "subject": "@{triggerOutputs()?['body/subject']}", "body": "@{triggerOutputs()?['body/body']}"}</code></li>
                <li>Flow speichern und aktivieren</li>
              </ol>

              <div style="margin-top:16px">
                <strong>Alternative: Outlook-Regel + Weiterleitung:</strong>
                <ol style="margin:8px 0 0 20px;line-height:2">
                  <li>Im Postfach eine Regel erstellen: "Alle eingehenden E-Mails weiterleiten an..."</li>
                  <li>An eine Adresse weiterleiten, die per Script/Cron den Webhook aufruft</li>
                </ol>
              </div>

              <div style="margin-top:16px">
                <strong>Testen per curl:</strong><br>
                <code style="display:block;padding:8px;background:var(--color-bg);border-radius:4px;margin-top:4px;word-break:break-all">curl -X POST ${webhookUrl} -H "Authorization: Bearer API-KEY" -H "Content-Type: application/json" -d '{"from":"test@example.com","subject":"Testmail","body":"Dies ist ein Test"}'</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  showMailhookKey() {
    const el = document.getElementById('mailhookKeyDisplay');
    if (el) {
      // Toggle - fetch from settings
      API.get('/settings').then(res => {
        if (res.success && res.data.mailhook_api_key) {
          el.textContent = res.data.mailhook_api_key;
        }
      });
    }
  },

  async renderSSL() {
    const res = await API.get('/settings/ssl-status');
    const s = res.success ? res.data : {};

    if (!s.isLinux) {
      return `
        <div class="card" style="max-width:700px">
          <div class="card-header"><h3 class="card-title">\u{1F512} SSL / HTTPS</h3></div>
          <div class="card-body">
            <p class="text-sm">Automatisches SSL-Setup ist nur auf <strong>Linux-Servern</strong> verf\u00FCgbar.</p>
            <div class="card mt-4" style="background:var(--color-bg-secondary);border:1px solid var(--color-border)">
              <div class="card-body text-sm">
                <strong>Manuelle Einrichtung (Windows/andere):</strong>
                <ol style="margin:8px 0 0 20px;line-height:2">
                  <li>Einen Reverse-Proxy installieren (nginx, Apache, IIS)</li>
                  <li>SSL-Zertifikat besorgen (Let's Encrypt, oder von der IT)</li>
                  <li>Proxy so konfigurieren, dass HTTPS auf Port 443 auf <code>http://127.0.0.1:${s.app_port || 3000}</code> weiterleitet</li>
                  <li>In der <code>.env</code> die <code>APP_URL</code> auf <code>https://...</code> \u00E4ndern</li>
                </ol>
              </div>
            </div>
          </div>
        </div>`;
    }

    const nginxOk = s.nginx.installed && s.nginx.running;
    const certbotOk = s.certbot.installed;

    return `
      <div class="card mb-4" style="max-width:700px">
        <div class="card-header">
          <h3 class="card-title">\u{1F512} SSL / HTTPS — Status</h3>
          ${s.ssl_active ? '<span class="badge badge-active">\u{1F512} HTTPS aktiv</span>' : '<span class="badge badge-inactive">Kein SSL</span>'}
        </div>
        <div class="card-body">
          <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
            <div class="stat-card" style="padding:12px">
              <div class="stat-value text-sm">${s.nginx.installed ? (s.nginx.running ? '\u2705 L\u00E4uft' : '\u{1F7E1} Gestoppt') : '\u274C Fehlt'}</div>
              <div class="stat-label">Nginx</div>
            </div>
            <div class="stat-card" style="padding:12px">
              <div class="stat-value text-sm">${s.certbot.installed ? '\u2705 Installiert' : '\u274C Fehlt'}</div>
              <div class="stat-label">Certbot</div>
            </div>
            <div class="stat-card" style="padding:12px">
              <div class="stat-value text-sm">${s.ssl_active ? '\u2705 Aktiv' : '\u274C Inaktiv'}</div>
              <div class="stat-label">SSL-Zertifikat</div>
            </div>
          </div>

          <div class="text-sm mt-4">
            <strong>Aktuelle URL:</strong> <code>${this.esc(s.app_url)}</code><br>
            ${s.domain ? '<strong>Domain:</strong> <code>' + this.esc(s.domain) + '</code>' : ''}
          </div>
        </div>
      </div>

      <div class="card mb-4" style="max-width:700px">
        <div class="card-header"><h3 class="card-title">Einrichtungs-Assistent</h3></div>
        <div class="card-body">
          <div id="sslSteps">

            <!-- Schritt 1: Nginx -->
            <div class="ssl-step mb-4" style="padding:16px;background:var(--color-bg-secondary);border-radius:var(--border-radius);border-left:3px solid ${s.nginx.installed ? 'var(--color-success)' : 'var(--color-primary)'}">
              <div class="flex items-center justify-between mb-2">
                <span class="fw-600">Schritt 1: Nginx installieren</span>
                ${s.nginx.installed ? '<span class="badge badge-active">\u2713 Erledigt</span>' : ''}
              </div>
              <p class="text-sm text-muted">Nginx dient als Reverse-Proxy und leitet HTTPS-Anfragen an das Helpdesk weiter.</p>
              ${!s.nginx.installed ? '<button class="btn btn-primary btn-sm mt-2" onclick="SettingsPage.sslAction(\'install-nginx\')">Nginx installieren</button>' : ''}
            </div>

            <!-- Schritt 2: Certbot -->
            <div class="ssl-step mb-4" style="padding:16px;background:var(--color-bg-secondary);border-radius:var(--border-radius);border-left:3px solid ${s.certbot.installed ? 'var(--color-success)' : 'var(--color-primary)'}">
              <div class="flex items-center justify-between mb-2">
                <span class="fw-600">Schritt 2: Certbot installieren</span>
                ${s.certbot.installed ? '<span class="badge badge-active">\u2713 Erledigt</span>' : ''}
              </div>
              <p class="text-sm text-muted">Certbot erstellt kostenlose SSL-Zertifikate von Let's Encrypt.</p>
              ${!s.certbot.installed ? '<button class="btn btn-primary btn-sm mt-2" onclick="SettingsPage.sslAction(\'install-certbot\')"' + (!s.nginx.installed ? ' disabled title="Zuerst Nginx installieren"' : '') + '>Certbot installieren</button>' : ''}
            </div>

            <!-- Schritt 3: Domain konfigurieren -->
            <div class="ssl-step mb-4" style="padding:16px;background:var(--color-bg-secondary);border-radius:var(--border-radius);border-left:3px solid ${s.nginx.config_exists ? 'var(--color-success)' : 'var(--color-primary)'}">
              <div class="flex items-center justify-between mb-2">
                <span class="fw-600">Schritt 3: Domain konfigurieren</span>
                ${s.nginx.config_exists ? '<span class="badge badge-active">\u2713 Konfiguriert</span>' : ''}
              </div>
              <p class="text-sm text-muted">Die Domain muss per DNS A-Record auf die IP dieses Servers zeigen.</p>
              <div class="form-row mt-2">
                <div class="form-group" style="margin-bottom:0">
                  <input type="text" class="form-control" id="sslDomain" value="${this.esc(s.domain)}" placeholder="helpdesk.firma.de">
                </div>
                <div class="form-group" style="margin-bottom:0">
                  <button class="btn btn-primary btn-sm" onclick="SettingsPage.sslAction('configure-nginx')"${!nginxOk ? ' disabled' : ''}>${s.nginx.config_exists ? 'Aktualisieren' : 'Nginx konfigurieren'}</button>
                </div>
              </div>
            </div>

            <!-- Schritt 4: SSL-Zertifikat -->
            <div class="ssl-step mb-4" style="padding:16px;background:var(--color-bg-secondary);border-radius:var(--border-radius);border-left:3px solid ${s.ssl_active ? 'var(--color-success)' : 'var(--color-primary)'}">
              <div class="flex items-center justify-between mb-2">
                <span class="fw-600">Schritt 4: SSL-Zertifikat erstellen</span>
                ${s.ssl_active ? '<span class="badge badge-active">\u{1F512} HTTPS aktiv</span>' : ''}
              </div>
              <p class="text-sm text-muted">Erstellt ein kostenloses SSL-Zertifikat von Let's Encrypt und aktiviert HTTPS.</p>
              <div class="form-row mt-2">
                <div class="form-group" style="margin-bottom:0">
                  <input type="email" class="form-control" id="sslEmail" placeholder="admin@firma.de" value="${this.esc(App.user.email)}">
                </div>
                <div class="form-group" style="margin-bottom:0">
                  <button class="btn btn-primary btn-sm" onclick="SettingsPage.sslAction('setup-ssl')"${!s.nginx.config_exists || !certbotOk ? ' disabled' : ''}>\u{1F512} SSL aktivieren</button>
                </div>
              </div>
            </div>
          </div>

          <div id="sslResult" class="mt-2"></div>
        </div>
      </div>

      <div class="card" style="max-width:700px">
        <div class="card-header"><h3 class="card-title">Voraussetzungen</h3></div>
        <div class="card-body text-sm">
          <ul style="margin-left:16px;line-height:2">
            <li><strong>Domain:</strong> Eine Domain (z.B. <code>helpdesk.firma.de</code>) muss per DNS A-Record auf die IP dieses Servers zeigen</li>
            <li><strong>Port 80 + 443:</strong> M\u00FCssen vom Internet erreichbar sein (Firewall pr\u00FCfen)</li>
            <li><strong>Root-Zugriff:</strong> Der Server-Prozess braucht Root-Rechte f\u00FCr Nginx/Certbot</li>
            <li><strong>Zertifikat-Erneuerung:</strong> Let's Encrypt-Zertifikate laufen 90 Tage, Certbot erneuert sie automatisch per Cron</li>
          </ul>
        </div>
      </div>
    `;
  },

  async sslAction(action) {
    const domain = document.getElementById('sslDomain')?.value?.trim();
    const email = document.getElementById('sslEmail')?.value?.trim();
    const resultDiv = document.getElementById('sslResult');

    if ((action === 'configure-nginx' || action === 'setup-ssl') && !domain) {
      Toast.error('Bitte Domain eingeben');
      return;
    }
    if (action === 'setup-ssl' && !email) {
      Toast.error('Bitte E-Mail-Adresse eingeben');
      return;
    }

    const confirmMsg = {
      'install-nginx': 'Nginx jetzt installieren?',
      'install-certbot': 'Certbot jetzt installieren?',
      'configure-nginx': `Nginx f\u00FCr Domain "${domain}" konfigurieren?`,
      'setup-ssl': `SSL-Zertifikat f\u00FCr "${domain}" erstellen? Die Domain muss bereits auf diesen Server zeigen.`
    };

    Modal.confirm(confirmMsg[action] || 'Fortfahren?', async () => {
      if (resultDiv) resultDiv.innerHTML = '<div class="text-sm text-muted" style="padding:8px">\u23F3 Wird ausgef\u00FChrt... (kann bis zu 2 Minuten dauern)</div>';

      const res = await API.post('/settings/ssl-setup', { action, domain, email });

      if (res.success) {
        const steps = res.data?.steps || [];
        if (resultDiv) resultDiv.innerHTML = `<div class="text-sm" style="color:var(--color-success);padding:8px">\u2713 ${steps.join('<br>\u2713 ')}</div>`;
        Toast.success(steps[steps.length - 1] || 'Erfolgreich');

        // Refresh status
        setTimeout(() => this.switchTab('ssl'), 1500);
      } else {
        if (resultDiv) resultDiv.innerHTML = `<div class="text-sm text-error" style="padding:8px">\u2717 ${res.error}</div>`;
        Toast.error(res.error);
      }
    });
  },

  renderOrg(s) {
    const departments = Array.isArray(s.departments) ? s.departments : [];
    const positions = Array.isArray(s.positions) ? s.positions : [];

    return `
      <div class="card mb-4" style="max-width:640px">
        <div class="card-header"><h3 class="card-title">Abteilungen</h3></div>
        <div class="card-body">
          <form onsubmit="SettingsPage.save(event)">
            <div class="form-group">
              <textarea class="form-control" name="departments" rows="8" placeholder="Eine Abteilung pro Zeile">${departments.join('\n')}</textarea>
              <div class="form-hint">Eine Abteilung pro Zeile. Wird als Dropdown in Benutzerverwaltung und Onboarding verwendet.</div>
            </div>
            <button type="submit" class="btn btn-primary">Speichern</button>
          </form>
        </div>
      </div>
      <div class="card" style="max-width:640px">
        <div class="card-header"><h3 class="card-title">Positionen / Jobtitel</h3></div>
        <div class="card-body">
          <form onsubmit="SettingsPage.save(event)">
            <div class="form-group">
              <textarea class="form-control" name="positions" rows="8" placeholder="Eine Position pro Zeile">${positions.join('\n')}</textarea>
              <div class="form-hint">Eine Position pro Zeile. Wird als Dropdown im Onboarding-Antrag verwendet.</div>
            </div>
            <button type="submit" class="btn btn-primary">Speichern</button>
          </form>
        </div>
      </div>
    `;
  },

  async renderOAuth(s) {
    const statusRes = await API.get('/auth/microsoft/status');
    const isEnabled = statusRes.success && statusRes.data?.enabled;

    return `
      <div class="card" style="max-width:640px">
        <div class="card-header">
          <h3 class="card-title">Microsoft OAuth / Entra ID</h3>
          <span class="badge ${isEnabled ? 'badge-active' : 'badge-inactive'}">${isEnabled ? 'Aktiv' : 'Inaktiv'}</span>
        </div>
        <div class="card-body">
          <div class="card" style="background:var(--color-bg-secondary);border:1px solid var(--color-border);margin-bottom:20px">
            <div class="card-body text-sm">
              <strong>Einrichtung in Azure:</strong>
              <ol style="margin:8px 0 0 20px;line-height:1.8">
                <li>Azure Portal \u2192 <strong>App-Registrierungen</strong> \u2192 Neue Registrierung</li>
                <li>Name: <code>IT-Helpdesk</code>, Kontotyp: Einzelner Mandant (oder Mehrinstanzenfähig)</li>
                <li>Umleitungs-URI: <code>Web</code> \u2192 <code>${this.esc(s.ms_oauth_redirect_uri || (window.location.origin + '/api/auth/microsoft/callback'))}</code></li>
                <li>Zertifikate & Geheimnisse \u2192 Neuer geheimer Clientschlüssel erstellen</li>
                <li>API-Berechtigungen \u2192 <code>User.Read</code> (sollte bereits vorhanden sein)</li>
                <li>Die Werte unten eintragen und in der <code>.env</code>-Datei speichern</li>
              </ol>
            </div>
          </div>

          <form onsubmit="SettingsPage.saveOAuth(event)">
            <div class="form-group">
              <label class="form-label flex items-center gap-2">
                <input type="checkbox" name="ms_oauth_enabled" value="true" ${isEnabled ? 'checked' : ''}>
                Microsoft-Login aktivieren
              </label>
            </div>
            <div class="form-group">
              <label class="form-label">Client-ID (Application ID)</label>
              <input type="text" class="form-control" name="ms_oauth_client_id" value="${this.esc(s.ms_oauth_client_id || '')}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
            </div>
            <div class="form-group">
              <label class="form-label">Client Secret</label>
              <input type="password" class="form-control" name="ms_oauth_client_secret" value="" placeholder="Leer = unver\u00E4ndert">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tenant-ID</label>
                <input type="text" class="form-control" name="ms_oauth_tenant_id" value="${this.esc(s.ms_oauth_tenant_id || 'common')}" placeholder="common oder Tenant-GUID">
                <div class="form-hint"><code>common</code> = alle Tenants, oder spezifische Tenant-ID</div>
              </div>
              <div class="form-group">
                <label class="form-label">Redirect URI</label>
                <input type="text" class="form-control" name="ms_oauth_redirect_uri" value="${this.esc(s.ms_oauth_redirect_uri || (window.location.origin + '/api/auth/microsoft/callback'))}">
              </div>
            </div>
            <div class="flex gap-2" style="margin-top:8px">
              <button type="submit" class="btn btn-primary">Speichern</button>
            </div>
          </form>

          <div class="form-hint mt-4" style="padding:12px;background:var(--color-bg-secondary);border-radius:var(--border-radius)">
            <strong>Hinweis:</strong> \u00C4nderungen an der OAuth-Konfiguration erfordern einen <strong>Server-Neustart</strong>, da die Werte aus der <code>.env</code>-Datei gelesen werden.
            Die Werte in diesem Formular werden als Referenz in der Datenbank gespeichert, m\u00FCssen aber auch in der <code>.env</code> stehen.
          </div>
        </div>
      </div>
    `;
  },

  async saveOAuth(e) {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target));

    // Checkbox handling
    if (!formData.ms_oauth_enabled) formData.ms_oauth_enabled = 'false';

    // Remove empty secret
    if (formData.ms_oauth_client_secret === '') delete formData.ms_oauth_client_secret;

    const result = await API.put('/settings', formData);
    if (result.success) {
      Toast.success('OAuth-Einstellungen gespeichert. Bitte .env-Datei aktualisieren und Server neustarten.');
    } else {
      Toast.error(result.error);
    }
  },

  async testImap() {
    const btn = document.getElementById('testImapBtn');
    const resultDiv = document.getElementById('testImapResult');
    if (btn) { btn.disabled = true; btn.textContent = 'Teste...'; }
    if (resultDiv) resultDiv.innerHTML = '<div class="text-sm text-muted">Verbindung wird gepr\u00FCft...</div>';

    // Save first
    const form = btn?.closest('form');
    if (form) {
      const saveData = Object.fromEntries(new FormData(form));
      if (saveData.imap_pass === '') delete saveData.imap_pass;
      await API.put('/settings', saveData);
    }

    const result = await API.post('/settings/test-imap');
    if (btn) { btn.disabled = false; btn.textContent = 'IMAP-Verbindung testen'; }

    if (result.success) {
      if (resultDiv) resultDiv.innerHTML = `<div class="text-sm" style="color:var(--color-success)">\u2713 ${result.message}</div>`;
    } else {
      if (resultDiv) resultDiv.innerHTML = `<div class="text-sm" style="color:var(--color-error)">\u2717 ${result.error}</div>`;
    }
  },

  async loadEmailLogs() {
    const container = document.getElementById('emailLogTable');
    if (!container) return;

    const res = await API.get('/settings/email-logs');
    if (!res.success || !res.data || res.data.length === 0) {
      container.innerHTML = '<div class="text-center text-muted text-sm" style="padding:24px">Keine E-Mails protokolliert</div>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th style="width:30px"></th><th>Von / An</th><th>Betreff</th><th>Datum</th></tr></thead>
        <tbody>
          ${res.data.map(log => `
          <tr>
            <td>${log.direction === 'in' ? '<span title="Eingehend" style="color:var(--color-info)">\u2B07</span>' : '<span title="Ausgehend" style="color:var(--color-success)">\u2B06</span>'}</td>
            <td class="text-sm">${log.direction === 'in' ? this.esc(log.from_email) : this.esc(log.to_email)}</td>
            <td class="text-sm truncate" style="max-width:250px">${this.esc(log.subject || '(kein Betreff)')}</td>
            <td class="text-xs text-muted">${log.date_formatted}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
  },

  esc(str) {
    if (!str) return '';
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }
};
