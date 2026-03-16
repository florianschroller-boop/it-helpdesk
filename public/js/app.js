// ============================================
// IT Helpdesk — Main Application
// ============================================

const App = {
  user: null,
  branding: {},

  async init() {
    // Apply saved theme
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);

    // Check if first-run setup is needed
    const setupRes = await API.get('/setup/status');
    if (setupRes.success && (setupRes.data?.needs_setup || !setupRes.data?.setup_completed)) {
      window.location.href = '/setup.html';
      return;
    }

    // Load branding (public, no auth)
    const brandRes = await API.get('/auth/branding');
    if (brandRes.success) {
      this.branding = brandRes.data;
      this.applyBranding();
    }

    // Check if user is authenticated
    const result = await API.get('/auth/me');
    if (result.success) {
      this.user = result.data;
      this.renderApp();
      await this.registerRoutes();
      Router.init();
    } else {
      this.renderLogin();
    }
  },

  applyBranding() {
    const b = this.branding;
    // Page title
    document.title = b.company_name || 'IT-Helpdesk';
    // Primary color
    if (b.primary_color && b.primary_color !== '#4F46E5') {
      document.documentElement.style.setProperty('--color-primary', b.primary_color);
      // Derive hover and light variants
      document.documentElement.style.setProperty('--color-primary-hover', b.primary_color);
    }
    // Favicon
    if (b.favicon_url) {
      let link = document.querySelector("link[rel~='icon']");
      if (link) link.href = b.favicon_url;
    }
  },

  // Helper: Du/Sie text
  t(duText, sieText) {
    return this.branding.formality === 'du' ? duText : sieText;
  },

  companyName() {
    return this.branding.company_name || 'IT-Helpdesk';
  },

  companyInitial() {
    return (this.branding.company_name || 'H')[0].toUpperCase();
  },

  _loginView: 'login', // 'login' or 'register'

  async renderLogin() {
    const b = this.branding;
    const msStatus = await API.get('/auth/microsoft/status');
    const msEnabled = msStatus.success && msStatus.data?.enabled;
    const regEnabled = b.registration_enabled === 'true';

    const hashParams = new URLSearchParams(location.hash.replace('#/login?', ''));
    const oauthError = hashParams.get('error');
    const oauthErrors = { oauth_denied: 'Anmeldung abgebrochen', oauth_failed: 'Microsoft-Anmeldung fehlgeschlagen', oauth_no_email: 'Keine E-Mail im Microsoft-Konto', oauth_state: 'Sicherheitspr\u00FCfung fehlgeschlagen', oauth_invalid: 'Ung\u00FCltige Antwort' };

    const companyName = b.company_name || 'IT-Helpdesk';
    const logoHtml = b.logo_login_url
      ? `<img src="${b.logo_login_url}" alt="${companyName}" style="max-height:64px;margin:0 auto 16px;display:block">`
      : `<div class="sidebar-logo" style="width:48px;height:48px;font-size:24px;margin:0 auto 16px;border-radius:12px">${this.companyInitial()}</div>`;

    const sie = b.formality !== 'du';
    const departments = b.departments || [];
    const locations = b.locations || [];

    document.getElementById('app').innerHTML = `
      <div class="login-page">
        <div class="login-card" style="max-width:${this._loginView === 'register' ? '480px' : '400px'}">
          <div style="text-align:center;margin-bottom:8px">${logoHtml}</div>
          <h1>${companyName}</h1>
          <p>${this._loginView === 'register'
            ? (sie ? 'Erstellen Sie Ihren Account' : 'Erstelle deinen Account')
            : (sie ? 'Melden Sie sich an, um fortzufahren' : 'Melde dich an, um fortzufahren')}</p>

          ${this._loginView === 'login' ? `
            ${msEnabled ? `
            <a href="/api/auth/microsoft" class="ms-login-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
              <span>Mit Microsoft anmelden</span>
            </a>
            <div class="login-divider"><span>oder</span></div>
            ` : ''}
            <form id="loginForm">
              <div class="form-group">
                <label class="form-label">E-Mail</label>
                <input type="email" class="form-control" id="loginEmail" placeholder="name@firma.de" required autofocus>
              </div>
              <div class="form-group">
                <label class="form-label">Passwort</label>
                <input type="password" class="form-control" id="loginPassword" placeholder="Passwort" required>
              </div>
              <div id="loginError" class="form-error" style="margin-bottom:12px">${oauthError ? oauthErrors[oauthError] || 'Fehler' : ''}</div>
              <button type="submit" class="btn btn-primary btn-block btn-lg" id="loginBtn">Anmelden</button>
            </form>
            ${regEnabled ? `<div class="text-center mt-4 text-sm">Noch kein Account? <a href="#" onclick="App._loginView='register';App.renderLogin();return false" class="fw-600">Registrieren</a></div>` : ''}
          ` : `
            <form id="registerForm">
              <div class="form-row">
                <div class="form-group"><label class="form-label">Vorname *</label><input type="text" class="form-control" name="first_name" required></div>
                <div class="form-group"><label class="form-label">Nachname *</label><input type="text" class="form-control" name="last_name" required></div>
              </div>
              <div class="form-group"><label class="form-label">E-Mail *</label><input type="email" class="form-control" name="email" required placeholder="vorname.nachname@firma.de"></div>
              <div class="form-group"><label class="form-label">Passwort * <span class="text-muted text-xs">(min. 8 Zeichen)</span></label><input type="password" class="form-control" name="password" required minlength="8"></div>
              <div class="form-row">
                <div class="form-group"><label class="form-label">Abteilung</label>
                  <select class="form-control" name="department">
                    <option value="">— ${sie ? 'Bitte w\u00E4hlen' : 'Bitte w\u00E4hlen'} —</option>
                    ${departments.map(d => `<option value="${d}">${d}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group"><label class="form-label">Standort</label>
                  ${locations.length > 0 ? `
                  <select class="form-control" name="location">
                    <option value="">— ${sie ? 'Bitte w\u00E4hlen' : 'Bitte w\u00E4hlen'} —</option>
                    ${locations.map(l => `<option value="${l}">${l}</option>`).join('')}
                  </select>` : '<input type="text" class="form-control" name="location" placeholder="z.B. B\u00FCro 1">'}
                </div>
              </div>
              <div class="form-group"><label class="form-label">Einladungsschl\u00FCssel *</label><input type="text" class="form-control" name="invite_key" required placeholder="Von ${sie ? 'Ihrem' : 'deinem'} IT-Team erhalten" style="text-transform:uppercase"></div>
              <div id="registerError" class="form-error" style="margin-bottom:12px"></div>
              <button type="submit" class="btn btn-primary btn-block btn-lg" id="registerBtn">Registrieren</button>
            </form>
            <div class="text-center mt-4 text-sm">Bereits registriert? <a href="#" onclick="App._loginView='login';App.renderLogin();return false" class="fw-600">Anmelden</a></div>
          `}
        </div>
      </div>
    `;

    if (this._loginView === 'login') {
      document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('loginBtn');
        btn.disabled = true; btn.textContent = 'Anmeldung...';
        const result = await API.post('/auth/login', { email: document.getElementById('loginEmail').value, password: document.getElementById('loginPassword').value });
        if (result.success) { this.user = result.data.user; this.renderApp(); await this.registerRoutes(); Router.init(); }
        else { document.getElementById('loginError').textContent = result.error; btn.disabled = false; btn.textContent = 'Anmelden'; }
      });
    } else {
      document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('registerBtn');
        btn.disabled = true; btn.textContent = 'Registrierung...';
        const data = Object.fromEntries(new FormData(e.target));
        const result = await API.post('/auth/register', data);
        if (result.success) { this.user = result.data.user; this.renderApp(); await this.registerRoutes(); Router.init(); }
        else { document.getElementById('registerError').textContent = result.error; btn.disabled = false; btn.textContent = 'Registrieren'; }
      });
    }
  },

  renderApp() {
    const userRoles = (this.user.role || 'user').split(',').map(r => r.trim());
    const isAdmin = userRoles.includes('admin');
    const isAgent = userRoles.includes('agent') || isAdmin;
    const isDisposition = userRoles.includes('disposition') || isAdmin;
    const isAssistenz = userRoles.includes('assistenz');

    // Expose for frontend use
    this.user.roles = userRoles;
    this.user.isAdmin = isAdmin;
    this.user.isAgent = isAgent;
    this.user.isDisposition = isDisposition;
    this.user.isAssistenz = isAssistenz;
    const initials = this.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const theme = document.documentElement.getAttribute('data-theme');

    document.getElementById('app').innerHTML = `
      <div class="app-container">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">
            ${this.branding.logo_url
              ? `<img src="${this.branding.logo_url}" alt="" style="height:28px;flex-shrink:0">`
              : `<div class="sidebar-logo">${this.companyInitial()}</div>`}
            <span class="sidebar-title">${this.companyName()}</span>
          </div>
          <nav class="sidebar-nav">

            <div class="nav-section">
              <div class="nav-section-title">\u00DCbersicht</div>
              <div class="nav-item" data-route="/dashboard" onclick="Router.navigate('/dashboard')">
                <span class="nav-icon">\u2302</span>
                <span class="nav-label">Dashboard</span>
              </div>
            </div>

            ${isAgent ? `
            <div class="nav-section">
              <div class="nav-section-title">Tickets</div>
              <div class="nav-item" data-route="/tickets" onclick="Router.navigate('/tickets')">
                <span class="nav-icon">\u2637</span>
                <span class="nav-label">Alle Tickets</span>
              </div>
              <div class="nav-item" data-route="/tickets/my" onclick="Router.navigate('/tickets/my')">
                <span class="nav-icon">\u2709</span>
                <span class="nav-label">Mein Posteingang</span>
              </div>
              <div class="nav-item" data-route="/tickets/new" onclick="Router.navigate('/tickets/new')">
                <span class="nav-icon">\u271A</span>
                <span class="nav-label">Neues Ticket</span>
              </div>
            </div>
            ` : `
            <div class="nav-section">
              <div class="nav-section-title">Support</div>
              <div class="nav-item" data-route="/self-service" onclick="Router.navigate('/self-service')">
                <span class="nav-icon">\u2302</span>
                <span class="nav-label">Self-Service</span>
              </div>
              <div class="nav-item" data-route="/tickets/my" onclick="Router.navigate('/tickets/my')">
                <span class="nav-icon">\u2637</span>
                <span class="nav-label">Meine Tickets</span>
              </div>
              <div class="nav-item" data-route="/tickets/new" onclick="Router.navigate('/tickets/new')">
                <span class="nav-icon">\u271A</span>
                <span class="nav-label">Neues Ticket</span>
              </div>
            </div>
            `}

            ${isAgent ? `
            <div class="nav-section">
              <div class="nav-section-title">Verwaltung</div>
              <div class="nav-item" data-route="/orders" onclick="Router.navigate('/orders')">
                <span class="nav-icon">\u2696</span>
                <span class="nav-label">Bestellungen</span>
              </div>
              <div class="nav-item" data-route="/locations" onclick="Router.navigate('/locations')">
                <span class="nav-icon">\u2302</span>
                <span class="nav-label">Standorte</span>
              </div>
              <div class="nav-item" data-route="/templates" onclick="Router.navigate('/templates')">
                <span class="nav-icon">\u2630</span>
                <span class="nav-label">Antwortvorlagen</span>
              </div>
              <div class="nav-item" data-route="/kb" onclick="Router.navigate('/kb')">
                <span class="nav-icon">\u2630</span>
                <span class="nav-label">Knowledge Base</span>
              </div>
            </div>
            ` : `
            <div class="nav-section">
              <div class="nav-section-title">Infos</div>
              <div class="nav-item" data-route="/orders" onclick="Router.navigate('/orders')">
                <span class="nav-icon">\u2696</span>
                <span class="nav-label">Bestellstatus</span>
              </div>
              <div class="nav-item" data-route="/kb" onclick="Router.navigate('/kb')">
                <span class="nav-icon">\u2630</span>
                <span class="nav-label">Knowledge Base</span>
              </div>
            </div>
            `}

            ${isAdmin ? `
            <div class="nav-section">
              <div class="nav-section-title">Administration</div>
              <div class="nav-item" data-route="/users" onclick="Router.navigate('/users')">
                <span class="nav-icon">\u263A</span>
                <span class="nav-label">Benutzer</span>
              </div>
              <div class="nav-item" data-route="/settings" onclick="Router.navigate('/settings')">
                <span class="nav-icon">\u2699</span>
                <span class="nav-label">Einstellungen</span>
              </div>
              <div class="nav-item" data-route="/invites" onclick="Router.navigate('/invites')">
                <span class="nav-icon">\u{1F511}</span>
                <span class="nav-label">Einladungsschl\u00FCssel</span>
              </div>
              <div class="nav-item" data-route="/whitelabel" onclick="Router.navigate('/whitelabel')">
                <span class="nav-icon">\u{1F3A8}</span>
                <span class="nav-label">White-Label</span>
              </div>
              <div class="nav-item" data-route="/plugins" onclick="Router.navigate('/plugins')">
                <span class="nav-icon">\u{1F9E9}</span>
                <span class="nav-label">Plugins</span>
              </div>
              <div class="nav-item" onclick="App.restartServer()" style="cursor:pointer">
                <span class="nav-icon">\u21BB</span>
                <span class="nav-label">Server neustarten</span>
              </div>
            </div>
            ` : ''}

          </nav>
          <div class="sidebar-footer">
            <button class="sidebar-toggle" onclick="App.toggleSidebar()" title="Sidebar ein-/ausblenden">
              \u276E
            </button>
          </div>
        </aside>

        <div class="sidebar-overlay" onclick="document.getElementById('sidebar').classList.remove('mobile-open')"></div>

        <main class="main-content">
          <header class="topbar">
            <button class="topbar-btn" onclick="document.getElementById('sidebar').classList.toggle('mobile-open')" style="display:none" id="mobileMenuBtn">
              \u2630
            </button>
            <div class="topbar-breadcrumb" id="breadcrumb"></div>
            <div class="topbar-search">
              <span class="search-icon">\u2315</span>
              <input type="text" placeholder="Suchen... (Strg+K)" id="globalSearch">
            </div>
            <div class="topbar-actions">
              <button class="topbar-btn" onclick="App.toggleTheme()" title="Design umschalten">
                ${theme === 'dark' ? '\u263C' : '\u263E'}
              </button>
              <div class="dropdown">
                <div class="user-menu" onclick="App.toggleUserMenu()">
                  <div class="user-avatar">${initials}</div>
                  <span class="user-name">${this.user.name}</span>
                </div>
                <div class="dropdown-menu" id="userDropdown" style="display:none">
                  <div class="dropdown-item" onclick="Router.navigate('/profile')">Mein Profil</div>
                  <div class="dropdown-divider"></div>
                  <div class="dropdown-item danger" onclick="App.logout()">Abmelden</div>
                </div>
              </div>
            </div>
          </header>
          <div class="content-area" id="content">
          </div>
        </main>
      </div>
    `;

    // Show mobile menu button on small screens
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown')) {
        document.getElementById('userDropdown')?.style && (document.getElementById('userDropdown').style.display = 'none');
      }
    });

    // Global search shortcut
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('globalSearch')?.focus();
      }
    });
  },

  async registerRoutes() {
    Router.register('/dashboard', (c) => Pages.dashboard(c));
    Router.register('/users', (c) => Pages.users(c));
    Router.register('/profile', (c) => Pages.profile(c));
    // Ticket routes
    Router.register('/tickets', (c) => TicketPages.listPage(c));
    Router.register('/tickets/my', (c) => TicketPages.myInbox(c));
    Router.register('/tickets/new', (c) => TicketPages.newTicket(c));
    Router.register('/tickets/:id', (c, p) => TicketPages.detailPage(c, p));
    // Assets, Inventory, Suppliers removed — handled by asset-management plugin
    Router.register('/orders', (c) => OrderPages.listPage(c));
    Router.register('/orders/:id', (c, p) => OrderPages.detailPage(c, p));
    Router.register('/templates', (c) => TemplatePage.listPage(c));
    // Onboarding removed — handled by onboarding-offboarding plugin
    Router.register('/locations', (c) => LocationPages.listPage(c));
    Router.register('/locations/:slug', (c, p) => LocationPages.detailPage(c, p));
    // Network removed from core — handled by network-monitor plugin
    Router.register('/kb', (c) => KBPage.listPage(c));
    Router.register('/kb/:slug', (c, p) => KBPage.articlePage(c, p));
    Router.register('/settings', (c) => SettingsPage.render(c));
    Router.register('/self-service', (c) => SelfServicePage.render(c));
    Router.register('/invites', (c) => InvitePage.render(c));
    Router.register('/whitelabel', (c) => WhiteLabelPage.render(c));
    Router.register('/plugins', (c) => PluginManagerPage.render(c));

    // Load plugin frontend assets and sidebar items
    await this.loadPluginFrontend();
  },

  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    // Re-render app to update icon
    this.renderApp();
    this.registerRoutes();
    Router.navigate(Router.currentRoute || '/dashboard', false);
  },

  toggleUserMenu() {
    const menu = document.getElementById('userDropdown');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  },

  handleResize() {
    const btn = document.getElementById('mobileMenuBtn');
    if (btn) {
      btn.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
    }
  },

  async loadPluginFrontend() {
    try {
      const res = await API.get('/plugins/frontend');
      if (!res.success) return;

      const { sidebarItems, assets } = res.data;

      // Inject plugin sidebar items
      if (sidebarItems.length > 0) {
        const nav = document.querySelector('.sidebar-nav');
        if (nav) {
          const section = document.createElement('div');
          section.className = 'nav-section';
          section.innerHTML = '<div class="nav-section-title">Plugins</div>' +
            sidebarItems.map(item => `
              <div class="nav-item" data-route="${item.route}" onclick="Router.navigate('${item.route}')">
                <span class="nav-icon">${item.icon || '\u{1F9E9}'}</span>
                <span class="nav-label">${item.label}</span>
              </div>
            `).join('');
          nav.appendChild(section);
        }
      }

      // Load plugin CSS immediately
      for (const asset of assets) {
        for (const cssFile of (asset.css || [])) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = `/plugins/${asset.pluginName}/${cssFile}`;
          document.head.appendChild(link);
        }
      }

      // Load plugin JS sequentially (must wait for each to register routes)
      for (const asset of assets) {
        for (const jsFile of (asset.js || [])) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `/plugins/${asset.pluginName}/${jsFile}`;
            script.onload = resolve;
            script.onerror = () => { console.error(`[PLUGIN] Failed to load ${jsFile}`); resolve(); };
            document.body.appendChild(script);
          });
        }
      }
    } catch {}
  },

  async restartServer() {
    Modal.confirm('Server wirklich neustarten? Alle aktiven Verbindungen werden kurz unterbrochen.', async () => {
      // Suppress all API error toasts during restart
      API._suppressErrors = true;

      const loadingToast = Toast.show('Server wird neu gestartet...', 'info', 0);

      await API.post('/settings/restart');

      // Poll until server is back
      const check = setInterval(async () => {
        try {
          const resp = await fetch('/api/auth/me', { credentials: 'include' });
          if (resp.ok) {
            clearInterval(check);
            API._suppressErrors = false;
            Toast.dismiss(loadingToast);
            Toast.success('Server ist wieder online');
            location.reload();
          }
        } catch {}
      }, 1500);

      // Give up after 30s
      setTimeout(() => {
        clearInterval(check);
        API._suppressErrors = false;
        Toast.dismiss(loadingToast);
        Toast.error('Server antwortet nicht. Bitte manuell prüfen.');
      }, 30000);
    });
  },

  async logout() {
    await API.post('/auth/logout');
    this.user = null;
    location.hash = '';
    this.renderLogin();
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
