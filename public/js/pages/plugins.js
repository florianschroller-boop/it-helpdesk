// ============================================
// Plugin Manager
// ============================================

const PluginManagerPage = {
  async render(container) {
    if (App.user.role !== 'admin') {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Keine Berechtigung</div></div>';
      return;
    }

    const res = await API.get('/plugins');
    const plugins = res.success ? res.data : [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Plugin-Manager</h1>
          <p class="page-subtitle">Erweiterungen installieren und verwalten</p>
        </div>
        <button class="btn btn-primary" onclick="PluginManagerPage.openInstallModal()">+ Plugin installieren</button>
      </div>

      ${plugins.length === 0 ? `
      <div class="card">
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state-icon">\u{1F9E9}</div>
            <div class="empty-state-title">Keine Plugins installiert</div>
            <p class="text-muted">Plugins erweitern das Helpdesk um zus\u00E4tzliche Funktionen.<br>Laden Sie ein Plugin als ZIP-Datei hoch oder kopieren Sie es in den <code>plugins/</code>-Ordner.</p>
          </div>
        </div>
      </div>
      ` : `
      <div class="plugin-grid">
        ${plugins.map(p => `
        <div class="plugin-card ${p.active ? '' : 'plugin-inactive'}">
          <div class="plugin-card-header">
            <div>
              <div class="plugin-card-name">${this.esc(p.name)}</div>
              <div class="plugin-card-version">v${this.esc(p.version || '1.0.0')}</div>
            </div>
            <span class="badge ${p.active ? 'badge-active' : 'badge-inactive'}">${p.active ? 'Aktiv' : 'Inaktiv'}</span>
          </div>
          <div class="plugin-card-desc">${this.esc(p.description || 'Keine Beschreibung')}</div>
          ${p.author ? `<div class="plugin-card-author">Von ${this.esc(p.author)}</div>` : ''}
          ${p.active ? `
          <div class="plugin-visibility" style="margin:8px 0;padding:8px 0;border-top:1px solid var(--color-border-light)">
            <div class="text-xs fw-600" style="margin-bottom:6px">Sichtbar f\u00FCr:</div>
            <label class="flex items-center gap-2 text-xs" style="cursor:pointer;margin-bottom:4px">
              <input type="checkbox" ${p.visibility?.user !== false ? 'checked' : ''} onchange="PluginManagerPage.setVisibility('${this.esc(p._dirName)}', 'user', this.checked)"> Endbenutzer
            </label>
            <label class="flex items-center gap-2 text-xs" style="cursor:pointer;margin-bottom:4px">
              <input type="checkbox" ${p.visibility?.agent !== false ? 'checked' : ''} onchange="PluginManagerPage.setVisibility('${this.esc(p._dirName)}', 'agent', this.checked)"> Agents
            </label>
            <label class="flex items-center gap-2 text-xs" style="cursor:pointer">
              <input type="checkbox" checked disabled> Admins (immer sichtbar)
            </label>
          </div>
          ` : ''}
          <div class="plugin-card-actions">
            ${p.active
              ? `<button class="btn btn-secondary btn-sm" onclick="PluginManagerPage.togglePlugin('${this.esc(p._dirName)}', false)">Deaktivieren</button>`
              : `<button class="btn btn-primary btn-sm" onclick="PluginManagerPage.togglePlugin('${this.esc(p._dirName)}', true)">Aktivieren</button>`
            }
            <button class="btn btn-danger btn-sm" onclick="PluginManagerPage.uninstallPlugin('${this.esc(p._dirName)}', '${this.esc(p.name)}')">Deinstallieren</button>
          </div>
        </div>
        `).join('')}
      </div>
      `}

      <div class="card mt-4" style="max-width:700px">
        <div class="card-header"><h3 class="card-title">Plugin-Entwicklung</h3></div>
        <div class="card-body text-sm">
          <p>Plugins werden im Ordner <code>plugins/&lt;plugin-name&gt;/</code> abgelegt und ben\u00F6tigen:</p>
          <ul style="margin:8px 0 12px 20px;line-height:1.8">
            <li><code>plugin.json</code> — Manifest (name, version, description, author, entryPoint)</li>
            <li><code>index.js</code> — Entry Point, exportiert <code>activate(ctx)</code> und optional <code>deactivate()</code></li>
          </ul>
          <p><strong>Plugin-Kontext (ctx):</strong></p>
          <ul style="margin:8px 0 0 20px;line-height:1.8">
            <li><code>ctx.registerRoute(method, path, handler)</code> — API-Route unter <code>/api/plugins/&lt;name&gt;/...</code></li>
            <li><code>ctx.registerSidebarItem({icon, label, route})</code> — Sidebar-Eintrag</li>
            <li><code>ctx.registerDashboardWidget({title, render})</code> — Dashboard-Widget</li>
            <li><code>ctx.registerHook(event, handler)</code> — Events: ticket.created, ticket.updated, user.created</li>
            <li><code>ctx.registerFrontendAsset(type, filename)</code> — JS/CSS-Dateien laden</li>
            <li><code>ctx.db.query(sql, params)</code> — Datenbank-Zugriff</li>
            <li><code>ctx.setSetting(key, value)</code> / <code>ctx.getSetting(key)</code> — Plugin-Einstellungen</li>
          </ul>
        </div>
      </div>
    `;
  },

  openInstallModal() {
    const overlay = Modal.open({
      title: 'Plugin installieren',
      content: `
        <div class="form-group">
          <label class="form-label">Plugin-ZIP hochladen</label>
          <div class="file-drop-zone" id="pluginDropZone">
            <div class="file-drop-text">ZIP-Datei hierher ziehen oder <span class="text-primary clickable">durchsuchen</span></div>
            <input type="file" id="pluginFileInput" accept=".zip" style="display:none">
          </div>
        </div>
        <div id="pluginUploadStatus"></div>
      `,
      footer: '<button class="btn btn-secondary" data-action="cancel">Abbrechen</button>'
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => Modal.close(overlay));

    const zone = document.getElementById('pluginDropZone');
    const input = document.getElementById('pluginFileInput');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) this.uploadPlugin(e.dataTransfer.files[0], overlay); });
    input.addEventListener('change', () => { if (input.files[0]) this.uploadPlugin(input.files[0], overlay); });
  },

  async uploadPlugin(file, overlay) {
    const status = document.getElementById('pluginUploadStatus');
    if (status) status.innerHTML = '<div class="text-sm text-muted">Wird installiert...</div>';

    const fd = new FormData();
    fd.append('file', file);
    const res = await API.upload('/plugins/install', fd);

    if (res.success) {
      Modal.close(overlay);
      Toast.success(res.message);
      Router.navigate('/plugins', false);
    } else {
      if (status) status.innerHTML = `<div class="text-sm text-error">\u2717 ${res.error}</div>`;
      Toast.error(res.error);
    }
  },

  async togglePlugin(name, enable) {
    const res = await API.post(`/plugins/${name}/${enable ? 'enable' : 'disable'}`);
    if (res.success) {
      Toast.success(res.message);
      Router.navigate('/plugins', false);
    } else {
      Toast.error(res.error);
    }
  },

  async setVisibility(pluginName, role, visible) {
    // Get current visibility and update one role
    const plugins = (await API.get('/plugins')).data || [];
    const plugin = plugins.find(p => p._dirName === pluginName);
    const vis = plugin?.visibility || { user: true, agent: true, admin: true };
    vis[role] = visible;
    const res = await API.post(`/plugins/${pluginName}/visibility`, vis);
    if (res.success) Toast.success('Sichtbarkeit aktualisiert');
    else Toast.error(res.error);
  },

  uninstallPlugin(name, displayName) {
    Modal.confirm(`Plugin "${displayName}" wirklich deinstallieren? Alle Plugin-Daten gehen verloren.`, async () => {
      const res = await API.delete(`/plugins/${name}`);
      if (res.success) {
        Toast.success('Plugin deinstalliert');
        Router.navigate('/plugins', false);
      } else {
        Toast.error(res.error);
      }
    });
  },

  esc(str) { if (!str) return ''; const el = document.createElement('span'); el.textContent = str; return el.innerHTML; }
};
