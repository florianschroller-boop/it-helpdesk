// ============================================
// White-Label Settings
// ============================================

const WhiteLabelPage = {
  async render(container) {
    if (App.user.role !== 'admin') {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Keine Berechtigung</div></div>';
      return;
    }

    const res = await API.get('/settings');
    const s = res.success ? res.data : {};

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">White-Label / Branding</h1>
          <p class="page-subtitle">Firmenname, Logos und Anrede anpassen</p>
        </div>
      </div>

      <div class="card mb-4" style="max-width:640px">
        <div class="card-header"><h3 class="card-title">Allgemein</h3></div>
        <div class="card-body">
          <form onsubmit="WhiteLabelPage.save(event)">
            <div class="form-group">
              <label class="form-label">Firmenname</label>
              <input type="text" class="form-control" name="wl_company_name" value="${this.esc(s.wl_company_name || 'IT-Helpdesk')}" placeholder="IT-Helpdesk">
              <div class="form-hint">Wird in der Sidebar, Login-Seite und im Seitentitel angezeigt</div>
            </div>
            <div class="form-group">
              <label class="form-label">Anredeform</label>
              <select class="form-control" name="wl_formality">
                <option value="sie" ${(s.wl_formality || 'sie') === 'sie' ? 'selected' : ''}>Sie (formell)</option>
                <option value="du" ${s.wl_formality === 'du' ? 'selected' : ''}>Du (informell)</option>
              </select>
              <div class="form-hint">Bestimmt die Anrede in der gesamten Benutzeroberfl\u00E4che</div>
            </div>
            <div class="form-group">
              <label class="form-label">Akzentfarbe</label>
              <div class="flex items-center gap-2">
                <input type="color" name="wl_primary_color" value="${s.wl_primary_color || '#4F46E5'}" style="width:50px;height:36px;border:none;cursor:pointer">
                <input type="text" class="form-control" style="max-width:120px" value="${s.wl_primary_color || '#4F46E5'}" oninput="this.previousElementSibling.value=this.value" onchange="this.previousElementSibling.value=this.value">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label flex items-center gap-2">
                <input type="checkbox" name="wl_registration_enabled" value="true" ${s.wl_registration_enabled === 'true' ? 'checked' : ''}>
                Selbst-Registrierung aktivieren
              </label>
              <div class="form-hint">Benutzer k\u00F6nnen sich mit einem Einladungsschl\u00FCssel selbst registrieren</div>
            </div>
            <button type="submit" class="btn btn-primary">Speichern</button>
          </form>
        </div>
      </div>

      <div class="card mb-4" style="max-width:640px">
        <div class="card-header"><h3 class="card-title">Logos</h3></div>
        <div class="card-body">
          <form onsubmit="WhiteLabelPage.save(event)">
            <div class="form-group">
              <label class="form-label">Logo (Sidebar)</label>
              <div class="logo-upload-row">
                <input type="text" class="form-control" name="wl_logo_url" id="wl_logo_url" value="${this.esc(s.wl_logo_url || '')}" placeholder="URL oder Datei hochladen">
                <label class="btn btn-secondary btn-sm" style="white-space:nowrap;cursor:pointer">
                  Hochladen
                  <input type="file" accept="image/*" style="display:none" onchange="WhiteLabelPage.uploadLogo(this, 'wl_logo_url')">
                </label>
                ${s.wl_logo_url ? `<img src="${this.esc(s.wl_logo_url)}" style="height:28px;border:1px solid var(--color-border);border-radius:4px;padding:2px">` : ''}
              </div>
              <div class="form-hint">Empfohlen: 28px H\u00F6he, transparent PNG. Leer = Initialen-Badge</div>
            </div>
            <div class="form-group">
              <label class="form-label">Logo (Login-Seite)</label>
              <div class="logo-upload-row">
                <input type="text" class="form-control" name="wl_logo_login_url" id="wl_logo_login_url" value="${this.esc(s.wl_logo_login_url || '')}" placeholder="URL oder Datei hochladen">
                <label class="btn btn-secondary btn-sm" style="white-space:nowrap;cursor:pointer">
                  Hochladen
                  <input type="file" accept="image/*" style="display:none" onchange="WhiteLabelPage.uploadLogo(this, 'wl_logo_login_url')">
                </label>
                ${s.wl_logo_login_url ? `<img src="${this.esc(s.wl_logo_login_url)}" style="height:40px;border:1px solid var(--color-border);border-radius:4px;padding:2px">` : ''}
              </div>
              <div class="form-hint">Empfohlen: max. 64px H\u00F6he. Leer = Initialen-Badge</div>
            </div>
            <div class="form-group">
              <label class="form-label">Favicon</label>
              <div class="logo-upload-row">
                <input type="text" class="form-control" name="wl_favicon_url" id="wl_favicon_url" value="${this.esc(s.wl_favicon_url || '')}" placeholder="URL oder Datei hochladen">
                <label class="btn btn-secondary btn-sm" style="white-space:nowrap;cursor:pointer">
                  Hochladen
                  <input type="file" accept="image/*,.ico" style="display:none" onchange="WhiteLabelPage.uploadLogo(this, 'wl_favicon_url')">
                </label>
                ${s.wl_favicon_url ? `<img src="${this.esc(s.wl_favicon_url)}" style="height:20px">` : ''}
              </div>
            </div>
            <button type="submit" class="btn btn-primary">Speichern</button>
          </form>
        </div>
      </div>

      <div class="card" style="max-width:640px">
        <div class="card-header"><h3 class="card-title">Vorschau</h3></div>
        <div class="card-body">
          <div style="background:var(--color-bg-tertiary);padding:24px;border-radius:var(--border-radius-lg);text-align:center">
            ${s.wl_logo_login_url
              ? `<img src="${this.esc(s.wl_logo_login_url)}" style="max-height:64px;margin-bottom:12px">`
              : `<div class="sidebar-logo" style="width:48px;height:48px;font-size:24px;margin:0 auto 12px;border-radius:12px">${(s.wl_company_name || 'H')[0]}</div>`}
            <h2 style="margin:0">${this.esc(s.wl_company_name || 'IT-Helpdesk')}</h2>
            <p class="text-muted text-sm mt-2">${s.wl_formality === 'du' ? 'Melde dich an, um fortzufahren' : 'Melden Sie sich an, um fortzufahren'}</p>
          </div>
        </div>
      </div>
    `;
  },

  async uploadLogo(input, targetFieldId) {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      Toast.error('Datei zu gro\u00DF (max. 2 MB)');
      return;
    }

    const fd = new FormData();
    fd.append('file', file);

    Toast.info('Wird hochgeladen...');
    const res = await API.upload('/settings/upload-logo', fd);

    if (res.success) {
      const urlField = document.getElementById(targetFieldId);
      if (urlField) urlField.value = res.data.url;
      Toast.success('Logo hochgeladen');
      // Refresh to show preview
      input.value = '';
    } else {
      Toast.error(res.error || 'Upload fehlgeschlagen');
    }
  },

  async save(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));

    // Checkbox handling
    if (!data.wl_registration_enabled) data.wl_registration_enabled = 'false';

    // Sync color picker
    const colorInput = e.target.querySelector('[name="wl_primary_color"]');
    if (colorInput) data.wl_primary_color = colorInput.value;

    const res = await API.put('/settings', data);
    if (res.success) {
      Toast.success('Branding gespeichert. Seite wird neu geladen...');
      // Reload to apply branding
      setTimeout(() => location.reload(), 1000);
    } else {
      Toast.error(res.error);
    }
  },

  esc(str) { if (!str) return ''; const el = document.createElement('span'); el.textContent = str; return el.innerHTML; }
};
