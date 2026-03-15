// ============================================
// Order Pages
// ============================================

const OrderPages = {
  statusLabels: { requested: 'Angefragt', approved: 'Genehmigt', ordered: 'Bestellt', shipped: 'Versandt', delivered: 'Geliefert', completed: 'Abgeschlossen', rejected: 'Abgelehnt' },

  async listPage(container) {
    const isAgent = App.user.role !== 'user';

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Bestellungen</h1>
          <p class="page-subtitle">${isAgent ? 'Alle Gerätebestellungen verwalten' : 'Ihre Bestellungen'}</p>
        </div>
        <button class="btn btn-primary" onclick="OrderPages.openCreateModal()">+ Neue Bestellung</button>
      </div>
      <div class="filter-bar">
        <button class="filter-chip active" data-st="" onclick="OrderPages.filterStatus('',this)">Alle</button>
        <button class="filter-chip" data-st="requested" onclick="OrderPages.filterStatus('requested',this)">Angefragt</button>
        <button class="filter-chip" data-st="approved" onclick="OrderPages.filterStatus('approved',this)">Genehmigt</button>
        <button class="filter-chip" data-st="ordered" onclick="OrderPages.filterStatus('ordered',this)">Bestellt</button>
        <button class="filter-chip" data-st="completed" onclick="OrderPages.filterStatus('completed',this)">Abgeschlossen</button>
        <button class="filter-chip" data-st="rejected" onclick="OrderPages.filterStatus('rejected',this)">Abgelehnt</button>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Nr.</th><th>Titel</th><th>Status</th><th>Priorität</th>
            ${isAgent ? '<th>Angefragt von</th>' : ''}
            <th>Erstellt</th>
          </tr></thead>
          <tbody id="ordersBody"><tr><td colspan="${isAgent?6:5}" class="text-center" style="padding:40px">Laden...</td></tr></tbody>
        </table>
        <div id="ordersPagination"></div>
      </div>
    `;

    this._status = '';
    this.loadOrders();
  },

  _status: '',

  filterStatus(status, chip) {
    document.querySelectorAll('.filter-chip[data-st]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    this._status = status;
    this.loadOrders();
  },

  async loadOrders() {
    const isAgent = App.user.role !== 'user';
    const res = await API.get('/orders' + API.qs({ status: this._status, limit: 20 }));
    const tbody = document.getElementById('ordersBody');
    if (!tbody) return;

    if (!res.success || res.data.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${isAgent?6:5}">Keine Bestellungen</td></tr>`;
      return;
    }

    const priorityLabels = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch' };

    tbody.innerHTML = res.data.map(o => `
      <tr class="clickable" onclick="Router.navigate('/orders/${o.id}')">
        <td class="fw-600" style="color:var(--color-primary)">${this.esc(o.order_number)}</td>
        <td>${this.esc(o.title)}</td>
        <td><span class="badge badge-${o.status === 'rejected' ? 'critical' : o.status === 'completed' ? 'resolved' : 'open'}">${this.statusLabels[o.status]}</span></td>
        <td><span class="badge badge-${o.priority}">${priorityLabels[o.priority]}</span></td>
        ${isAgent ? `<td class="text-sm">${this.esc(o.requested_by_name)}</td>` : ''}
        <td class="text-sm text-muted">${new Date(o.created_at).toLocaleDateString('de-DE')}</td>
      </tr>
    `).join('');
  },

  async detailPage(container, params) {
    const res = await API.get(`/orders/${params.id}`);
    if (!res.success) { container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Bestellung nicht gefunden</div></div>'; return; }

    const o = res.data;
    const isAgent = App.user.role !== 'user';
    const activeStep = o.steps?.find(s => s.status === 'active');

    container.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/orders')">← Zurück</button>
          <h1 class="page-title" style="font-size:1.25rem;margin-top:8px">${this.esc(o.title)}</h1>
          <span class="text-sm text-muted">${this.esc(o.order_number)}</span>
        </div>
      </div>

      <!-- Stepper -->
      <div class="card mb-4">
        <div class="card-body">
          <div class="stepper">
            ${(o.steps || []).map((s, i) => {
              const statusClass = s.status === 'completed' ? 'step-done' : s.status === 'active' ? 'step-active' : 'step-pending';
              return `
              <div class="step ${statusClass}">
                <div class="step-circle">${s.status === 'completed' ? '✓' : i + 1}</div>
                <div class="step-label">${this.esc(s.step_name)}</div>
                ${s.completed_at ? `<div class="step-date">${new Date(s.completed_at).toLocaleDateString('de-DE')}</div>` : ''}
                ${s.completed_by_name ? `<div class="step-date">${this.esc(s.completed_by_name)}</div>` : ''}
                ${s.notes ? `<div class="step-date text-xs">${this.esc(s.notes)}</div>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      ${o.status === 'rejected' ? `
      <div class="card mb-4" style="border-color:var(--color-error)">
        <div class="card-body">
          <div class="fw-600" style="color:var(--color-error)">Bestellung abgelehnt</div>
          <p class="text-sm mt-2">${this.esc(o.rejection_reason)}</p>
        </div>
      </div>
      ` : ''}

      <div class="ticket-detail-layout">
        <div class="ticket-main">
          <div class="card mb-4">
            <div class="card-header"><h3 class="card-title">Beschreibung</h3></div>
            <div class="card-body">${this.esc(o.description) || '<span class="text-muted">—</span>'}</div>
          </div>

          ${o.items && o.items.length > 0 ? `
          <div class="card">
            <div class="card-header"><h3 class="card-title">Artikel</h3></div>
            <div class="card-body" style="padding:0">
              <table class="data-table">
                <thead><tr><th>Artikel</th><th>Menge</th><th>Preis</th><th>Spezifikation</th></tr></thead>
                <tbody>
                  ${o.items.map(item => `
                  <tr>
                    <td>${this.esc(item.item_name)}</td>
                    <td>${item.quantity}</td>
                    <td>${item.unit_price ? item.unit_price.toFixed(2) + ' €' : '—'}</td>
                    <td class="text-sm">${this.esc(item.specs) || '—'}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
          ` : ''}
        </div>

        <div class="ticket-sidebar">
          <div class="card">
            <div class="card-body">
              <div class="detail-field">
                <div class="detail-label">Status</div>
                <span class="badge badge-${o.status === 'rejected' ? 'critical' : o.status === 'completed' ? 'resolved' : 'open'}">${this.statusLabels[o.status]}</span>
              </div>
              <div class="detail-field"><div class="detail-label">Angefragt von</div><div class="text-sm">${this.esc(o.requested_by_name)}</div></div>
              ${o.approved_by_name ? `<div class="detail-field"><div class="detail-label">Genehmigt von</div><div class="text-sm">${this.esc(o.approved_by_name)}</div></div>` : ''}
              ${o.supplier ? `<div class="detail-field"><div class="detail-label">Lieferant</div><div class="text-sm">${this.esc(o.supplier)}</div></div>` : ''}
              ${o.total_cost ? `<div class="detail-field"><div class="detail-label">Gesamtkosten</div><div class="text-sm fw-600">${o.total_cost.toFixed(2)} €</div></div>` : ''}
              <div class="detail-field"><div class="detail-label">Erstellt</div><div class="text-sm">${new Date(o.created_at).toLocaleString('de-DE')}</div></div>

              ${isAgent && activeStep && o.status !== 'rejected' ? `
              <div style="margin-top:16px">
                <div class="form-group">
                  <label class="form-label text-xs">Notiz zum Schritt</label>
                  <input type="text" class="form-control" id="stepNotes" placeholder="Optional">
                </div>
                <button class="btn btn-primary btn-block" onclick="OrderPages.advanceStep(${o.id})">
                  "${this.esc(activeStep.step_name)}" abschließen →
                </button>
                ${o.status === 'requested' ? `
                <button class="btn btn-danger btn-block mt-2" onclick="OrderPages.rejectOrder(${o.id})">Ablehnen</button>
                ` : ''}
              </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async advanceStep(orderId) {
    const notes = document.getElementById('stepNotes')?.value || '';
    const res = await API.put(`/orders/${orderId}/step`, { notes });
    if (res.success) {
      Toast.success(res.message);
      Router.navigate(`/orders/${orderId}`, false);
    } else {
      Toast.error(res.error);
    }
  },

  async rejectOrder(orderId) {
    const overlay = Modal.open({
      title: 'Bestellung ablehnen',
      content: `<div class="form-group"><label class="form-label">Begründung *</label><textarea class="form-control" id="rejectReason" rows="3" required></textarea></div>`,
      footer: '<button class="btn btn-secondary" data-action="cancel">Abbrechen</button><button class="btn btn-danger" data-action="reject">Ablehnen</button>'
    });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => Modal.close(overlay));
    overlay.querySelector('[data-action="reject"]').addEventListener('click', async () => {
      const reason = document.getElementById('rejectReason').value;
      if (!reason) { Toast.error('Begründung erforderlich'); return; }
      const res = await API.put(`/orders/${orderId}/reject`, { reason });
      if (res.success) { Modal.close(overlay); Toast.success('Bestellung abgelehnt'); Router.navigate(`/orders/${orderId}`, false); }
      else Toast.error(res.error);
    });
  },

  openCreateModal() {
    const overlay = Modal.open({
      title: 'Neue Bestellung',
      size: 'lg',
      content: `
        <form id="orderForm">
          <div class="form-group"><label class="form-label">Titel *</label><input type="text" class="form-control" name="title" required placeholder="z.B. Neues Headset"></div>
          <div class="form-group"><label class="form-label">Beschreibung</label><textarea class="form-control" name="description" rows="3"></textarea></div>
          <div class="form-group"><label class="form-label">Priorität</label>
            <select class="form-control" name="priority"><option value="low">Niedrig</option><option value="medium" selected>Mittel</option><option value="high">Hoch</option></select>
          </div>
          <h3 style="margin:16px 0 8px">Artikel</h3>
          <div id="orderItems">
            <div class="form-row order-item-row">
              <div class="form-group" style="flex:2"><input type="text" class="form-control" placeholder="Artikelname" data-field="item_name"></div>
              <div class="form-group" style="flex:0.5"><input type="number" class="form-control" placeholder="Menge" value="1" data-field="quantity" min="1"></div>
              <div class="form-group" style="flex:1"><input type="text" class="form-control" placeholder="Spezifikation" data-field="specs"></div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="OrderPages.addItemRow()">+ Artikel hinzufügen</button>
        </form>`,
      footer: '<button class="btn btn-secondary" data-action="cancel">Abbrechen</button><button class="btn btn-primary" data-action="save">Bestellen</button>'
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => Modal.close(overlay));
    overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const form = document.getElementById('orderForm');
      const data = Object.fromEntries(new FormData(form));

      // Collect items
      const items = [];
      document.querySelectorAll('.order-item-row').forEach(row => {
        const item = {};
        row.querySelectorAll('[data-field]').forEach(input => { item[input.dataset.field] = input.value; });
        if (item.item_name) items.push(item);
      });
      data.items = items;

      const res = await API.post('/orders', data);
      if (res.success) { Modal.close(overlay); Toast.success('Bestellung erstellt'); this.loadOrders(); }
      else Toast.error(res.error);
    });
  },

  addItemRow() {
    const container = document.getElementById('orderItems');
    const row = document.createElement('div');
    row.className = 'form-row order-item-row';
    row.innerHTML = `
      <div class="form-group" style="flex:2"><input type="text" class="form-control" placeholder="Artikelname" data-field="item_name"></div>
      <div class="form-group" style="flex:0.5"><input type="number" class="form-control" placeholder="Menge" value="1" data-field="quantity" min="1"></div>
      <div class="form-group" style="flex:1"><input type="text" class="form-control" placeholder="Spezifikation" data-field="specs"></div>
    `;
    container.appendChild(row);
  },

  esc(str) { if (!str) return ''; const el = document.createElement('span'); el.textContent = str; return el.innerHTML; }
};
