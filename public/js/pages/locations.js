// ============================================
// Locations / Standorte
// ============================================

const LocationPages = {
  typeIcons: { server: '🖧', switch: '🔌', router: '📡', printer: '🖨️', other: '📦' },
  assetTypeIcons: { laptop: '💻', desktop: '🖥️', phone: '📱', tablet: '📱', printer: '🖨️', server: '🖧', network: '🔌', other: '📦' },

  // ---- List ----
  async listPage(container) {
    const isAdmin = App.user.role === 'admin';
    const res = await API.get('/locations');
    const locations = res.success ? res.data : [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Standorte</h1>
          <p class="page-subtitle">Standorte, Infrastruktur und Ansprechpartner</p>
        </div>
        ${isAdmin ? '<button class="btn btn-primary" onclick="LocationPages.openEditModal()">+ Neuer Standort</button>' : ''}
      </div>

      ${locations.length === 0 ? `
        <div class="card"><div class="card-body"><div class="empty-state">
          <div class="empty-state-icon">📍</div>
          <div class="empty-state-title">Keine Standorte angelegt</div>
        </div></div></div>
      ` : `
        <div class="location-grid">
          ${locations.map(loc => {
            const hasOffline = loc.devices_offline > 0;
            return `
            <div class="location-card clickable ${hasOffline ? 'location-alert' : ''}" onclick="Router.navigate('/locations/${loc.slug}')">
              <div class="location-card-header">
                <h3 class="location-card-name">${this.esc(loc.name)}</h3>
                ${hasOffline ? '<span class="badge badge-critical">Geräte offline</span>' : loc.device_count > 0 ? '<span class="badge badge-active">Alles online</span>' : ''}
              </div>
              ${loc.address ? `<div class="location-card-address">${this.esc(loc.address)}</div>` : ''}
              ${loc.contact_name ? `<div class="location-card-contact">📞 ${this.esc(loc.contact_name)}${loc.contact_phone ? ' · ' + this.esc(loc.contact_phone) : ''}</div>` : ''}
              <div class="location-card-stats">
                <div class="location-stat">
                  <span class="location-stat-value">${loc.device_count}</span>
                  <span class="location-stat-label">Netzwerk</span>
                </div>
                <div class="location-stat">
                  <span class="location-stat-value ${hasOffline ? 'text-error' : ''}">${hasOffline ? loc.devices_offline + ' ⚠' : loc.devices_online}</span>
                  <span class="location-stat-label">${hasOffline ? 'Offline' : 'Online'}</span>
                </div>
                <div class="location-stat">
                  <span class="location-stat-value">${loc.asset_count}</span>
                  <span class="location-stat-label">Assets</span>
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    `;
  },

  // ---- Detail ----
  async detailPage(container, params) {
    const res = await API.get(`/locations/${params.slug}`);
    if (!res.success) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Standort nicht gefunden</div></div>';
      return;
    }

    const loc = res.data;
    const isAdmin = App.user.role === 'admin';
    const offlineDevices = (loc.devices || []).filter(d => d.last_status === 'down');
    const onlineDevices = (loc.devices || []).filter(d => d.last_status === 'up');
    const unknownDevices = (loc.devices || []).filter(d => !d.last_status || (d.last_status !== 'up' && d.last_status !== 'down'));

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="flex items-center gap-2" style="margin-bottom:4px">
            <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/locations')">← Standorte</button>
          </div>
          <h1 class="page-title" style="font-size:1.25rem">📍 ${this.esc(loc.name)}</h1>
        </div>
        ${isAdmin ? `<button class="btn btn-secondary" onclick="LocationPages.openEditModal(${loc.id})">✎ Bearbeiten</button>` : ''}
      </div>

      ${offlineDevices.length > 0 ? `
      <div class="card mb-4" style="border-color:var(--color-error);border-width:2px">
        <div class="card-body">
          <div class="flex items-center gap-2" style="margin-bottom:12px">
            <span style="font-size:20px">⚠</span>
            <span class="fw-600" style="color:var(--color-error)">${offlineDevices.length} Gerät${offlineDevices.length > 1 ? 'e' : ''} offline</span>
          </div>
          <div class="device-alert-list">
            ${offlineDevices.map(d => `
            <div class="device-alert-item">
              <span class="status-dot offline"></span>
              <span class="fw-600">${this.esc(d.name)}</span>
              <span class="text-muted text-sm">${this.esc(d.ip_address)} · ${this.typeIcons[d.type] || ''} ${d.type}</span>
              <span class="text-xs text-muted">${d.last_check ? 'Letzter Check: ' + this.timeAgo(d.last_check) : ''}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>
      ` : ''}

      <div class="location-detail-grid">
        <!-- Left: Info -->
        <div>
          <!-- Standort-Info -->
          <div class="card mb-4">
            <div class="card-header"><h3 class="card-title">Standort-Informationen</h3></div>
            <div class="card-body">
              <div class="detail-grid" style="grid-template-columns:1fr 1fr">
                ${loc.address ? `<div class="detail-field"><div class="detail-label">Adresse</div><div class="text-sm">${this.esc(loc.address)}</div></div>` : ''}
                ${loc.contact_name ? `<div class="detail-field"><div class="detail-label">Ansprechpartner</div><div class="text-sm">${this.esc(loc.contact_name)}</div></div>` : ''}
                ${loc.contact_phone ? `<div class="detail-field"><div class="detail-label">Telefon</div><div class="text-sm"><a href="tel:${this.esc(loc.contact_phone)}">${this.esc(loc.contact_phone)}</a></div></div>` : ''}
                ${loc.contact_email ? `<div class="detail-field"><div class="detail-label">E-Mail</div><div class="text-sm"><a href="mailto:${this.esc(loc.contact_email)}">${this.esc(loc.contact_email)}</a></div></div>` : ''}
              </div>
              ${loc.directions ? `
              <div class="detail-field mt-4">
                <div class="detail-label">Anfahrt</div>
                <div class="text-sm" style="white-space:pre-wrap">${this.esc(loc.directions)}</div>
              </div>` : ''}
              ${loc.notes ? `
              <div class="detail-field mt-4">
                <div class="detail-label">Besonderheiten</div>
                <div class="text-sm" style="white-space:pre-wrap">${this.esc(loc.notes)}</div>
              </div>` : ''}
            </div>
          </div>

          <!-- Offene Tickets -->
          <div class="card mb-4">
            <div class="card-header"><h3 class="card-title">Offene Tickets am Standort</h3></div>
            <div class="card-body" style="padding:0">
              ${!loc.tickets || loc.tickets.length === 0 ?
                '<div class="text-center text-muted text-sm" style="padding:24px">Keine offenen Tickets</div>' : `
              <table class="data-table">
                <thead><tr><th>Nr.</th><th>Titel</th><th>Status</th><th>Asset</th></tr></thead>
                <tbody>
                  ${loc.tickets.map(t => `
                  <tr class="clickable" onclick="Router.navigate('/tickets/${t.id}')">
                    <td class="fw-600" style="color:var(--color-primary)">${this.esc(t.ticket_number)}</td>
                    <td class="text-sm">${this.esc(t.title)}</td>
                    <td><span class="badge badge-${t.status}">${t.status}</span></td>
                    <td class="text-sm text-muted">${this.esc(t.asset_tag || '')} ${this.esc(t.asset_name || '')}</td>
                  </tr>`).join('')}
                </tbody>
              </table>`}
            </div>
          </div>
        </div>

        <!-- Right: Devices + Assets -->
        <div>
          <!-- Netzwerk-Geräte -->
          <div class="card mb-4">
            <div class="card-header">
              <h3 class="card-title">Netzwerk-Infrastruktur</h3>
              <span class="text-xs text-muted">${(loc.devices || []).length} Geräte</span>
            </div>
            <div class="card-body" style="padding:0">
              ${!loc.devices || loc.devices.length === 0 ?
                '<div class="text-center text-muted text-sm" style="padding:24px">Keine Netzwerkgeräte</div>' : `
              <div class="device-list">
                ${loc.devices.map(d => {
                  const statusClass = d.last_status === 'up' ? 'online' : d.last_status === 'down' ? 'offline' : 'unknown';
                  return `
                  <div class="device-list-item">
                    <span class="status-dot ${statusClass}"></span>
                    <div class="device-list-info">
                      <div class="device-list-name">${this.typeIcons[d.type] || ''} ${this.esc(d.name)}</div>
                      <div class="device-list-meta">${this.esc(d.ip_address)}${d.last_response_time ? ' · ' + d.last_response_time + 'ms' : ''}</div>
                    </div>
                    <div class="device-list-status">
                      <span class="badge badge-${statusClass === 'online' ? 'active' : statusClass === 'offline' ? 'critical' : 'closed'}">
                        ${statusClass === 'online' ? 'Online' : statusClass === 'offline' ? 'Offline' : 'Unbekannt'}
                      </span>
                    </div>
                  </div>`;
                }).join('')}
              </div>`}
            </div>
          </div>

          <!-- Assets -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Assets am Standort</h3>
              <span class="text-xs text-muted">${(loc.assets || []).length} Geräte</span>
            </div>
            <div class="card-body" style="padding:0">
              ${!loc.assets || loc.assets.length === 0 ?
                '<div class="text-center text-muted text-sm" style="padding:24px">Keine Assets</div>' : `
              <table class="data-table">
                <thead><tr><th>Tag</th><th>Name</th><th>Typ</th><th>Status</th><th>Benutzer</th></tr></thead>
                <tbody>
                  ${loc.assets.map(a => `
                  <tr class="clickable" onclick="Router.navigate('/assets/${a.id}')">
                    <td class="fw-600" style="color:var(--color-primary)">${this.esc(a.asset_tag)}</td>
                    <td class="text-sm">${this.esc(a.name)}</td>
                    <td class="text-sm">${this.assetTypeIcons[a.type] || ''} ${a.type}</td>
                    <td><span class="badge badge-${a.status === 'active' ? 'active' : a.status === 'in_repair' ? 'pending' : 'closed'}">${a.status}</span></td>
                    <td class="text-sm text-muted">${this.esc(a.assigned_to_name) || '—'}</td>
                  </tr>`).join('')}
                </tbody>
              </table>`}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ---- Create / Edit Modal ----
  async openEditModal(locationId = null) {
    let loc = null;
    if (locationId) {
      const res = await API.get(`/locations/${locationId}`);
      if (res.success) loc = res.data;
    }

    const isEdit = !!loc;

    const overlay = Modal.open({
      title: isEdit ? 'Standort bearbeiten' : 'Neuer Standort',
      size: 'lg',
      content: `
        <form id="locationForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Name *</label>
              <input type="text" class="form-control" name="name" value="${this.esc(loc?.name || '')}" required placeholder="z.B. Hauptbüro, Serverraum">
            </div>
            <div class="form-group">
              <label class="form-label">Sortierung</label>
              <input type="number" class="form-control" name="sort_order" value="${loc?.sort_order || 0}" min="0">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Adresse</label>
            <input type="text" class="form-control" name="address" value="${this.esc(loc?.address || '')}" placeholder="Straße, PLZ Ort">
          </div>
          <div class="form-group">
            <label class="form-label">Anfahrtsbeschreibung</label>
            <textarea class="form-control" name="directions" rows="3" placeholder="Parkplatz, Eingang, Etage...">${loc?.directions || ''}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Ansprechpartner</label>
              <input type="text" class="form-control" name="contact_name" value="${this.esc(loc?.contact_name || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Telefon</label>
              <input type="text" class="form-control" name="contact_phone" value="${this.esc(loc?.contact_phone || '')}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">E-Mail</label>
            <input type="email" class="form-control" name="contact_email" value="${this.esc(loc?.contact_email || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Besonderheiten / Notizen</label>
            <textarea class="form-control" name="notes" rows="3" placeholder="Zugang, Alarmanlage, Schlüssel...">${loc?.notes || ''}</textarea>
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-secondary" data-action="cancel">Abbrechen</button>
        ${isEdit ? '<button class="btn btn-danger" data-action="delete">Löschen</button>' : ''}
        <button class="btn btn-primary" data-action="save">${isEdit ? 'Speichern' : 'Erstellen'}</button>
      `
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => Modal.close(overlay));

    overlay.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      Modal.confirm('Standort wirklich löschen?', async () => {
        await API.delete(`/locations/${locationId}`);
        Modal.close(overlay);
        Toast.success('Standort gelöscht');
        Router.navigate('/locations');
      });
    });

    overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const data = Object.fromEntries(new FormData(document.getElementById('locationForm')));
      const btn = overlay.querySelector('[data-action="save"]');
      btn.disabled = true;

      const result = isEdit
        ? await API.put(`/locations/${locationId}`, data)
        : await API.post('/locations', data);

      if (result.success) {
        Modal.close(overlay);
        Toast.success(isEdit ? 'Standort aktualisiert' : 'Standort erstellt');
        Router.navigate(isEdit ? `/locations/${loc.slug}` : '/locations');
      } else {
        Toast.error(result.error);
        btn.disabled = false;
      }
    });
  },

  // Utils
  timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `vor ${hrs}h`;
    return `vor ${Math.floor(hrs / 24)}d`;
  },

  esc(str) {
    if (!str) return '';
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }
};
