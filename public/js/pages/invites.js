// ============================================
// Invite Key Management
// ============================================

const InvitePage = {
  async render(container) {
    const res = await API.get('/invites');
    const keys = res.success ? res.data : [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Einladungsschl\u00FCssel</h1>
          <p class="page-subtitle">Schl\u00FCssel f\u00FCr die Benutzer-Registrierung verwalten</p>
        </div>
        <button class="btn btn-primary" onclick="InvitePage.openCreateModal()">+ Neuer Schl\u00FCssel</button>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Schl\u00FCssel</th><th>Bezeichnung</th><th>Verwendet</th><th>Max</th><th>Abl\u00E4uft</th><th>Erstellt von</th><th>Status</th><th>Aktionen</th></tr></thead>
          <tbody>
            ${keys.length === 0 ? '<tr class="empty-row"><td colspan="8">Keine Schl\u00FCssel</td></tr>' :
              keys.map(k => {
                const expired = k.expires_at && new Date(k.expires_at) < new Date();
                const exhausted = k.max_uses && k.uses >= k.max_uses;
                const status = !k.active ? 'Deaktiviert' : expired ? 'Abgelaufen' : exhausted ? 'Aufgebraucht' : 'Aktiv';
                const statusClass = status === 'Aktiv' ? 'badge-active' : 'badge-inactive';
                return `
                <tr>
                  <td><code class="fw-600" style="font-size:15px;letter-spacing:1px">${this.esc(k.key_code)}</code></td>
                  <td class="text-sm">${this.esc(k.label) || '\u2014'}</td>
                  <td class="text-sm">${k.uses}x</td>
                  <td class="text-sm">${k.max_uses || '\u221E'}</td>
                  <td class="text-sm">${k.expires_at ? new Date(k.expires_at).toLocaleDateString('de-DE') : '\u2014'}</td>
                  <td class="text-sm">${this.esc(k.created_by_name) || '\u2014'}</td>
                  <td><span class="badge ${statusClass}">${status}</span></td>
                  <td>
                    <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${k.key_code}');Toast.success('Kopiert!')" title="Kopieren">\u{1F4CB}</button>
                    <button class="btn btn-ghost btn-sm" onclick="InvitePage.toggleActive(${k.id}, ${k.active ? 0 : 1})" title="${k.active ? 'Deaktivieren' : 'Aktivieren'}">${k.active ? '\u23F8' : '\u25B6'}</button>
                    ${App.user.role === 'admin' ? `<button class="btn btn-ghost btn-sm" onclick="InvitePage.deleteKey(${k.id})" title="L\u00F6schen">\u2717</button>` : ''}
                  </td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  openCreateModal() {
    const overlay = Modal.open({
      title: 'Neuer Einladungsschl\u00FCssel',
      content: `
        <form id="inviteForm">
          <div class="form-group">
            <label class="form-label">Bezeichnung</label>
            <input type="text" class="form-control" name="label" placeholder="z.B. F\u00FCr Vertrieb Q2 2026">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Max. Verwendungen</label>
              <input type="number" class="form-control" name="max_uses" min="1" placeholder="Leer = unbegrenzt">
            </div>
            <div class="form-group">
              <label class="form-label">Ablaufdatum</label>
              <input type="date" class="form-control" name="expires_at">
            </div>
          </div>
        </form>`,
      footer: '<button class="btn btn-secondary" data-action="cancel">Abbrechen</button><button class="btn btn-primary" data-action="save">Erstellen</button>'
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => Modal.close(overlay));
    overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const data = Object.fromEntries(new FormData(document.getElementById('inviteForm')));
      if (!data.max_uses) delete data.max_uses;
      if (!data.expires_at) delete data.expires_at;
      const res = await API.post('/invites', data);
      if (res.success) {
        Modal.close(overlay);
        Toast.success(`Schl\u00FCssel erstellt: ${res.data.key_code}`);
        Router.navigate('/invites', false);
      } else Toast.error(res.error);
    });
  },

  async toggleActive(id, active) {
    await API.put(`/invites/${id}`, { active: !!active });
    Router.navigate('/invites', false);
  },

  deleteKey(id) {
    Modal.confirm('Schl\u00FCssel wirklich l\u00F6schen?', async () => {
      await API.delete(`/invites/${id}`);
      Toast.success('Gel\u00F6scht');
      Router.navigate('/invites', false);
    });
  },

  esc(str) { if (!str) return ''; const el = document.createElement('span'); el.textContent = str; return el.innerHTML; }
};
