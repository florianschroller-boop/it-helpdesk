// ============================================
// API Client — Fetch wrapper with auth
// ============================================

const API = {
  baseUrl: '/api',
  _suppressErrors: false,

  async request(method, path, data = null, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const config = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options
    };

    if (data && method !== 'GET') {
      config.body = JSON.stringify(data);
    }

    // For file uploads
    if (options.formData) {
      delete config.headers['Content-Type'];
      config.body = options.formData;
    }

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        // Token expired or invalid — redirect to login
        if (!path.includes('/auth/login')) {
          App.logout();
          return { success: false, error: 'Sitzung abgelaufen' };
        }
      }

      const json = await response.json();
      return json;
    } catch (err) {
      if (!this._suppressErrors) {
        console.error('API Error:', err);
      }
      return { success: false, error: 'Verbindungsfehler', _networkError: true };
    }
  },

  get(path) { return this.request('GET', path); },
  post(path, data) { return this.request('POST', path, data); },
  put(path, data) { return this.request('PUT', path, data); },
  delete(path) { return this.request('DELETE', path); },
  upload(path, formData) { return this.request('POST', path, null, { formData }); },

  // Build query string from object
  qs(params) {
    const filtered = Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    if (filtered.length === 0) return '';
    return '?' + filtered.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  }
};
