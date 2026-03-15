// ============================================
// Self-Service Portal
// ============================================

const SelfServicePage = {
  async render(container) {
    // Load stats
    const [ticketStats, orderRes] = await Promise.all([
      API.get('/tickets/stats'),
      API.get('/orders?limit=5')
    ]);

    const stats = ticketStats.success ? ticketStats.data : {};
    const orders = orderRes.success ? orderRes.data : [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Self-Service Portal</h1>
          <p class="page-subtitle">Willkommen, ${App.user.name}</p>
        </div>
      </div>

      <!-- Quick Actions -->
      <h2 style="font-size:var(--font-size-lg);margin-bottom:16px">Schnellaktionen</h2>
      <div class="selfservice-grid mb-4">
        <div class="selfservice-card" onclick="SelfServicePage.quickTicket('Passwort zurücksetzen', 'Zugang/Passwort', 'Bitte mein Passwort für folgendes System zurücksetzen: ')">
          <div class="selfservice-icon">🔑</div>
          <div class="selfservice-title">Passwort zurücksetzen</div>
          <div class="selfservice-desc">Passwort-Reset für ein System anfordern</div>
        </div>
        <div class="selfservice-card" onclick="SelfServicePage.quickTicket('Gerät defekt', 'Hardware', 'Folgendes Gerät ist defekt: ')">
          <div class="selfservice-icon">🔧</div>
          <div class="selfservice-title">Gerät defekt</div>
          <div class="selfservice-desc">Hardware-Problem melden</div>
        </div>
        <div class="selfservice-card" onclick="SelfServicePage.quickTicket('Software-Installation', 'Software', 'Bitte folgende Software installieren: ')">
          <div class="selfservice-icon">💿</div>
          <div class="selfservice-title">Software anfordern</div>
          <div class="selfservice-desc">Software-Installation beantragen</div>
        </div>
        <div class="selfservice-card" onclick="Router.navigate('/tickets/new')">
          <div class="selfservice-icon">🎫</div>
          <div class="selfservice-title">Neues Ticket</div>
          <div class="selfservice-desc">Allgemeine Support-Anfrage erstellen</div>
        </div>
        <div class="selfservice-card" onclick="Router.navigate('/kb')">
          <div class="selfservice-icon">📖</div>
          <div class="selfservice-title">Knowledge Base</div>
          <div class="selfservice-desc">Anleitungen und FAQ durchsuchen</div>
        </div>
      </div>

      <div class="form-row" style="grid-template-columns: 1fr 1fr">
        <!-- My Tickets -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Meine Tickets</h3>
            <a href="#/tickets/my" class="btn btn-ghost btn-sm" onclick="Router.navigate('/tickets/my');return false">Alle →</a>
          </div>
          <div class="card-body" style="padding:0">
            <div id="ssTickets">Laden...</div>
          </div>
        </div>

        <!-- My Orders -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Meine Bestellungen</h3>
            <a href="#/orders" class="btn btn-ghost btn-sm" onclick="Router.navigate('/orders');return false">Alle →</a>
          </div>
          <div class="card-body" style="padding:0">
            ${orders.length === 0 ? '<div class="text-center text-muted" style="padding:24px">Keine Bestellungen</div>' :
              orders.map(o => `
              <div class="clickable" style="padding:12px 16px;border-bottom:1px solid var(--color-border-light)" onclick="Router.navigate('/orders/${o.id}')">
                <div class="flex items-center justify-between">
                  <span class="text-sm fw-600">${this.esc(o.title)}</span>
                  <span class="badge badge-${o.status === 'completed' ? 'resolved' : o.status === 'rejected' ? 'critical' : 'open'}">${o.status}</span>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `;

    // Load recent tickets
    const ticketRes = await API.get('/tickets?limit=5');
    const ssTickets = document.getElementById('ssTickets');
    if (ssTickets && ticketRes.success) {
      if (ticketRes.data.length === 0) {
        ssTickets.innerHTML = '<div class="text-center text-muted" style="padding:24px">Keine Tickets</div>';
      } else {
        const statusLabels = { open: 'Offen', pending: 'Wartend', in_progress: 'In Bearbeitung', resolved: 'Gelöst', closed: 'Geschlossen' };
        ssTickets.innerHTML = ticketRes.data.map(t => `
          <div class="clickable" style="padding:12px 16px;border-bottom:1px solid var(--color-border-light)" onclick="Router.navigate('/tickets/${t.id}')">
            <div class="flex items-center justify-between">
              <span class="text-sm fw-600">${this.esc(t.title)}</span>
              <span class="badge badge-${t.status}">${statusLabels[t.status]}</span>
            </div>
            <div class="text-xs text-muted">${t.ticket_number} · ${new Date(t.created_at).toLocaleDateString('de-DE')}</div>
          </div>
        `).join('');
      }
    }
  },

  quickTicket(title, category, descriptionPrefix) {
    // Navigate to new ticket with prefilled data
    Router.navigate('/tickets/new');
    // Wait for page to render, then prefill
    setTimeout(() => {
      const titleInput = document.querySelector('[name="title"]');
      const catSelect = document.querySelector('[name="category"]');
      const descInput = document.querySelector('[name="description"]');
      if (titleInput) titleInput.value = title;
      if (catSelect) catSelect.value = category;
      if (descInput) { descInput.value = descriptionPrefix; descInput.focus(); }
    }, 100);
  },

  esc(str) { if (!str) return ''; const el = document.createElement('span'); el.textContent = str; return el.innerHTML; }
};
