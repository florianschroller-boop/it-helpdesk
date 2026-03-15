// ============================================
// Ticket Pages
// ============================================

const TicketPages = {

  // Status/Priority label maps
  statusLabels: { open: 'Offen', pending: 'Wartend', in_progress: 'In Bearbeitung', resolved: 'Gelöst', closed: 'Geschlossen' },
  priorityLabels: { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch' },
  categories: ['Hardware', 'Software', 'Netzwerk', 'Zugang/Passwort', 'Bestellung', 'Sonstiges'],

  // ---- Ticket List ----
  _filter: { status: '', priority: '', category: '', search: '', page: 1, assignee: '', view: 'table' },
  _agents: [],

  async listPage(container) {
    const isAgent = App.user.role !== 'user';

    // Load agents for assignment dropdown
    if (isAgent && this._agents.length === 0) {
      const agentResult = await API.get('/users?role=agent&limit=100');
      const adminResult = await API.get('/users?role=admin&limit=100');
      if (agentResult.success) this._agents = [...(adminResult.data || []), ...(agentResult.data || [])];
    }

    this._filter = { status: '', priority: '', category: '', search: '', page: 1, assignee: '', view: 'table' };

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Tickets</h1>
          <p class="page-subtitle">Alle Support-Anfragen verwalten</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm view-toggle active" data-view="table" onclick="TicketPages.toggleView('table', this)">☰ Liste</button>
          <button class="btn btn-secondary btn-sm view-toggle" data-view="kanban" onclick="TicketPages.toggleView('kanban', this)">▦ Kanban</button>
          <button class="btn btn-primary" onclick="Router.navigate('/tickets/new')">+ Neues Ticket</button>
        </div>
      </div>

      <div class="filter-bar" id="ticketFilters">
        <input type="text" class="form-control" placeholder="Suchen..." style="max-width:220px" id="ticketSearch" oninput="TicketPages.debounceSearch()">
        <button class="filter-chip active" data-status="" onclick="TicketPages.setFilter('status','',this)">Alle</button>
        <button class="filter-chip" data-status="open" onclick="TicketPages.setFilter('status','open',this)">Offen</button>
        <button class="filter-chip" data-status="in_progress" onclick="TicketPages.setFilter('status','in_progress',this)">In Bearbeitung</button>
        <button class="filter-chip" data-status="pending" onclick="TicketPages.setFilter('status','pending',this)">Wartend</button>
        <button class="filter-chip" data-status="resolved" onclick="TicketPages.setFilter('status','resolved',this)">Gelöst</button>
        <button class="filter-chip" data-status="closed" onclick="TicketPages.setFilter('status','closed',this)">Geschlossen</button>
        <select class="form-control" style="width:auto" onchange="TicketPages._filter.priority=this.value;TicketPages._filter.page=1;TicketPages.loadTickets()">
          <option value="">Alle Prioritäten</option>
          <option value="critical">Kritisch</option>
          <option value="high">Hoch</option>
          <option value="medium">Mittel</option>
          <option value="low">Niedrig</option>
        </select>
        <select class="form-control" style="width:auto" onchange="TicketPages._filter.category=this.value;TicketPages._filter.page=1;TicketPages.loadTickets()">
          <option value="">Alle Kategorien</option>
          ${this.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        ${isAgent ? `
        <select class="form-control" style="width:auto" onchange="TicketPages._filter.assignee=this.value;TicketPages._filter.page=1;TicketPages.loadTickets()">
          <option value="">Alle Agents</option>
          <option value="${App.user.id}">Mir zugewiesen</option>
          <option value="unassigned">Nicht zugewiesen</option>
          ${this._agents.filter(a => a.id !== App.user.id).map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('')}
        </select>
        ` : ''}
      </div>

      <div id="ticketTableView">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:110px">Nr.</th>
                <th>Titel</th>
                <th>Status</th>
                <th>Priorität</th>
                <th>Kategorie</th>
                ${isAgent ? '<th>Ersteller</th><th>Standort</th><th>Zugewiesen</th>' : ''}
                <th>Erstellt</th>
              </tr>
            </thead>
            <tbody id="ticketTableBody">
              <tr><td colspan="${isAgent ? 9 : 6}" class="text-center" style="padding:40px">Laden...</td></tr>
            </tbody>
          </table>
          <div id="ticketPagination"></div>
        </div>
      </div>

      <div id="ticketKanbanView" class="hidden">
        <div class="kanban-board" id="kanbanBoard"></div>
      </div>
    `;

    this.loadTickets();
  },

  _searchTimer: null,
  debounceSearch() {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this._filter.search = document.getElementById('ticketSearch')?.value || '';
      this._filter.page = 1;
      this.loadTickets();
    }, 300);
  },

  setFilter(key, value, chip) {
    if (key === 'status') {
      document.querySelectorAll('.filter-chip[data-status]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    }
    this._filter[key] = value;
    this._filter.page = 1;
    this.loadTickets();
  },

  toggleView(view, btn) {
    document.querySelectorAll('.view-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this._filter.view = view;

    document.getElementById('ticketTableView').classList.toggle('hidden', view !== 'table');
    document.getElementById('ticketKanbanView').classList.toggle('hidden', view !== 'kanban');

    if (view === 'kanban') this.loadKanban();
  },

  async loadTickets() {
    const params = API.qs({
      status: this._filter.status,
      priority: this._filter.priority,
      category: this._filter.category,
      assignee: this._filter.assignee,
      search: this._filter.search,
      page: this._filter.page,
      limit: 20
    });

    const result = await API.get('/tickets' + params);
    const tbody = document.getElementById('ticketTableBody');
    if (!tbody) return;

    const isAgent = App.user.role !== 'user';

    if (!result.success || result.data.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${isAgent ? 9 : 6}">Keine Tickets gefunden</td></tr>`;
      document.getElementById('ticketPagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = result.data.map(t => {
      const slaWarning = t.sla_due_at && new Date(t.sla_due_at) < new Date() && !['resolved', 'closed'].includes(t.status);
      const slaClose = t.sla_due_at && !slaWarning && (new Date(t.sla_due_at) - new Date()) < 86400000 && !['resolved', 'closed'].includes(t.status);

      return `
      <tr class="clickable" onclick="Router.navigate('/tickets/${t.id}')">
        <td><span class="fw-600" style="color:var(--color-primary)">${this.esc(t.ticket_number)}</span></td>
        <td>
          <div class="truncate" style="max-width:300px">${this.esc(t.title)}</div>
          ${slaWarning ? '<span style="color:var(--color-error);font-size:11px">⚠ SLA überschritten</span>' : ''}
          ${slaClose ? '<span style="color:var(--color-warning);font-size:11px">⏳ SLA bald fällig</span>' : ''}
        </td>
        <td><span class="badge badge-${t.status}">${this.statusLabels[t.status] || t.status}</span></td>
        <td><span class="badge badge-${t.priority}">${this.priorityLabels[t.priority] || t.priority}</span></td>
        <td class="text-sm">${this.esc(t.category) || '—'}</td>
        ${isAgent ? `
          <td class="text-sm">${this.esc(t.requester_name) || '—'}</td>
          <td class="text-sm">${t.requester_location ? '<span title="' + this.esc(t.requester_location) + '">📍 ' + this.esc(t.requester_location) + '</span>' : '<span class="text-muted">—</span>'}</td>
          <td class="text-sm">${this.esc(t.assignee_name) || '<span class="text-muted">—</span>'}</td>
        ` : ''}
        <td class="text-sm text-muted">${this.formatDate(t.created_at)}</td>
      </tr>`;
    }).join('');

    renderPagination(
      document.getElementById('ticketPagination'),
      result.pagination,
      (page) => { this._filter.page = page; this.loadTickets(); }
    );
  },

  // ---- Kanban Board ----
  async loadKanban() {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;

    const columns = [
      { status: 'open', label: 'Offen', color: 'var(--status-open)' },
      { status: 'in_progress', label: 'In Bearbeitung', color: 'var(--status-in-progress)' },
      { status: 'pending', label: 'Wartend', color: 'var(--status-pending)' },
      { status: 'resolved', label: 'Gelöst', color: 'var(--status-resolved)' }
    ];

    board.innerHTML = columns.map(col => `
      <div class="kanban-column" data-status="${col.status}">
        <div class="kanban-column-header">
          <span class="kanban-dot" style="background:${col.color}"></span>
          <span>${col.label}</span>
          <span class="kanban-count" id="kanban-count-${col.status}">...</span>
        </div>
        <div class="kanban-cards" id="kanban-cards-${col.status}">
          <div class="text-center text-muted text-sm" style="padding:20px">Laden...</div>
        </div>
      </div>
    `).join('');

    // Load each column
    for (const col of columns) {
      const result = await API.get(`/tickets?status=${col.status}&limit=50`);
      const container = document.getElementById(`kanban-cards-${col.status}`);
      const countEl = document.getElementById(`kanban-count-${col.status}`);

      if (!result.success || result.data.length === 0) {
        container.innerHTML = '<div class="text-center text-muted text-sm" style="padding:20px">Keine Tickets</div>';
        countEl.textContent = '0';
        continue;
      }

      countEl.textContent = result.data.length;
      container.innerHTML = result.data.map(t => `
        <div class="kanban-card clickable" onclick="Router.navigate('/tickets/${t.id}')">
          <div class="kanban-card-number">${this.esc(t.ticket_number)}</div>
          <div class="kanban-card-title">${this.esc(t.title)}</div>
          <div class="kanban-card-meta">
            <span class="badge badge-${t.priority}" style="font-size:10px">${this.priorityLabels[t.priority]}</span>
            <span class="text-xs text-muted">${this.esc(t.requester_name) || ''}</span>
          </div>
        </div>
      `).join('');
    }
  },

  // ---- My Inbox ----
  _inboxFilter: { status: '', page: 1 },

  async myInbox(container) {
    const isAgent = App.user.role !== 'user';
    this._inboxFilter = { status: '', page: 1 };

    // Load stats
    const statsRes = await API.get('/tickets/stats');
    const stats = statsRes.success ? statsRes.data : {};

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${isAgent ? 'Mein Posteingang' : 'Meine Tickets'}</h1>
          <p class="page-subtitle">${isAgent ? 'Dir zugewiesene Tickets' : 'Deine Support-Anfragen'}</p>
        </div>
        <button class="btn btn-primary" onclick="Router.navigate('/tickets/new')">+ Neues Ticket</button>
      </div>

      ${isAgent ? `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon blue">☰</div>
          <div>
            <div class="stat-value">${stats.my_assigned || 0}</div>
            <div class="stat-label">Mir zugewiesen (offen)</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow">⏳</div>
          <div>
            <div class="stat-value">${stats.open || 0}</div>
            <div class="stat-label">Offen gesamt</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon red">⚠</div>
          <div>
            <div class="stat-value">${stats.sla_breached || 0}</div>
            <div class="stat-label">SLA überschritten</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">✓</div>
          <div>
            <div class="stat-value">${stats.resolved_today || 0}</div>
            <div class="stat-label">Heute gelöst</div>
          </div>
        </div>
      </div>
      ` : ''}

      <div class="filter-bar">
        <button class="filter-chip active" data-inbox-status="" onclick="TicketPages.setInboxFilter('',this)">Alle</button>
        <button class="filter-chip" data-inbox-status="open" onclick="TicketPages.setInboxFilter('open',this)">Offen</button>
        <button class="filter-chip" data-inbox-status="in_progress" onclick="TicketPages.setInboxFilter('in_progress',this)">In Bearbeitung</button>
        <button class="filter-chip" data-inbox-status="pending" onclick="TicketPages.setInboxFilter('pending',this)">Wartend</button>
        <button class="filter-chip" data-inbox-status="resolved" onclick="TicketPages.setInboxFilter('resolved',this)">Gelöst</button>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:110px">Nr.</th>
              <th>Titel</th>
              <th>Status</th>
              <th>Priorität</th>
              <th>Kategorie</th>
              ${isAgent ? '<th>Ersteller</th>' : ''}
              <th>SLA</th>
              <th>Aktualisiert</th>
            </tr>
          </thead>
          <tbody id="myTicketsBody">
            <tr><td colspan="${isAgent ? 8 : 7}" class="text-center" style="padding:40px">Laden...</td></tr>
          </tbody>
        </table>
        <div id="myTicketsPagination"></div>
      </div>
    `;

    this.loadInboxTickets();
  },

  setInboxFilter(status, chip) {
    document.querySelectorAll('.filter-chip[data-inbox-status]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    this._inboxFilter.status = status;
    this._inboxFilter.page = 1;
    this.loadInboxTickets();
  },

  async loadInboxTickets() {
    const isAgent = App.user.role !== 'user';

    const params = API.qs({
      assignee: isAgent ? App.user.id : undefined,
      status: this._inboxFilter.status,
      page: this._inboxFilter.page,
      limit: 20
    });

    const result = await API.get('/tickets' + params);
    const tbody = document.getElementById('myTicketsBody');
    if (!tbody) return;

    const colSpan = isAgent ? 8 : 7;

    if (!result.success) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${colSpan}">${result.error || 'Fehler'}</td></tr>`;
      return;
    }
    if (result.data.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="${colSpan}">Keine Tickets vorhanden</td></tr>`;
      document.getElementById('myTicketsPagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = result.data.map(t => {
      const slaWarning = t.sla_due_at && new Date(t.sla_due_at) < new Date() && !['resolved', 'closed'].includes(t.status);
      const slaClose = t.sla_due_at && !slaWarning && (new Date(t.sla_due_at) - new Date()) < 86400000 && !['resolved', 'closed'].includes(t.status);
      const slaOk = t.sla_due_at && !slaWarning && !slaClose && !['resolved', 'closed'].includes(t.status);

      return `
      <tr class="clickable" onclick="Router.navigate('/tickets/${t.id}')">
        <td><span class="fw-600" style="color:var(--color-primary)">${this.esc(t.ticket_number)}</span></td>
        <td class="truncate" style="max-width:300px">${this.esc(t.title)}</td>
        <td><span class="badge badge-${t.status}">${this.statusLabels[t.status]}</span></td>
        <td><span class="badge badge-${t.priority}">${this.priorityLabels[t.priority]}</span></td>
        <td class="text-sm">${this.esc(t.category) || '—'}</td>
        ${isAgent ? `<td class="text-sm">${this.esc(t.requester_name) || '—'}</td>` : ''}
        <td class="text-sm ${slaWarning ? 'text-error' : slaClose ? 'text-warning' : ''}">
          ${slaWarning ? '⚠ Überschritten' : slaClose ? '⏳ <24h' : slaOk ? '✓ OK' : '—'}
        </td>
        <td class="text-sm text-muted">${this.formatDate(t.updated_at)}</td>
      </tr>`;
    }).join('');

    renderPagination(
      document.getElementById('myTicketsPagination'),
      result.pagination,
      (page) => { this._inboxFilter.page = page; this.loadInboxTickets(); }
    );
  },

  // ---- New Ticket ----
  async newTicket(container) {
    const isAgent = App.user.role !== 'user';

    // Load agents for assignment
    if (isAgent && this._agents.length === 0) {
      const agentResult = await API.get('/users?role=agent&limit=100');
      const adminResult = await API.get('/users?role=admin&limit=100');
      if (agentResult.success) this._agents = [...(adminResult.data || []), ...(agentResult.data || [])];
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Neues Ticket</h1>
          <p class="page-subtitle">Neue Support-Anfrage erstellen</p>
        </div>
      </div>
      <div class="card" style="max-width:720px">
        <div class="card-body">
          <form id="newTicketForm">
            <div class="form-group">
              <label class="form-label">Titel *</label>
              <input type="text" class="form-control" name="title" placeholder="Kurze Beschreibung des Problems" required>
            </div>

            <div class="form-group">
              <label class="form-label">Beschreibung</label>
              <textarea class="form-control" name="description" rows="6" placeholder="Beschreiben Sie das Problem ausführlich..."></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Kategorie</label>
                <select class="form-control" name="category">
                  ${this.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Priorität</label>
                <select class="form-control" name="priority">
                  <option value="low">Niedrig</option>
                  <option value="medium" selected>Mittel</option>
                  <option value="high">Hoch</option>
                  <option value="critical">Kritisch</option>
                </select>
              </div>
            </div>

            ${isAgent ? `
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Zuweisen an</label>
                <select class="form-control" name="assignee_id">
                  <option value="">— Nicht zugewiesen —</option>
                  ${this._agents.map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Quelle</label>
                <select class="form-control" name="source">
                  <option value="web">Web</option>
                  <option value="email">E-Mail</option>
                  <option value="phone">Telefon</option>
                </select>
              </div>
            </div>
            ` : ''}

            <div class="form-group">
              <label class="form-label">Anhänge</label>
              <div class="file-drop-zone" id="fileDropZone">
                <div class="file-drop-text">Dateien hierher ziehen oder <span class="text-primary clickable">durchsuchen</span></div>
                <input type="file" id="fileInput" multiple style="display:none">
              </div>
              <div id="fileList" class="mt-2"></div>
            </div>

            <div class="flex gap-2" style="margin-top:24px">
              <button type="submit" class="btn btn-primary" id="submitTicketBtn">Ticket erstellen</button>
              <button type="button" class="btn btn-secondary" onclick="history.back()">Abbrechen</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this._pendingFiles = [];
    this.setupFileDrop();

    document.getElementById('newTicketForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submitTicketBtn');
      btn.disabled = true;
      btn.textContent = 'Wird erstellt...';

      const data = Object.fromEntries(new FormData(e.target));
      if (!data.assignee_id) delete data.assignee_id;

      const result = await API.post('/tickets', data);

      if (result.success) {
        // Upload attachments
        if (this._pendingFiles.length > 0) {
          for (const file of this._pendingFiles) {
            const fd = new FormData();
            fd.append('file', file);
            await API.upload(`/tickets/${result.data.id}/attachments`, fd);
          }
        }
        Toast.success(`Ticket ${result.data.ticket_number} erstellt`);
        Router.navigate(`/tickets/${result.data.id}`);
      } else {
        Toast.error(result.error);
        btn.disabled = false;
        btn.textContent = 'Ticket erstellen';
      }
    });
  },

  _pendingFiles: [],

  setupFileDrop() {
    const zone = document.getElementById('fileDropZone');
    const fileInput = document.getElementById('fileInput');
    if (!zone || !fileInput) return;

    zone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', (e) => { e.preventDefault(); zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('drag-over');
      this.addFiles(e.dataTransfer.files);
    });

    // Click anywhere in drop zone opens file picker
    zone.addEventListener('click', (e) => {
      fileInput.click();
    });

    // File input change handler (belt-and-suspenders with onchange)
    fileInput.addEventListener('change', () => {
      this.addFiles(fileInput.files);
      fileInput.value = '';
    });
  },

  handleFileSelect(input) {
    this.addFiles(input.files);
    input.value = '';
  },

  addFiles(fileList) {
    const maxSize = 20 * 1024 * 1024; // 20 MB
    for (const file of fileList) {
      if (file.size > maxSize) {
        Toast.warning(`${file.name} ist zu groß (max 20 MB)`);
        continue;
      }
      this._pendingFiles.push(file);
    }
    this.renderFileList();
  },

  renderFileList() {
    const container = document.getElementById('fileList');
    if (!container) return;

    container.innerHTML = this._pendingFiles.map((f, i) => `
      <div class="file-item">
        <span class="text-sm">${this.esc(f.name)} <span class="text-muted">(${this.formatSize(f.size)})</span></span>
        <button class="btn btn-ghost btn-sm" onclick="TicketPages._pendingFiles.splice(${i},1);TicketPages.renderFileList()">✕</button>
      </div>
    `).join('');
  },

  // ---- Ticket Detail ----
  async detailPage(container, params) {
    const ticketId = params.id;
    const isAgent = App.user.role !== 'user';

    // Load ticket, comments, history in parallel
    const [ticketRes, commentsRes, historyRes, attachRes] = await Promise.all([
      API.get(`/tickets/${ticketId}`),
      API.get(`/tickets/${ticketId}/comments`),
      API.get(`/tickets/${ticketId}/history`),
      API.get(`/tickets/${ticketId}/attachments`)
    ]);

    if (!ticketRes.success) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Ticket nicht gefunden</div></div>';
      return;
    }

    const t = ticketRes.data;
    const comments = commentsRes.data || [];
    const history = historyRes.data || [];
    const attachments = attachRes.data || [];

    // Merge comments + history into timeline
    const timeline = [
      ...comments.map(c => ({ ...c, _type: 'comment', _date: c.created_at })),
      ...history.map(h => ({ ...h, _type: 'history', _date: h.changed_at }))
    ].sort((a, b) => new Date(a._date) - new Date(b._date));

    const slaWarning = t.sla_due_at && new Date(t.sla_due_at) < new Date() && !['resolved', 'closed'].includes(t.status);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="flex items-center gap-2" style="margin-bottom:4px">
            <button class="btn btn-ghost btn-sm" onclick="history.back()">← Zurück</button>
            <span class="text-muted text-sm">${this.esc(t.ticket_number)}</span>
          </div>
          <h1 class="page-title" style="font-size:1.25rem">${this.esc(t.title)}</h1>
        </div>
        ${isAgent ? `
        <div class="flex gap-2">
          <select class="form-control" style="width:auto" id="ticketStatus" onchange="TicketPages.updateField(${t.id},'status',this.value)">
            ${Object.entries(this.statusLabels).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <select class="form-control" style="width:auto" id="ticketPriority" onchange="TicketPages.updateField(${t.id},'priority',this.value)">
            ${Object.entries(this.priorityLabels).map(([k, v]) => `<option value="${k}" ${t.priority === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        ` : ''}
      </div>

      <div class="ticket-detail-layout">
        <div class="ticket-main">
          <!-- Description -->
          <div class="card mb-4">
            <div class="card-body">
              <div class="ticket-description">${this.renderDescription(t.description)}</div>
              ${attachments.length > 0 ? `
              <div class="mt-4">
                <div class="text-sm fw-600 mb-2">Anhänge</div>
                ${attachments.map(a => `
                  <a href="${a.filepath}" target="_blank" class="file-item" style="display:inline-flex;margin-right:8px">
                    📎 ${this.esc(a.filename)} <span class="text-muted text-xs">(${this.formatSize(a.filesize)})</span>
                  </a>
                `).join('')}
              </div>
              ` : ''}
            </div>
          </div>

          <!-- Timeline -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Verlauf</h3>
            </div>
            <div class="card-body" style="padding:0">
              <div class="timeline" id="ticketTimeline">
                ${timeline.length === 0 ? '<div class="text-center text-muted" style="padding:24px">Noch keine Einträge</div>' : ''}
                ${timeline.map(item => this.renderTimelineItem(item)).join('')}
              </div>
            </div>
          </div>

          <!-- Comment Form -->
          <div class="card mt-4">
            <div class="card-body">
              ${isAgent ? `
              <div class="template-picker" style="margin-bottom:10px">
                <button type="button" class="template-picker-btn" onclick="TicketPages.toggleTemplatePicker(${t.id}, '${this.esc(t.category)}', '${this.esc(t.title)}', '${this.esc(t.requester_name)}')">
                  \u2630 Vorlage einf\u00FCgen
                </button>
                <div id="templateDropdown" style="display:none"></div>
              </div>
              ` : ''}
              <form id="commentForm" onsubmit="TicketPages.submitComment(event, ${t.id})">
                <div class="form-group" style="margin-bottom:12px">
                  <textarea class="form-control" name="content" id="commentTextarea" rows="3" placeholder="Antwort schreiben..." required></textarea>
                </div>
                <div class="flex items-center justify-between">
                  <div>
                    ${isAgent ? `
                    <label class="flex items-center gap-2 text-sm" style="cursor:pointer">
                      <input type="checkbox" name="is_internal" value="1">
                      <span>Interne Notiz (nur für Agents sichtbar)</span>
                    </label>
                    ` : ''}
                  </div>
                  <button type="submit" class="btn btn-primary" id="commentSubmitBtn">Antworten</button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="ticket-sidebar">
          <div class="card">
            <div class="card-body">
              <div class="detail-field">
                <div class="detail-label">Status</div>
                <span class="badge badge-${t.status}">${this.statusLabels[t.status]}</span>
                ${slaWarning ? '<div class="text-xs" style="color:var(--color-error);margin-top:4px">⚠ SLA überschritten</div>' : ''}
              </div>
              <div class="detail-field">
                <div class="detail-label">Priorität</div>
                <span class="badge badge-${t.priority}">${this.priorityLabels[t.priority]}</span>
              </div>
              <div class="detail-field">
                <div class="detail-label">Kategorie</div>
                ${isAgent ? `
                <select class="form-control" style="padding:4px 8px" onchange="TicketPages.updateField(${t.id},'category',this.value)">
                  ${this.categories.map(c => `<option value="${c}" ${t.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>` : `<div class="text-sm">${this.esc(t.category)}</div>`}
              </div>
              <div class="detail-field">
                <div class="detail-label">Ersteller</div>
                <div class="text-sm">${this.esc(t.requester_name)}</div>
                <div class="text-xs text-muted">${this.esc(t.requester_email)}</div>
                ${t.requester_department ? `<div class="text-xs text-muted">${this.esc(t.requester_department)}</div>` : ''}
              </div>
              ${t.location ? `
              <div class="detail-field">
                <div class="detail-label">Standort</div>
                ${t.location_slug ? `
                <a href="#/locations/${t.location_slug}" onclick="Router.navigate('/locations/${t.location_slug}');return false" class="location-link">
                  <span class="location-link-icon">📍</span>
                  <span>${this.esc(t.location_name || t.location)}</span>
                  <span class="location-link-arrow">→</span>
                </a>
                ` : `<div class="text-sm">📍 ${this.esc(t.location)}</div>`}
              </div>
              ` : ''}
              ${isAgent ? `
              <div class="detail-field">
                <div class="detail-label">Zugewiesen an</div>
                <select class="form-control" style="padding:4px 8px" onchange="TicketPages.updateField(${t.id},'assignee_id',this.value)">
                  <option value="">— Nicht zugewiesen —</option>
                  ${this._agents.map(a => `<option value="${a.id}" ${t.assignee_id == a.id ? 'selected' : ''}>${this.esc(a.name)}</option>`).join('')}
                </select>
              </div>
              ` : t.assignee_name ? `
              <div class="detail-field">
                <div class="detail-label">Bearbeiter</div>
                <div class="text-sm">${this.esc(t.assignee_name)}</div>
              </div>
              ` : ''}
              ${t.asset_name ? `
              <div class="detail-field">
                <div class="detail-label">Asset</div>
                <div class="text-sm">${this.esc(t.asset_tag)} — ${this.esc(t.asset_name)}</div>
              </div>
              ` : ''}
              <div class="detail-field">
                <div class="detail-label">Erstellt</div>
                <div class="text-sm">${this.formatDateTime(t.created_at)}</div>
              </div>
              <div class="detail-field">
                <div class="detail-label">SLA fällig</div>
                <div class="text-sm ${slaWarning ? 'text-error' : ''}">${t.sla_due_at ? this.formatDateTime(t.sla_due_at) : '—'}</div>
              </div>
              ${t.resolved_at ? `
              <div class="detail-field">
                <div class="detail-label">Gelöst</div>
                <div class="text-sm">${this.formatDateTime(t.resolved_at)}</div>
              </div>
              ` : ''}
              <div class="detail-field">
                <div class="detail-label">Quelle</div>
                <div class="text-sm">${t.source === 'email' ? '📧 E-Mail' : t.source === 'phone' ? '📞 Telefon' : '🌐 Web'}</div>
              </div>

              ${!isAgent && t.status === 'resolved' ? `
              <div style="margin-top:16px">
                <button class="btn btn-secondary btn-block" onclick="TicketPages.updateField(${t.id},'status','closed')">✓ Als erledigt bestätigen</button>
              </div>
              ` : ''}

              <div id="onboardingActions" style="margin-top:16px"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Check if ticket has linked onboarding request
    if (isAgent) {
      this.loadOnboardingPanel(t.id);
    }

    // Load agents if not loaded
    if (isAgent && this._agents.length === 0) {
      const agentResult = await API.get('/users?role=agent&limit=100');
      const adminResult = await API.get('/users?role=admin&limit=100');
      if (agentResult.success) this._agents = [...(adminResult.data || []), ...(agentResult.data || [])];
    }
  },

  renderTimelineItem(item) {
    if (item._type === 'comment') {
      const initials = (item.user_name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const isInternal = item.is_internal;
      return `
        <div class="timeline-item ${isInternal ? 'timeline-internal' : ''}">
          <div class="timeline-avatar">${initials}</div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="fw-600">${this.esc(item.user_name)}</span>
              ${isInternal ? '<span class="badge badge-closed" style="font-size:10px">Intern</span>' : ''}
              <span class="text-xs text-muted">${this.formatDateTime(item.created_at)}</span>
            </div>
            <div class="timeline-body">${this.esc(item.content)}</div>
          </div>
        </div>`;
    } else {
      const fieldLabels = { status: 'Status', priority: 'Priorität', assignee: 'Zuweisung', category: 'Kategorie', title: 'Titel' };
      return `
        <div class="timeline-item timeline-history">
          <div class="timeline-avatar timeline-avatar-sm">⟳</div>
          <div class="timeline-content">
            <span class="text-sm">
              <span class="fw-600">${this.esc(item.changed_by_name)}</span> hat
              <strong>${fieldLabels[item.field_changed] || item.field_changed}</strong> geändert:
              ${item.old_value ? `<span class="text-muted">${this.esc(item.old_value)}</span> →` : ''}
              <span>${this.esc(item.new_value)}</span>
            </span>
            <span class="text-xs text-muted" style="margin-left:8px">${this.formatDateTime(item.changed_at)}</span>
          </div>
        </div>`;
    }
  },

  async updateField(ticketId, field, value) {
    const result = await API.put(`/tickets/${ticketId}`, { [field]: value || null });
    if (result.success) {
      Toast.success('Ticket aktualisiert');
      // Refresh detail
      Router.navigate(`/tickets/${ticketId}`, false);
    } else {
      Toast.error(result.error);
    }
  },

  // ---- Onboarding Action Plan in Ticket ----
  async loadOnboardingPanel(ticketId) {
    const container = document.getElementById('onboardingActions');
    if (!container) return;

    // Try plugin route first, then legacy core route
    let res = await API.get(`/plugins/onboarding-offboarding/for-ticket/${ticketId}`).catch(() => ({ success: false }));
    if (!res.success) res = await API.get(`/onboarding/for-ticket/${ticketId}`).catch(() => ({ success: false }));
    if (!res.success || !res.data) return; // No linked onboarding

    const r = res.data;
    const totalChecks = r.checklist?.length || 0;
    const doneChecks = r.checklist?.filter(c => c.completed).length || 0;
    const progress = totalChecks > 0 ? Math.round((doneChecks / totalChecks) * 100) : 0;

    container.innerHTML = `
      <div class="detail-field">
        <div class="detail-label">Onboarding</div>
        <div class="text-sm fw-600" style="margin-bottom:6px">${this.esc(r.employee_name)}</div>
        <div class="progress-bar" style="margin-bottom:4px">
          <div class="progress-bar-fill ${progress === 100 ? 'progress-complete' : ''}" style="width:${progress}%"></div>
        </div>
        <div class="text-xs text-muted" style="margin-bottom:8px">${doneChecks}/${totalChecks} erledigt</div>
        <button class="btn btn-secondary btn-block btn-sm" onclick="TicketPages.openOnboardingPopup(${r.id})">
          Action-Plan \u00F6ffnen
        </button>
        <button class="btn btn-ghost btn-block btn-sm mt-2" onclick="Router.navigate('/plugin/onboarding-offboarding/detail/${r.id}')">
          Antrag anzeigen \u2192
        </button>
      </div>
    `;
  },

  async openOnboardingPopup(requestId) {
    const res = await API.get(`/plugins/onboarding-offboarding/requests/${requestId}`).catch(() => API.get(`/onboarding/requests/${requestId}`));
    if (!res.success) { Toast.error('Antrag nicht geladen'); return; }
    const r = res.data;
    const totalChecks = r.checklist?.length || 0;
    const doneChecks = r.checklist?.filter(c => c.completed).length || 0;
    const progress = totalChecks > 0 ? Math.round((doneChecks / totalChecks) * 100) : 0;

    const overlay = Modal.open({
      title: `Action-Plan: ${this.esc(r.employee_name)}`,
      size: 'lg',
      content: `
        <div class="flex items-center justify-between mb-4">
          <div>
            <span class="text-sm text-muted">${this.esc(r.request_number)} \u00B7 Start: ${new Date(r.start_date).toLocaleDateString('de-DE')}</span>
          </div>
          <span class="text-sm">${doneChecks}/${totalChecks} (${progress}%)</span>
        </div>
        <div class="progress-bar mb-4">
          <div class="progress-bar-fill ${progress === 100 ? 'progress-complete' : ''}" style="width:${progress}%"></div>
        </div>
        <div class="checklist" id="popupChecklist">
          ${(r.checklist || []).map(item => `
          <div class="checklist-item ${item.completed ? 'checklist-done' : ''}">
            <label class="checklist-checkbox">
              <input type="checkbox" ${item.completed ? 'checked' : ''} data-check-id="${item.id}" data-request-id="${requestId}">
            </label>
            <div class="checklist-content">
              <div class="checklist-label">${this.esc(item.label)}</div>
              ${item.description ? `<div class="checklist-desc">${this.esc(item.description)}</div>` : ''}
              ${item.completed_by_name ? `<div class="text-xs text-muted" style="margin-top:4px">\u2713 ${this.esc(item.completed_by_name)} \u00B7 ${new Date(item.completed_at).toLocaleString('de-DE')}</div>` : ''}
            </div>
          </div>
          `).join('')}
        </div>
        ${progress === 100 ? '<div class="text-center text-sm" style="padding:12px;color:var(--color-success)">\u2713 Alle Aufgaben abgeschlossen</div>' : ''}
      `,
      footer: '<button class="btn btn-ghost" data-action="close">Schlie\u00DFen</button>'
    });

    overlay.querySelector('[data-action="close"]').addEventListener('click', () => Modal.close(overlay));

    // Wire checkbox handlers
    overlay.querySelectorAll('[data-check-id]').forEach(cb => {
      cb.addEventListener('change', async () => {
        const checkId = cb.dataset.checkId;
        const reqId = cb.dataset.requestId;
        const res = await API.put(`/plugins/onboarding-offboarding/checklist/${checkId}`, {}).catch(() => API.put(`/onboarding/checklist/${checkId}`, {}));
        if (res.success) {
          if (res.data.all_done) Toast.success('Alle Aufgaben erledigt!');
          // Refresh popup
          Modal.close(overlay);
          this.openOnboardingPopup(parseInt(reqId));
          // Refresh sidebar panel
          const ticketId = Router.currentRoute?.match(/\/tickets\/(\d+)/)?.[1];
          if (ticketId) this.loadOnboardingPanel(ticketId);
        } else {
          Toast.error(res.error);
          cb.checked = !cb.checked;
        }
      });
    });
  },

  // ---- Template Picker ----
  _templateDropdownOpen: false,

  async toggleTemplatePicker(ticketId, category, ticketTitle, requesterName) {
    const dropdown = document.getElementById('templateDropdown');
    if (!dropdown) return;

    if (this._templateDropdownOpen) {
      dropdown.style.display = 'none';
      this._templateDropdownOpen = false;
      return;
    }

    // Fetch suggested templates
    const res = await API.get('/templates/suggest' + API.qs({ category, title: ticketTitle }));
    const templates = res.success ? res.data : [];

    if (templates.length === 0) {
      Toast.info('Keine Vorlagen vorhanden');
      return;
    }

    // Split into suggested (score > 0) and all
    const suggested = templates.filter(t => t._score > 0).slice(0, 3);
    const suggestedIds = new Set(suggested.map(t => t.id));
    const others = templates.filter(t => !suggestedIds.has(t.id));

    dropdown.innerHTML = `
      <div class="template-dropdown">
        <div class="template-dropdown-header">
          <input type="text" placeholder="Vorlage suchen..." id="tplPickerSearch" oninput="TicketPages.filterTemplatePicker()">
        </div>
        <div class="template-dropdown-list" id="tplPickerList">
          ${suggested.length > 0 ? `
            <div class="template-dropdown-section">Vorgeschlagen f\u00FCr dieses Ticket</div>
            ${suggested.map(t => this.renderTemplateItem(t, requesterName, true)).join('')}
          ` : ''}
          ${others.length > 0 ? `
            <div class="template-dropdown-section">${suggested.length > 0 ? 'Weitere Vorlagen' : 'Alle Vorlagen'}</div>
            ${others.map(t => this.renderTemplateItem(t, requesterName, false)).join('')}
          ` : ''}
        </div>
      </div>
    `;

    dropdown.style.display = 'block';
    this._templateDropdownOpen = true;
    this._templateRequesterName = requesterName;
    this._allTemplateItems = templates;

    // Focus search
    setTimeout(() => document.getElementById('tplPickerSearch')?.focus(), 50);

    // Close on outside click
    const closeHandler = (e) => {
      if (!e.target.closest('.template-picker')) {
        dropdown.style.display = 'none';
        this._templateDropdownOpen = false;
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  },

  renderTemplateItem(t, requesterName, isSuggested) {
    const preview = t.content.replace(/\{\{name\}\}/g, requesterName || '').substring(0, 80);
    return `
      <div class="template-dropdown-item" onclick="TicketPages.applyTemplate(${t.id}, '${this.esc(requesterName).replace(/'/g, "\\'")}')">
        <div class="template-dropdown-item-title">
          ${this.esc(t.title)}
          ${isSuggested ? '<span class="template-suggested-badge">Vorgeschlagen</span>' : ''}
          ${t.category ? `<span class="badge badge-closed" style="font-size:9px">${this.esc(t.category)}</span>` : ''}
        </div>
        <div class="template-dropdown-item-preview">${this.esc(preview)}</div>
      </div>
    `;
  },

  filterTemplatePicker() {
    const search = (document.getElementById('tplPickerSearch')?.value || '').toLowerCase();
    const list = document.getElementById('tplPickerList');
    if (!list || !this._allTemplateItems) return;

    const filtered = search
      ? this._allTemplateItems.filter(t =>
          t.title.toLowerCase().includes(search) ||
          t.content.toLowerCase().includes(search) ||
          (t.tags || '').toLowerCase().includes(search)
        )
      : this._allTemplateItems;

    list.innerHTML = filtered.length === 0
      ? '<div class="text-center text-muted text-sm" style="padding:16px">Keine Treffer</div>'
      : filtered.map(t => this.renderTemplateItem(t, this._templateRequesterName, false)).join('');
  },

  async applyTemplate(templateId, requesterName) {
    const res = await API.get(`/templates/${templateId}`);
    if (!res.success) { Toast.error('Vorlage konnte nicht geladen werden'); return; }

    // Replace variables
    let content = res.data.content;
    content = content.replace(/\{\{name\}\}/g, requesterName || '');

    // Insert into textarea
    const textarea = document.getElementById('commentTextarea');
    if (textarea) {
      textarea.value = content;
      textarea.focus();
      // Auto-resize
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(120, textarea.scrollHeight) + 'px';
    }

    // Close dropdown
    const dropdown = document.getElementById('templateDropdown');
    if (dropdown) dropdown.style.display = 'none';
    this._templateDropdownOpen = false;

    Toast.info(`Vorlage "${res.data.title}" eingef\u00FCgt`);
  },

  async submitComment(e, ticketId) {
    e.preventDefault();
    const btn = document.getElementById('commentSubmitBtn');
    btn.disabled = true;

    const form = e.target;
    const data = {
      content: form.content.value,
      is_internal: form.is_internal?.checked ? true : false
    };

    const result = await API.post(`/tickets/${ticketId}/comments`, data);
    if (result.success) {
      Toast.success('Kommentar hinzugefügt');
      form.reset();
      // Refresh page
      Router.navigate(`/tickets/${ticketId}`, false);
    } else {
      Toast.error(result.error);
    }
    btn.disabled = false;
  },

  // ---- Utility ----
  esc(str) {
    if (!str) return '';
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  },

  renderDescription(text) {
    if (!text) return '<span class="text-muted">Keine Beschreibung</span>';
    // Simple text to HTML (preserve line breaks, escape HTML)
    return this.esc(text).replace(/\n/g, '<br>');
  }
};
