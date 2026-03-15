// ============================================
// Ticket-Auswertung & Reporting — Frontend
// ============================================

const TicketAnalytics = {
  _range: '30d',
  _tab: 'overview',

  statusLabels: { open: 'Offen', pending: 'Wartend', in_progress: 'In Bearbeitung', resolved: 'Gelöst', closed: 'Geschlossen' },
  priorityLabels: { critical: 'Kritisch', high: 'Hoch', medium: 'Mittel', low: 'Niedrig' },
  sourceLabels: { web: 'Web', email: 'E-Mail', phone: 'Telefon' },

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Auswertungen & Reports</h1>
          <p class="page-subtitle">Ticket-Statistiken und Leistungskennzahlen</p>
        </div>
        <div class="flex gap-2">
          <select class="form-control" style="width:auto" id="analyticsRange" onchange="TicketAnalytics.setRange(this.value)">
            <option value="7d" ${this._range==='7d'?'selected':''}>Letzte 7 Tage</option>
            <option value="30d" ${this._range==='30d'?'selected':''}>Letzte 30 Tage</option>
            <option value="90d" ${this._range==='90d'?'selected':''}>Letzte 90 Tage</option>
            <option value="365d" ${this._range==='365d'?'selected':''}>Letztes Jahr</option>
            <option value="ytd" ${this._range==='ytd'?'selected':''}>Dieses Jahr</option>
          </select>
          <a href="/api/plugins/ticket-analytics/export?range=${this._range}" class="btn btn-secondary" target="_blank">CSV Export</a>
        </div>
      </div>

      <div class="tabs" id="analyticsTabs">
        <div class="tab ${this._tab==='overview'?'active':''}" onclick="TicketAnalytics.showTab('overview')">Übersicht</div>
        <div class="tab ${this._tab==='agents'?'active':''}" onclick="TicketAnalytics.showTab('agents')">Agent-Performance</div>
        <div class="tab ${this._tab==='categories'?'active':''}" onclick="TicketAnalytics.showTab('categories')">Kategorien</div>
        <div class="tab ${this._tab==='volume'?'active':''}" onclick="TicketAnalytics.showTab('volume')">Volumen</div>
        <div class="tab ${this._tab==='requesters'?'active':''}" onclick="TicketAnalytics.showTab('requesters')">Ersteller</div>
        <div class="tab ${this._tab==='locations'?'active':''}" onclick="TicketAnalytics.showTab('locations')">Standorte</div>
      </div>

      <div id="analyticsContent">Laden...</div>
    `;

    this.showTab(this._tab);
  },

  setRange(range) {
    this._range = range;
    this.showTab(this._tab);
  },

  async showTab(tab) {
    this._tab = tab;
    document.querySelectorAll('#analyticsTabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`#analyticsTabs .tab:nth-child(${['overview','agents','categories','volume','requesters','locations'].indexOf(tab)+1})`)?.classList.add('active');

    const content = document.getElementById('analyticsContent');
    if (!content) return;
    content.innerHTML = '<div class="text-center text-muted" style="padding:40px">Laden...</div>';

    const qs = `?range=${this._range}`;

    switch(tab) {
      case 'overview': await this.renderOverview(content, qs); break;
      case 'agents': await this.renderAgents(content, qs); break;
      case 'categories': await this.renderCategories(content, qs); break;
      case 'volume': await this.renderVolume(content, qs); break;
      case 'requesters': await this.renderRequesters(content, qs); break;
      case 'locations': await this.renderLocations(content, qs); break;
    }
  },

  // ---- Overview ----
  async renderOverview(el, qs) {
    const [kpiRes, prioRes, srcRes] = await Promise.all([
      API.get('/plugins/ticket-analytics/kpis' + qs),
      API.get('/plugins/ticket-analytics/priorities' + qs),
      API.get('/plugins/ticket-analytics/sources' + qs)
    ]);
    const k = kpiRes.success ? kpiRes.data : {};
    const prios = prioRes.success ? prioRes.data : [];
    const sources = srcRes.success ? srcRes.data : [];

    const slaColor = (k.sla_compliance_pct || 0) >= 90 ? 'var(--color-success)' : (k.sla_compliance_pct || 0) >= 70 ? 'var(--color-warning)' : 'var(--color-error)';

    el.innerHTML = `
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit, minmax(180px, 1fr))">
        <div class="stat-card"><div class="stat-icon blue">\u2637</div><div><div class="stat-value">${k.total_tickets}</div><div class="stat-label">Tickets gesamt</div></div></div>
        <div class="stat-card"><div class="stat-icon yellow">\u231B</div><div><div class="stat-value">${k.open_tickets}</div><div class="stat-label">Offen</div></div></div>
        <div class="stat-card"><div class="stat-icon green">\u2713</div><div><div class="stat-value">${k.resolved_tickets + k.closed_tickets}</div><div class="stat-label">Gelöst / Geschlossen</div></div></div>
        <div class="stat-card"><div><div class="stat-value">${k.avg_resolution_hours}h</div><div class="stat-label">Ø Lösungszeit</div></div></div>
        <div class="stat-card"><div><div class="stat-value">${k.avg_first_response_hours}h</div><div class="stat-label">Ø Erste Antwort</div></div></div>
        <div class="stat-card"><div><div class="stat-value" style="color:${slaColor}">${k.sla_compliance_pct !== null ? k.sla_compliance_pct + '%' : '—'}</div><div class="stat-label">SLA-Compliance</div></div></div>
      </div>

      <div class="form-row mt-4" style="grid-template-columns:1fr 1fr">
        <div class="card">
          <div class="card-header"><h3 class="card-title">SLA-Einhaltung</h3></div>
          <div class="card-body">
            <div class="analytics-donut-wrapper">
              ${this.renderDonut(k.sla_ok || 0, k.sla_breached || 0, 'Eingehalten', 'Überschritten', 'var(--color-success)', 'var(--color-error)')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3 class="card-title">Nach Priorität</h3></div>
          <div class="card-body">
            ${prios.map(p => {
              const colors = { critical: 'var(--color-error)', high: '#EA580C', medium: 'var(--color-warning)', low: 'var(--color-text-tertiary)' };
              const pct = k.total_tickets > 0 ? Math.round((p.count / k.total_tickets) * 100) : 0;
              return `
              <div class="analytics-bar-row">
                <span class="analytics-bar-label">${this.priorityLabels[p.priority] || p.priority}</span>
                <div class="analytics-bar-track"><div class="analytics-bar-fill" style="width:${pct}%;background:${colors[p.priority] || 'var(--color-primary)'}"></div></div>
                <span class="analytics-bar-value">${p.count} (${pct}%)</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="card mt-4">
        <div class="card-header"><h3 class="card-title">Nach Quelle</h3></div>
        <div class="card-body">
          <div class="form-row" style="grid-template-columns:repeat(auto-fit, minmax(150px, 1fr))">
            ${sources.map(s => `
            <div class="text-center">
              <div class="stat-value">${s.count}</div>
              <div class="stat-label">${this.sourceLabels[s.source] || s.source}</div>
            </div>`).join('')}
          </div>
        </div>
      </div>
    `;
  },

  // ---- Agent Performance ----
  async renderAgents(el, qs) {
    const res = await API.get('/plugins/ticket-analytics/agents' + qs);
    const agents = res.success ? res.data : [];

    el.innerHTML = `
      <div class="card">
        <div class="card-header"><h3 class="card-title">Agent-Performance</h3></div>
        <div class="card-body" style="padding:0">
          <table class="data-table">
            <thead><tr><th>Agent</th><th>Zugewiesen</th><th>Gelöst</th><th>Offen</th><th>Ø Lösungszeit</th><th>SLA erfüllt</th><th>Auslastung</th></tr></thead>
            <tbody>
              ${agents.length === 0 ? '<tr class="empty-row"><td colspan="7">Keine Daten</td></tr>' :
                agents.map(a => {
                  const resolvePct = a.total_assigned > 0 ? Math.round((a.total_resolved / a.total_assigned) * 100) : 0;
                  return `
                  <tr>
                    <td class="fw-600">${this.esc(a.name)}</td>
                    <td>${a.total_assigned}</td>
                    <td>${a.total_resolved}</td>
                    <td>${a.total_open}</td>
                    <td>${a.avg_resolution_hours !== null ? a.avg_resolution_hours + 'h' : '—'}</td>
                    <td>${a.sla_met}</td>
                    <td>
                      <div class="analytics-bar-track" style="width:80px;display:inline-block;vertical-align:middle">
                        <div class="analytics-bar-fill" style="width:${resolvePct}%;background:${resolvePct >= 80 ? 'var(--color-success)' : resolvePct >= 50 ? 'var(--color-warning)' : 'var(--color-error)'}"></div>
                      </div>
                      <span class="text-xs">${resolvePct}%</span>
                    </td>
                  </tr>`;
                }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ---- Categories ----
  async renderCategories(el, qs) {
    const res = await API.get('/plugins/ticket-analytics/categories' + qs);
    const cats = res.success ? res.data : [];
    const maxCount = Math.max(...cats.map(c => c.count), 1);

    el.innerHTML = `
      <div class="card">
        <div class="card-header"><h3 class="card-title">Tickets nach Kategorie</h3></div>
        <div class="card-body">
          ${cats.map(c => `
          <div class="analytics-bar-row" style="margin-bottom:12px">
            <span class="analytics-bar-label" style="min-width:140px">${this.esc(c.category || 'Sonstiges')}</span>
            <div class="analytics-bar-track" style="flex:1">
              <div class="analytics-bar-fill" style="width:${Math.round((c.count / maxCount) * 100)}%"></div>
            </div>
            <span class="analytics-bar-value" style="min-width:120px">${c.count} Tickets · Ø ${c.avg_hours || '—'}h</span>
          </div>`).join('')}
        </div>
      </div>
    `;
  },

  // ---- Volume ----
  async renderVolume(el, qs) {
    const res = await API.get('/plugins/ticket-analytics/volume' + qs + '&group=day');
    const data = res.success ? res.data : { created: [], resolved: [] };

    // Simple ASCII-style bar chart
    const allPeriods = [...new Set([...data.created.map(d => d.period), ...data.resolved.map(d => d.period)])].sort();
    const createdMap = {}; data.created.forEach(d => createdMap[d.period] = d.count);
    const resolvedMap = {}; data.resolved.forEach(d => resolvedMap[d.period] = d.count);
    const maxVal = Math.max(...allPeriods.map(p => Math.max(createdMap[p] || 0, resolvedMap[p] || 0)), 1);

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Ticket-Volumen</h3>
          <div class="flex gap-2 text-xs">
            <span><span style="display:inline-block;width:12px;height:12px;background:var(--color-primary);border-radius:2px;vertical-align:middle"></span> Erstellt</span>
            <span><span style="display:inline-block;width:12px;height:12px;background:var(--color-success);border-radius:2px;vertical-align:middle"></span> Gelöst</span>
          </div>
        </div>
        <div class="card-body" style="overflow-x:auto">
          <div class="analytics-chart">
            ${allPeriods.slice(-30).map(p => {
              const c = createdMap[p] || 0;
              const r = resolvedMap[p] || 0;
              const cH = Math.round((c / maxVal) * 120);
              const rH = Math.round((r / maxVal) * 120);
              const label = p.length > 7 ? p.slice(5) : p;
              return `
              <div class="analytics-chart-col">
                <div class="analytics-chart-bars">
                  <div class="analytics-chart-bar" style="height:${cH}px;background:var(--color-primary)" title="Erstellt: ${c}"></div>
                  <div class="analytics-chart-bar" style="height:${rH}px;background:var(--color-success)" title="Gelöst: ${r}"></div>
                </div>
                <div class="analytics-chart-label">${label}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  },

  // ---- Top Requesters ----
  async renderRequesters(el, qs) {
    const res = await API.get('/plugins/ticket-analytics/requesters' + qs);
    const data = res.success ? res.data : [];

    el.innerHTML = `
      <div class="card">
        <div class="card-header"><h3 class="card-title">Top Ticket-Ersteller</h3></div>
        <div class="card-body" style="padding:0">
          <table class="data-table">
            <thead><tr><th>Benutzer</th><th>E-Mail</th><th>Abteilung</th><th>Standort</th><th>Tickets</th></tr></thead>
            <tbody>
              ${data.length === 0 ? '<tr class="empty-row"><td colspan="5">Keine Daten</td></tr>' :
                data.map(r => `
                <tr>
                  <td class="fw-600">${this.esc(r.name)}</td>
                  <td class="text-sm">${this.esc(r.email)}</td>
                  <td class="text-sm">${this.esc(r.department) || '—'}</td>
                  <td class="text-sm">${this.esc(r.location) || '—'}</td>
                  <td class="fw-600">${r.ticket_count}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ---- Locations ----
  async renderLocations(el, qs) {
    const res = await API.get('/plugins/ticket-analytics/locations' + qs);
    const data = res.success ? res.data : [];
    const maxCount = Math.max(...data.map(d => d.count), 1);

    el.innerHTML = `
      <div class="card">
        <div class="card-header"><h3 class="card-title">Tickets nach Standort</h3></div>
        <div class="card-body">
          ${data.map(d => `
          <div class="analytics-bar-row" style="margin-bottom:12px">
            <span class="analytics-bar-label" style="min-width:140px">${this.esc(d.location)}</span>
            <div class="analytics-bar-track" style="flex:1">
              <div class="analytics-bar-fill" style="width:${Math.round((d.count / maxCount) * 100)}%"></div>
            </div>
            <span class="analytics-bar-value">${d.count} gesamt · ${d.open_count} offen</span>
          </div>`).join('')}
        </div>
      </div>
    `;
  },

  // ---- Donut Chart (SVG) ----
  renderDonut(val1, val2, label1, label2, color1, color2) {
    const total = val1 + val2;
    if (total === 0) return '<div class="text-center text-muted">Keine Daten</div>';
    const pct1 = (val1 / total) * 100;
    const circumference = 2 * Math.PI * 40;
    const offset1 = circumference * (1 - pct1 / 100);

    return `
      <div style="display:flex;align-items:center;justify-content:center;gap:24px">
        <svg width="120" height="120" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="${color2}" stroke-width="12" opacity="0.3"/>
          <circle cx="50" cy="50" r="40" fill="none" stroke="${color1}" stroke-width="12"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset1}"
            transform="rotate(-90 50 50)" stroke-linecap="round"/>
          <text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="700" fill="currentColor">${Math.round(pct1)}%</text>
        </svg>
        <div>
          <div class="flex items-center gap-2 text-sm" style="margin-bottom:6px">
            <span style="width:12px;height:12px;border-radius:2px;background:${color1};flex-shrink:0"></span>
            ${label1}: ${val1}
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span style="width:12px;height:12px;border-radius:2px;background:${color2};flex-shrink:0"></span>
            ${label2}: ${val2}
          </div>
        </div>
      </div>
    `;
  },

  esc(str) { if (!str) return ''; const el = document.createElement('span'); el.textContent = str; return el.innerHTML; }
};

// Register route
Router.register('/plugin/ticket-analytics', (c) => TicketAnalytics.render(c));
