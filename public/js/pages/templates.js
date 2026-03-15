// ============================================
// Response Templates / Antwortvorlagen
// ============================================

const TemplatePage = {
  categories: ['Hardware', 'Software', 'Netzwerk', 'Zugang/Passwort', 'Bestellung', 'Sonstiges'],

  async listPage(container) {
    const isAdmin = App.user.role === 'admin';
    const res = await API.get('/templates?active_only=false');
    const templates = res.success ? res.data : [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Antwortvorlagen</h1>
          <p class="page-subtitle">Vordefinierte Antworten f\u00FCr Tickets</p>
        </div>
        <button class="btn btn-primary" onclick="TemplatePage.openEditor()">+ Neue Vorlage</button>
      </div>

      <div class="filter-bar">
        <input type="text" class="form-control" placeholder="Suchen..." style="max-width:220px" id="tplSearch" oninput="TemplatePage.filterList()">
        <select class="form-control" style="width:auto" id="tplCatFilter" onchange="TemplatePage.filterList()">
          <option value="">Alle Kategorien</option>
          <option value="__none">Allgemein (ohne Kategorie)</option>
          ${this.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>

      <div class="template-list" id="templateList">
        ${this.renderList(templates, isAdmin)}
      </div>
    `;

    this._templates = templates;
  },

  _templates: [],

  filterList() {
    const search = (document.getElementById('tplSearch')?.value || '').toLowerCase();
    const cat = document.getElementById('tplCatFilter')?.value || '';
    const isAdmin = App.user.role === 'admin';

    let filtered = this._templates;
    if (search) {
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(search) ||
        t.content.toLowerCase().includes(search) ||
        (t.tags || '').toLowerCase().includes(search)
      );
    }
    if (cat === '__none') {
      filtered = filtered.filter(t => !t.category);
    } else if (cat) {
      filtered = filtered.filter(t => t.category === cat || !t.category);
    }

    document.getElementById('templateList').innerHTML = this.renderList(filtered, isAdmin);
  },

  renderList(templates, isAdmin) {
    if (templates.length === 0) {
      return '<div class="empty-state"><div class="empty-state-title">Keine Vorlagen gefunden</div></div>';
    }

    return templates.map(t => `
      <div class="template-card ${!t.active ? 'template-inactive' : ''}">
        <div class="template-card-header">
          <div>
            <span class="template-card-title">${this.esc(t.title)}</span>
            ${t.category ? `<span class="badge badge-open" style="margin-left:8px;font-size:10px">${this.esc(t.category)}</span>` : '<span class="badge badge-closed" style="margin-left:8px;font-size:10px">Allgemein</span>'}
            ${!t.active ? '<span class="badge badge-inactive" style="margin-left:4px;font-size:10px">Inaktiv</span>' : ''}
          </div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" onclick="TemplatePage.openEditor(${t.id})" title="Bearbeiten">\u270E</button>
            ${isAdmin ? `<button class="btn btn-ghost btn-sm" onclick="TemplatePage.deleteTemplate(${t.id})" title="L\u00F6schen">\u2717</button>` : ''}
          </div>
        </div>
        <div class="template-card-preview">${this.esc(t.content).substring(0, 200)}${t.content.length > 200 ? '...' : ''}</div>
        ${t.tags ? `<div class="template-card-tags">${t.tags.split(',').map(tag => `<span class="template-tag">${this.esc(tag.trim())}</span>`).join('')}</div>` : ''}
      </div>
    `).join('');
  },

  async openEditor(templateId = null) {
    let tpl = null;
    if (templateId) {
      const res = await API.get(`/templates/${templateId}`);
      if (res.success) tpl = res.data;
    }

    const isEdit = !!tpl;

    const overlay = Modal.open({
      title: isEdit ? 'Vorlage bearbeiten' : 'Neue Vorlage',
      size: 'lg',
      content: `
        <form id="templateForm">
          <div class="form-group">
            <label class="form-label">Titel *</label>
            <input type="text" class="form-control" name="title" value="${this.esc(tpl?.title || '')}" required placeholder="z.B. Drucker - Standardl\u00F6sung">
          </div>
          <div class="form-group">
            <label class="form-label">Antworttext *</label>
            <textarea class="form-control" name="content" rows="10" required placeholder="Hallo {{name}},\n\n...">${tpl?.content || 'Hallo {{name}},\n\n\n\nMit freundlichen Gr\u00FC\u00DFen\nIhr IT-Team'}</textarea>
            <div class="form-hint">Verf\u00FCgbare Variablen: <code>{{name}}</code> = Name des Ticket-Erstellers</div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Kategorie (f\u00FCr Auto-Vorschlag)</label>
              <select class="form-control" name="category">
                <option value="">Allgemein (alle Tickets)</option>
                ${this.categories.map(c => `<option value="${c}" ${tpl?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
              <div class="form-hint">Vorlage wird bei Tickets dieser Kategorie bevorzugt vorgeschlagen</div>
            </div>
            <div class="form-group">
              <label class="form-label">Sortierung</label>
              <input type="number" class="form-control" name="sort_order" value="${tpl?.sort_order || 0}" min="0">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Schl\u00FCsselw\u00F6rter (kommagetrennt)</label>
            <input type="text" class="form-control" name="tags" value="${this.esc(tpl?.tags || '')}" placeholder="drucker, toner, papierstau">
            <div class="form-hint">Werden mit dem Ticket-Titel abgeglichen f\u00FCr intelligentes Vorschlagen</div>
          </div>
          ${isEdit ? `
          <div class="form-group">
            <label class="form-label flex items-center gap-2">
              <input type="checkbox" name="active" value="1" ${tpl?.active ? 'checked' : ''}>
              Vorlage aktiv
            </label>
          </div>
          ` : ''}
        </form>
      `,
      footer: `
        <button class="btn btn-secondary" data-action="cancel">Abbrechen</button>
        <button class="btn btn-primary" data-action="save">${isEdit ? 'Speichern' : 'Erstellen'}</button>
      `
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => Modal.close(overlay));
    overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const data = Object.fromEntries(new FormData(document.getElementById('templateForm')));
      if (isEdit && !data.active) data.active = false;
      if (isEdit && data.active === '1') data.active = true;

      const btn = overlay.querySelector('[data-action="save"]');
      btn.disabled = true;

      const res = isEdit
        ? await API.put(`/templates/${templateId}`, data)
        : await API.post('/templates', data);

      if (res.success) {
        Modal.close(overlay);
        Toast.success(isEdit ? 'Vorlage aktualisiert' : 'Vorlage erstellt');
        Router.navigate('/templates');
      } else {
        Toast.error(res.error);
        btn.disabled = false;
      }
    });
  },

  deleteTemplate(id) {
    Modal.confirm('Vorlage wirklich l\u00F6schen?', async () => {
      const res = await API.delete(`/templates/${id}`);
      if (res.success) {
        Toast.success('Vorlage gel\u00F6scht');
        Router.navigate('/templates');
      } else {
        Toast.error(res.error);
      }
    });
  },

  esc(str) {
    if (!str) return '';
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }
};
