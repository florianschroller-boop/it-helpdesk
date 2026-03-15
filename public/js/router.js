// ============================================
// Simple SPA Router
// ============================================

const Router = {
  routes: {},
  currentRoute: null,

  register(path, handler) {
    this.routes[path] = handler;
  },

  async navigate(path, pushState = true) {
    // Remove active class from nav items
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Set active class on matching nav item
    const navItem = document.querySelector(`.nav-item[data-route="${path}"]`);
    if (navItem) navItem.classList.add('active');

    // Find matching route
    let handler = this.routes[path];
    let params = {};

    if (!handler) {
      // Try pattern matching (e.g., /users/:id)
      for (const [pattern, h] of Object.entries(this.routes)) {
        const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
        const match = path.match(regex);
        if (match) {
          handler = h;
          params = match.groups || {};
          break;
        }
      }
    }

    if (!handler) {
      handler = this.routes['/dashboard'] || (() => {
        document.getElementById('content').innerHTML = '<div class="empty-state"><div class="empty-state-title">Seite nicht gefunden</div></div>';
      });
    }

    this.currentRoute = path;

    if (pushState) {
      history.pushState({ path }, '', '#' + path);
    }

    // Update breadcrumb
    this.updateBreadcrumb(path);

    // Execute handler
    const contentEl = document.getElementById('content');
    if (contentEl) {
      await handler(contentEl, params);
    }

    // Close mobile sidebar
    document.querySelector('.sidebar')?.classList.remove('mobile-open');
  },

  updateBreadcrumb(path) {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    const parts = path.split('/').filter(Boolean);
    const labels = {
      'dashboard': 'Dashboard',
      'tickets': 'Tickets',
      'orders': 'Bestellungen',
      'kb': 'Knowledge Base',
      'users': 'Benutzer',
      'settings': 'Einstellungen',
      'self-service': 'Self-Service',
      'new': 'Neu'
    };

    let html = '<a href="#/dashboard" onclick="Router.navigate(\'/dashboard\'); return false;">IT-Helpdesk</a>';
    for (const part of parts) {
      html += ` <span>/</span> <span>${labels[part] || part}</span>`;
    }
    breadcrumb.innerHTML = html;
  },

  init() {
    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      const path = e.state?.path || location.hash.slice(1) || '/dashboard';
      this.navigate(path, false);
    });

    // Navigate to current hash or default
    const initialPath = location.hash.slice(1) || '/dashboard';
    this.navigate(initialPath, false);
  }
};
