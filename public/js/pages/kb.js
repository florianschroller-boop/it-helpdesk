// ============================================
// Knowledge Base Pages
// ============================================

const KBPage = {
  async listPage(container) {
    const isAgent = App.user.role !== 'user';
    const [catRes, artRes] = await Promise.all([
      API.get('/kb/categories'),
      API.get('/kb/articles?limit=50')
    ]);

    const categories = catRes.success ? catRes.data : [];
    const articles = artRes.success ? artRes.data : [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Knowledge Base</h1>
          <p class="page-subtitle">Anleitungen und Hilfe-Artikel</p>
        </div>
        ${isAgent ? '<button class="btn btn-primary" onclick="KBPage.openEditor()">+ Neuer Artikel</button>' : ''}
      </div>

      <div class="topbar-search mb-4" style="max-width:400px">
        <span class="search-icon">⌕</span>
        <input type="text" placeholder="Knowledge Base durchsuchen..." id="kbSearch" oninput="KBPage.debounceSearch()">
      </div>

      <div class="kb-layout">
        <div class="kb-sidebar-cats">
          <div class="nav-item ${!this._cat ? 'active' : ''}" onclick="KBPage.filterCat(null, this)">
            <span class="nav-label">Alle Artikel</span>
            <span class="nav-badge">${articles.length}</span>
          </div>
          ${categories.map(c => `
          <div class="nav-item" data-cat="${c.id}" onclick="KBPage.filterCat(${c.id}, this)">
            <span class="nav-label">${this.esc(c.name)}</span>
          </div>`).join('')}
        </div>
        <div class="kb-articles" id="kbArticlesList">
          ${this.renderArticleList(articles, isAgent)}
        </div>
      </div>
    `;

    this._articles = articles;
    this._categories = categories;
    this._cat = null;
  },

  _searchTimer: null,
  _cat: null,
  _articles: [],
  _categories: [],

  debounceSearch() {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(async () => {
      const q = document.getElementById('kbSearch')?.value || '';
      const res = await API.get('/kb/articles' + API.qs({ search: q, category: this._cat, limit: 50 }));
      if (res.success) {
        const container = document.getElementById('kbArticlesList');
        if (container) container.innerHTML = this.renderArticleList(res.data, App.user.role !== 'user');
      }
    }, 300);
  },

  async filterCat(catId, el) {
    document.querySelectorAll('.kb-sidebar-cats .nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    this._cat = catId;
    const res = await API.get('/kb/articles' + API.qs({ category: catId, limit: 50 }));
    if (res.success) {
      const container = document.getElementById('kbArticlesList');
      if (container) container.innerHTML = this.renderArticleList(res.data, App.user.role !== 'user');
    }
  },

  renderArticleList(articles, isAgent) {
    if (articles.length === 0) {
      return '<div class="empty-state"><div class="empty-state-title">Keine Artikel gefunden</div></div>';
    }
    return articles.map(a => `
      <div class="kb-article-card clickable" onclick="Router.navigate('/kb/${a.slug || a.id}')">
        <div class="kb-article-title">${this.esc(a.title)}</div>
        <div class="kb-article-meta">
          <span class="text-muted">${this.esc(a.category_name || '')}</span>
          ${a.tags?.length ? a.tags.map(t => `<span class="badge badge-closed" style="font-size:10px">${this.esc(t)}</span>`).join(' ') : ''}
          <span class="text-muted">· ${a.views || 0} Aufrufe</span>
          ${isAgent && a.status === 'draft' ? '<span class="badge badge-pending">Entwurf</span>' : ''}
        </div>
      </div>
    `).join('');
  },

  // ---- Article Detail ----
  async articlePage(container, params) {
    const res = await API.get(`/kb/articles/${params.slug}`);
    if (!res.success) { container.innerHTML = '<div class="empty-state"><div class="empty-state-title">Artikel nicht gefunden</div></div>'; return; }

    const a = res.data;
    const isAgent = App.user.role !== 'user';

    container.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/kb')">← Knowledge Base</button>
          <h1 class="page-title" style="font-size:1.25rem;margin-top:8px">${this.esc(a.title)}</h1>
          <div class="text-sm text-muted mt-2">
            ${this.esc(a.category_name || '')} · Von ${this.esc(a.author_name || '?')} · ${new Date(a.updated_at).toLocaleDateString('de-DE')} · ${a.views} Aufrufe
          </div>
        </div>
        ${isAgent ? `<button class="btn btn-secondary" onclick="KBPage.openEditor(${a.id})">✎ Bearbeiten</button>` : ''}
      </div>

      <div class="card mb-4">
        <div class="card-body kb-content">
          ${a.content_html || '<p class="text-muted">Kein Inhalt</p>'}
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-body flex items-center justify-between">
          <span class="text-sm">War dieser Artikel hilfreich?</span>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" onclick="KBPage.vote(${a.id}, true)">👍 Ja (${a.helpful_votes})</button>
            <button class="btn btn-secondary btn-sm" onclick="KBPage.vote(${a.id}, false)">👎 Nein (${a.unhelpful_votes})</button>
            <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ Drucken</button>
          </div>
        </div>
      </div>

      ${a.related?.length > 0 ? `
      <div class="card">
        <div class="card-header"><h3 class="card-title">Verwandte Artikel</h3></div>
        <div class="card-body">
          ${a.related.map(r => `<div class="clickable text-sm" style="padding:4px 0" onclick="Router.navigate('/kb/${r.slug || r.id}')"><span style="color:var(--color-primary)">→</span> ${this.esc(r.title)}</div>`).join('')}
        </div>
      </div>
      ` : ''}
    `;
  },

  async vote(articleId, helpful) {
    await API.post(`/kb/articles/${articleId}/vote`, { helpful });
    Toast.success('Danke für Ihr Feedback!');
  },

  async openEditor(articleId = null) {
    let article = null;
    if (articleId) {
      const res = await API.get(`/kb/articles/${articleId}`);
      if (res.success) article = res.data;
    }

    const categories = this._categories.length > 0 ? this._categories : (await API.get('/kb/categories')).data || [];

    const overlay = Modal.open({
      title: article ? 'Artikel bearbeiten' : 'Neuer Artikel',
      size: 'lg',
      content: `
        <form id="kbForm">
          <div class="form-group"><label class="form-label">Titel *</label><input type="text" class="form-control" name="title" value="${this.esc(article?.title || '')}" required></div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Kategorie</label>
              <select class="form-control" name="category_id">
                <option value="">— Keine —</option>
                ${categories.map(c => `<option value="${c.id}" ${article?.category_id == c.id ? 'selected' : ''}>${this.esc(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Status</label>
              <select class="form-control" name="status">
                <option value="draft" ${article?.status === 'draft' ? 'selected' : ''}>Entwurf</option>
                <option value="published" ${article?.status === 'published' ? 'selected' : ''}>Veröffentlicht</option>
              </select>
            </div>
          </div>
          <div class="form-group"><label class="form-label">Tags (kommagetrennt)</label><input type="text" class="form-control" name="tags" value="${article?.tags?.join(', ') || ''}"></div>
          <div class="form-group"><label class="form-label">Inhalt (HTML)</label><textarea class="form-control" name="content_html" rows="12">${article?.content_html || ''}</textarea></div>
        </form>`,
      footer: '<button class="btn btn-secondary" data-action="cancel">Abbrechen</button><button class="btn btn-primary" data-action="save">Speichern</button>'
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => Modal.close(overlay));
    overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const data = Object.fromEntries(new FormData(document.getElementById('kbForm')));
      data.tags = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      if (!data.category_id) data.category_id = null;

      const res = article
        ? await API.put(`/kb/articles/${articleId}`, data)
        : await API.post('/kb/articles', data);

      if (res.success) {
        Modal.close(overlay);
        Toast.success('Artikel gespeichert');
        Router.navigate('/kb');
      } else Toast.error(res.error);
    });
  },

  esc(str) { if (!str) return ''; const el = document.createElement('span'); el.textContent = str; return el.innerHTML; }
};
