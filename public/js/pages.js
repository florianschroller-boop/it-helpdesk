// ============================================
// Page Handlers
// ============================================

const Pages = {

  // ---- Dashboard ----
  async dashboard(container) {
    const isAgent = App.user.role === 'admin' || App.user.role === 'agent';

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">Willkommen zur\u00FCck, ${App.user.name}</p>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon blue">\u2637</div>
          <div>
            <div class="stat-value" id="stat-open">--</div>
            <div class="stat-label">Offene Tickets</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow">\u231B</div>
          <div>
            <div class="stat-value" id="stat-pending">--</div>
            <div class="stat-label">In Bearbeitung</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">\u2713</div>
          <div>
            <div class="stat-value" id="stat-resolved">--</div>
            <div class="stat-label">Gel\u00F6st (heute)</div>
          </div>
        </div>
        ${isAgent ? `
        <div class="stat-card">
          <div class="stat-icon red">\u263A</div>
          <div>
            <div class="stat-value" id="stat-users">--</div>
            <div class="stat-label">Benutzer</div>
          </div>
        </div>
        ` : `
        <div class="stat-card">
          <div class="stat-icon red">\u2B22</div>
          <div>
            <div class="stat-value" id="stat-assets">--</div>
            <div class="stat-label">Meine Ger\u00E4te</div>
          </div>
        </div>
        `}
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${isAgent ? 'Aktuelle Tickets' : 'Meine letzten Tickets'}</h3>
          <a href="#/tickets" class="btn btn-ghost btn-sm" onclick="Router.navigate('/tickets');return false">Alle anzeigen →</a>
        </div>
        <div class="card-body" style="padding:0">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Titel</th>
                <th>Status</th>
                <th>Priorit\u00E4t</th>
                <th>Erstellt</th>
              </tr>
            </thead>
            <tbody id="dashboardTickets">
              <tr><td colspan="5" class="text-center" style="padding:24px">Laden...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Load stats
    const statsRes = await API.get('/tickets/stats');
    if (statsRes.success) {
      const s = statsRes.data;
      const el = (id) => document.getElementById(id);
      if (el('stat-open')) el('stat-open').textContent = s.open;
      if (el('stat-pending')) el('stat-pending').textContent = s.in_progress;
      if (el('stat-resolved')) el('stat-resolved').textContent = s.resolved_today;
      if (el('stat-users')) el('stat-users').textContent = s.my_assigned;
    }

    // Load recent tickets
    const ticketsRes = await API.get('/tickets?limit=8&sort=created_at&order=DESC');
    const tbody = document.getElementById('dashboardTickets');
    if (!ticketsRes.success && tbody) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">${ticketsRes.error || 'Fehler beim Laden'}</td></tr>`;
    } else if (tbody && ticketsRes.success) {
      if (ticketsRes.data.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Keine Tickets vorhanden</td></tr>';
      } else {
        const statusLabels = { open: 'Offen', pending: 'Wartend', in_progress: 'In Bearbeitung', resolved: 'Gel\u00F6st', closed: 'Geschlossen' };
        const priorityLabels = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch' };
        tbody.innerHTML = ticketsRes.data.map(t => `
          <tr class="clickable" onclick="Router.navigate('/tickets/${t.id}')">
            <td><span class="fw-600" style="color:var(--color-primary)">${this.esc(t.ticket_number)}</span></td>
            <td class="truncate" style="max-width:300px">${this.esc(t.title)}</td>
            <td><span class="badge badge-${t.status}">${statusLabels[t.status] || t.status}</span></td>
            <td><span class="badge badge-${t.priority}">${priorityLabels[t.priority] || t.priority}</span></td>
            <td class="text-sm text-muted">${new Date(t.created_at).toLocaleDateString('de-DE')}</td>
          </tr>
        `).join('');
      }
    }
  },

  // ---- User Management ----
  async users(container) {
    if (App.user.role !== 'admin') {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Keine Berechtigung</div></div>';
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Benutzerverwaltung</h1>
          <p class="page-subtitle">Benutzer anlegen, bearbeiten und verwalten</p>
        </div>
        <button class="btn btn-primary" onclick="Pages.openUserModal()">+ Neuer Benutzer</button>
      </div>
      <div class="filter-bar">
        <input type="text" class="form-control" placeholder="Suchen..." style="max-width:250px" id="userSearch" oninput="Pages.debounceUserSearch()">
        <button class="filter-chip active" data-role="" onclick="Pages.filterUsers(this)">Alle</button>
        <button class="filter-chip" data-role="admin" onclick="Pages.filterUsers(this)">Admins</button>
        <button class="filter-chip" data-role="agent" onclick="Pages.filterUsers(this)">Agents</button>
        <button class="filter-chip" data-role="user" onclick="Pages.filterUsers(this)">User</button>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Rolle</th>
              <th>Abteilung</th>
              <th>Status</th>
              <th style="width:100px">Aktionen</th>
            </tr>
          </thead>
          <tbody id="usersTableBody">
            <tr><td colspan="6" class="text-center" style="padding:40px">Laden...</td></tr>
          </tbody>
        </table>
        <div id="usersPagination"></div>
      </div>
    `;

    this._userFilter = { role: '', search: '', page: 1 };
    this.loadUsers();
  },

  _userSearchTimer: null,
  _userFilter: { role: '', search: '', page: 1 },

  debounceUserSearch() {
    clearTimeout(this._userSearchTimer);
    this._userSearchTimer = setTimeout(() => {
      this._userFilter.search = document.getElementById('userSearch').value;
      this._userFilter.page = 1;
      this.loadUsers();
    }, 300);
  },

  filterUsers(chip) {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    this._userFilter.role = chip.dataset.role;
    this._userFilter.page = 1;
    this.loadUsers();
  },

  async loadUsers() {
    const params = API.qs({
      role: this._userFilter.role,
      search: this._userFilter.search,
      page: this._userFilter.page,
      limit: 20
    });

    const result = await API.get('/users' + params);
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!result.success) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${result.error || 'Fehler beim Laden'}</td></tr>`;
      return;
    }
    if (result.data.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Keine Benutzer gefunden</td></tr>`;
      return;
    }

    tbody.innerHTML = result.data.map(u => `
      <tr>
        <td>
          <div class="flex items-center gap-2">
            <div class="user-avatar" style="width:28px;height:28px;font-size:11px">${u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>
            <span class="fw-600">${this.esc(u.name)}</span>
          </div>
        </td>
        <td>${this.esc(u.email)}</td>
        <td><span class="badge badge-${u.role}">${u.role}</span></td>
        <td>${u.department || '\u2014'}</td>
        <td><span class="badge ${u.active ? 'badge-active' : 'badge-inactive'}">${u.active ? 'Aktiv' : 'Inaktiv'}</span></td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="Pages.openUserModal(${u.id})" title="Bearbeiten">\u270E</button>
          <button class="btn btn-ghost btn-sm" onclick="Pages.deleteUser(${u.id}, '${this.esc(u.name)}')" title="Deaktivieren">\u2717</button>
        </td>
      </tr>
    `).join('');

    renderPagination(
      document.getElementById('usersPagination'),
      result.pagination,
      (page) => { this._userFilter.page = page; this.loadUsers(); }
    );
  },

  async openUserModal(userId = null) {
    let user = null;
    if (userId) {
      const result = await API.get(`/users/${userId}`);
      if (!result.success) { Toast.error(result.error); return; }
      user = result.data;
    }

    const isEdit = !!user;
    const title = isEdit ? 'Benutzer bearbeiten' : 'Neuer Benutzer';

    // Load departments from settings
    const settingsRes = await API.get('/settings');
    const departments = settingsRes.success && Array.isArray(settingsRes.data.departments) ? settingsRes.data.departments : [];

    const formHtml = `
      <form id="userForm">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Name *</label>
            <input type="text" class="form-control" name="name" value="${user?.name || ''}" required>
          </div>
          <div class="form-group">
            <label class="form-label">E-Mail *</label>
            <input type="email" class="form-control" name="email" value="${user?.email || ''}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${isEdit ? 'Neues Passwort (leer = unver\u00E4ndert)' : 'Passwort *'}</label>
            <input type="password" class="form-control" name="password" ${isEdit ? '' : 'required'} minlength="8" placeholder="Min. 8 Zeichen">
          </div>
          <div class="form-group">
            <label class="form-label">Rolle</label>
            <select class="form-control" name="role">
              <option value="user" ${user?.role === 'user' ? 'selected' : ''}>User</option>
              <option value="agent" ${user?.role === 'agent' ? 'selected' : ''}>Agent</option>
              <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Abteilung</label>
            <select class="form-control" name="department">
              <option value="">— Keine —</option>
              ${departments.map(d => `<option value="${d}" ${user?.department === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Standort</label>
            <input type="text" class="form-control" name="location" value="${user?.location || ''}" placeholder="z.B. B\u00FCro 1, Serverraum">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label flex items-center gap-2" style="cursor:pointer">
              <input type="checkbox" name="is_manager" value="1" ${user?.is_manager ? 'checked' : ''}>
              F\u00FChrungskraft (kann Onboarding-Antr\u00E4ge stellen)
            </label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Telefon</label>
            <input type="text" class="form-control" name="phone" value="${user?.phone || ''}">
          </div>
          <div class="form-group"></div>
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-control" name="active">
            <option value="1" ${user?.active ? 'selected' : ''}>Aktiv</option>
            <option value="0" ${!user?.active ? 'selected' : ''}>Inaktiv</option>
          </select>
        </div>
        ` : ''}
      </form>
    `;

    const overlay = Modal.open({
      title,
      content: formHtml,
      footer: `
        <button class="btn btn-secondary" data-action="cancel">Abbrechen</button>
        <button class="btn btn-primary" data-action="save">${isEdit ? 'Speichern' : 'Erstellen'}</button>
      `
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => Modal.close(overlay));
    overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const form = document.getElementById('userForm');
      const data = Object.fromEntries(new FormData(form));

      // Remove empty password for edit
      if (isEdit && !data.password) delete data.password;
      if (data.active !== undefined) data.active = data.active === '1';
      data.is_manager = data.is_manager === '1';

      const btn = overlay.querySelector('[data-action="save"]');
      btn.disabled = true;

      let result;
      if (isEdit) {
        result = await API.put(`/users/${userId}`, data);
      } else {
        result = await API.post('/users', data);
      }

      if (result.success) {
        Modal.close(overlay);
        Toast.success(isEdit ? 'Benutzer aktualisiert' : 'Benutzer erstellt');
        this.loadUsers();
      } else {
        Toast.error(result.error);
        btn.disabled = false;
      }
    });
  },

  async deleteUser(id, name) {
    Modal.confirm(`M\u00F6chten Sie "${name}" wirklich deaktivieren?`, async () => {
      const result = await API.delete(`/users/${id}`);
      if (result.success) {
        Toast.success('Benutzer deaktiviert');
        this.loadUsers();
      } else {
        Toast.error(result.error);
      }
    });
  },

  // ---- Profile ----
  async profile(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Mein Profil</h1>
        </div>
      </div>
      <div class="card" style="max-width:600px">
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Name</label>
            <div class="fw-600">${App.user.name}</div>
          </div>
          <div class="form-group">
            <label class="form-label">E-Mail</label>
            <div>${App.user.email}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Rolle</label>
            <span class="badge badge-${App.user.role}">${App.user.role}</span>
          </div>
          <div class="form-group">
            <label class="form-label">Abteilung</label>
            <div>${App.user.department || '\u2014'}</div>
          </div>
          <hr style="border:0;border-top:1px solid var(--color-border);margin:20px 0">
          <h3 style="margin-bottom:16px">Passwort \u00E4ndern</h3>
          <form id="passwordForm">
            <div class="form-group">
              <label class="form-label">Aktuelles Passwort</label>
              <input type="password" class="form-control" name="current_password" required>
            </div>
            <div class="form-group">
              <label class="form-label">Neues Passwort</label>
              <input type="password" class="form-control" name="new_password" required minlength="8">
            </div>
            <button type="submit" class="btn btn-primary">Passwort \u00E4ndern</button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('passwordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const result = await API.post('/auth/change-password', data);
      if (result.success) {
        Toast.success('Passwort ge\u00E4ndert');
        e.target.reset();
      } else {
        Toast.error(result.error);
      }
    });
  },

  // ---- Placeholder for future phases ----
  placeholder(title, message) {
    return (container) => {
      container.innerHTML = `
        <div class="page-header">
          <div><h1 class="page-title">${title}</h1></div>
        </div>
        <div class="card">
          <div class="card-body">
            <div class="empty-state">
              <div class="empty-state-icon">\u{1F6A7}</div>
              <div class="empty-state-title">${title}</div>
              <p class="text-muted">${message}</p>
            </div>
          </div>
        </div>
      `;
    };
  },

  // Utility: escape HTML
  esc(str) {
    if (!str) return '';
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }
};
