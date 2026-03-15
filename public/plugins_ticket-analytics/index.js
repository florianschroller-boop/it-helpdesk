/**
 * Ticket-Auswertung & Reporting Plugin
 *
 * Reports:
 *  - Dashboard KPIs (Übersicht)
 *  - Ticket-Volumen über Zeit (täglich/wöchentlich/monatlich)
 *  - SLA-Compliance Rate
 *  - Agent-Performance (Tickets pro Agent, Durchschnittliche Lösungszeit)
 *  - Kategorie-Verteilung
 *  - Prioritäts-Verteilung
 *  - First Response Time
 *  - Ersteller-Ranking (Top Requester)
 *  - Standort-Auswertung
 *  - CSV-Export aller Reports
 */

const path = require('path');

async function activate(ctx) {
  const { authenticate, requireRole } = require(path.join(__dirname, '..', '..', 'api', 'middleware', 'auth'));
  const guard = [authenticate, requireRole('admin', 'agent')];

  // ---- KPI Overview ----
  ctx.registerRoute('get', '/kpis', ...guard, async (req, res) => {
    const { from, to } = parseDateRange(req.query);

    const [total, open, resolved, closed, avgResolve, slaOk, slaBreach, firstResponse] = await Promise.all([
      ctx.db.queryOne(`SELECT COUNT(*) as c FROM tickets WHERE created_at BETWEEN ? AND ?`, [from, to]),
      ctx.db.queryOne(`SELECT COUNT(*) as c FROM tickets WHERE status IN ('open','in_progress','pending') AND created_at BETWEEN ? AND ?`, [from, to]),
      ctx.db.queryOne(`SELECT COUNT(*) as c FROM tickets WHERE status = 'resolved' AND created_at BETWEEN ? AND ?`, [from, to]),
      ctx.db.queryOne(`SELECT COUNT(*) as c FROM tickets WHERE status = 'closed' AND created_at BETWEEN ? AND ?`, [from, to]),
      ctx.db.queryOne(`SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)) as avg_hours FROM tickets WHERE resolved_at IS NOT NULL AND created_at BETWEEN ? AND ?`, [from, to]),
      ctx.db.queryOne(`SELECT COUNT(*) as c FROM tickets WHERE sla_due_at IS NOT NULL AND (resolved_at <= sla_due_at OR (resolved_at IS NULL AND sla_due_at > NOW())) AND created_at BETWEEN ? AND ?`, [from, to]),
      ctx.db.queryOne(`SELECT COUNT(*) as c FROM tickets WHERE sla_due_at IS NOT NULL AND ((resolved_at > sla_due_at) OR (resolved_at IS NULL AND sla_due_at < NOW() AND status NOT IN ('resolved','closed'))) AND created_at BETWEEN ? AND ?`, [from, to]),
      ctx.db.queryOne(`SELECT AVG(first_resp_hours) as avg_hours FROM (SELECT TIMESTAMPDIFF(HOUR, t.created_at, MIN(c.created_at)) as first_resp_hours FROM tickets t JOIN ticket_comments c ON c.ticket_id = t.id AND c.user_id != t.requester_id WHERE t.created_at BETWEEN ? AND ? GROUP BY t.id) sub`, [from, to])
    ]);

    const slaTotal = (slaOk?.c || 0) + (slaBreach?.c || 0);

    res.json({ success: true, data: {
      total_tickets: total.c,
      open_tickets: open.c,
      resolved_tickets: resolved.c,
      closed_tickets: closed.c,
      avg_resolution_hours: Math.round(parseFloat(avgResolve?.avg_hours || 0) * 10) / 10,
      sla_compliance_pct: slaTotal > 0 ? Math.round(((slaOk?.c || 0) / slaTotal) * 1000) / 10 : null,
      sla_ok: slaOk?.c || 0,
      sla_breached: slaBreach?.c || 0,
      avg_first_response_hours: Math.round(parseFloat(firstResponse?.avg_hours || 0) * 10) / 10,
      period: { from, to }
    }});
  });

  // ---- Volume over time ----
  ctx.registerRoute('get', '/volume', ...guard, async (req, res) => {
    const { from, to } = parseDateRange(req.query);
    const group = req.query.group || 'day'; // day, week, month

    let dateFormat, dateGroup;
    if (group === 'month') { dateFormat = '%Y-%m'; dateGroup = "DATE_FORMAT(created_at, '%Y-%m')"; }
    else if (group === 'week') { dateFormat = '%Y-W%u'; dateGroup = "DATE_FORMAT(created_at, '%Y-W%u')"; }
    else { dateFormat = '%Y-%m-%d'; dateGroup = 'DATE(created_at)'; }

    const created = await ctx.db.query(
      `SELECT ${dateGroup} as period, COUNT(*) as count FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY ${dateGroup} ORDER BY period`, [from, to]
    );
    const resolved = await ctx.db.query(
      `SELECT ${dateGroup} as period, COUNT(*) as count FROM tickets WHERE resolved_at IS NOT NULL AND resolved_at BETWEEN ? AND ? GROUP BY ${dateGroup} ORDER BY period`, [from, to]
    );

    res.json({ success: true, data: { created, resolved, group } });
  });

  // ---- Agent Performance ----
  ctx.registerRoute('get', '/agents', ...guard, async (req, res) => {
    const { from, to } = parseDateRange(req.query);

    const agents = await ctx.db.query(`
      SELECT u.id, u.name,
        COUNT(t.id) as total_assigned,
        SUM(CASE WHEN t.status IN ('resolved','closed') THEN 1 ELSE 0 END) as total_resolved,
        SUM(CASE WHEN t.status IN ('open','in_progress','pending') THEN 1 ELSE 0 END) as total_open,
        ROUND(AVG(CASE WHEN t.resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, t.created_at, t.resolved_at) END), 1) as avg_resolution_hours,
        SUM(CASE WHEN t.sla_due_at IS NOT NULL AND t.resolved_at IS NOT NULL AND t.resolved_at <= t.sla_due_at THEN 1 ELSE 0 END) as sla_met
      FROM users u
      LEFT JOIN tickets t ON t.assignee_id = u.id AND t.created_at BETWEEN ? AND ?
      WHERE u.role IN ('admin','agent') AND u.active = 1
      GROUP BY u.id, u.name
      ORDER BY total_resolved DESC
    `, [from, to]);

    res.json({ success: true, data: agents });
  });

  // ---- Category breakdown ----
  ctx.registerRoute('get', '/categories', ...guard, async (req, res) => {
    const { from, to } = parseDateRange(req.query);
    const data = await ctx.db.query(
      `SELECT category, COUNT(*) as count,
        ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at) END), 1) as avg_hours
       FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY category ORDER BY count DESC`, [from, to]
    );
    res.json({ success: true, data });
  });

  // ---- Priority breakdown ----
  ctx.registerRoute('get', '/priorities', ...guard, async (req, res) => {
    const { from, to } = parseDateRange(req.query);
    const data = await ctx.db.query(
      `SELECT priority, COUNT(*) as count,
        SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved,
        ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at) END), 1) as avg_hours
       FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY priority ORDER BY FIELD(priority, 'critical','high','medium','low')`, [from, to]
    );
    res.json({ success: true, data });
  });

  // ---- Top Requester ----
  ctx.registerRoute('get', '/requesters', ...guard, async (req, res) => {
    const { from, to } = parseDateRange(req.query);
    const data = await ctx.db.query(
      `SELECT u.name, u.email, u.department, u.location, COUNT(t.id) as ticket_count
       FROM tickets t JOIN users u ON t.requester_id = u.id
       WHERE t.created_at BETWEEN ? AND ?
       GROUP BY u.id ORDER BY ticket_count DESC LIMIT 20`, [from, to]
    );
    res.json({ success: true, data });
  });

  // ---- Location breakdown ----
  ctx.registerRoute('get', '/locations', ...guard, async (req, res) => {
    const { from, to } = parseDateRange(req.query);
    const data = await ctx.db.query(
      `SELECT COALESCE(u.location, 'Unbekannt') as location, COUNT(t.id) as count,
        SUM(CASE WHEN t.status IN ('open','in_progress','pending') THEN 1 ELSE 0 END) as open_count
       FROM tickets t LEFT JOIN users u ON t.requester_id = u.id
       WHERE t.created_at BETWEEN ? AND ?
       GROUP BY u.location ORDER BY count DESC`, [from, to]
    );
    res.json({ success: true, data });
  });

  // ---- Source breakdown ----
  ctx.registerRoute('get', '/sources', ...guard, async (req, res) => {
    const { from, to } = parseDateRange(req.query);
    const data = await ctx.db.query(
      `SELECT source, COUNT(*) as count FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY source ORDER BY count DESC`, [from, to]
    );
    res.json({ success: true, data });
  });

  // ---- CSV Export ----
  ctx.registerRoute('get', '/export', ...guard, async (req, res) => {
    const { from, to } = parseDateRange(req.query);
    const tickets = await ctx.db.query(`
      SELECT t.ticket_number, t.title, t.status, t.priority, t.category, t.source,
        r.name as requester, r.department, r.location,
        a.name as assignee,
        DATE_FORMAT(t.created_at, '%d.%m.%Y %H:%i') as created,
        DATE_FORMAT(t.resolved_at, '%d.%m.%Y %H:%i') as resolved,
        DATE_FORMAT(t.sla_due_at, '%d.%m.%Y %H:%i') as sla_due,
        CASE WHEN t.sla_due_at IS NOT NULL AND t.resolved_at IS NOT NULL AND t.resolved_at <= t.sla_due_at THEN 'Ja'
             WHEN t.sla_due_at IS NOT NULL AND ((t.resolved_at > t.sla_due_at) OR (t.resolved_at IS NULL AND t.sla_due_at < NOW())) THEN 'Nein'
             ELSE '' END as sla_eingehalten,
        CASE WHEN t.resolved_at IS NOT NULL THEN ROUND(TIMESTAMPDIFF(MINUTE, t.created_at, t.resolved_at) / 60, 1) ELSE NULL END as loesung_stunden
      FROM tickets t
      LEFT JOIN users r ON t.requester_id = r.id
      LEFT JOIN users a ON t.assignee_id = a.id
      WHERE t.created_at BETWEEN ? AND ?
      ORDER BY t.created_at DESC
    `, [from, to]);

    const header = 'Ticket-Nr.;Titel;Status;Prioritaet;Kategorie;Quelle;Ersteller;Abteilung;Standort;Bearbeiter;Erstellt;Geloest;SLA-Frist;SLA eingehalten;Loesung (Std.)';
    const rows = tickets.map(t =>
      [t.ticket_number, t.title, t.status, t.priority, t.category, t.source, t.requester, t.department, t.location, t.assignee, t.created, t.resolved, t.sla_due, t.sla_eingehalten, t.loesung_stunden]
        .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(';')
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=ticket-report-${from.slice(0,10)}-${to.slice(0,10)}.csv`);
    res.send('\uFEFF' + [header, ...rows].join('\n'));
  });

  // ---- Sidebar + Frontend ----
  ctx.registerSidebarItem({ icon: '\u{1F4CA}', label: 'Auswertungen', route: '/plugin/ticket-analytics' });
  ctx.registerFrontendAsset('js', 'frontend.js');
  ctx.registerFrontendAsset('css', 'styles.css');

  console.log('[PLUGIN] Ticket-Auswertung aktiviert');
}

function deactivate() {
  console.log('[PLUGIN] Ticket-Auswertung deaktiviert');
}

// Helper: parse date range from query params
function parseDateRange(query) {
  const now = new Date();
  const range = query.range || '30d';
  let from, to;

  to = query.to || now.toISOString().slice(0, 19).replace('T', ' ');

  if (query.from) {
    from = query.from;
  } else {
    const d = new Date(now);
    if (range === '7d') d.setDate(d.getDate() - 7);
    else if (range === '30d') d.setDate(d.getDate() - 30);
    else if (range === '90d') d.setDate(d.getDate() - 90);
    else if (range === '365d') d.setFullYear(d.getFullYear() - 1);
    else if (range === 'ytd') { d.setMonth(0); d.setDate(1); }
    else d.setDate(d.getDate() - 30);
    from = d.toISOString().slice(0, 19).replace('T', ' ');
  }

  return { from, to };
}

module.exports = { activate, deactivate };
