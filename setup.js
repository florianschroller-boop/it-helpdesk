#!/usr/bin/env node
/**
 * IT-Helpdesk Setup Script
 * Creates database tables and initial admin user.
 *
 * Usage:
 *   node setup.js
 *   node setup.js --seed   (also inserts test data)
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('\n=== IT-Helpdesk Setup ===\n');

  // 1. Connect to MySQL (without database)
  const dbName = process.env.DB_NAME || 'helpdesk';
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });
    console.log('[OK] MySQL-Verbindung hergestellt');
  } catch (err) {
    console.error('[FEHLER] MySQL-Verbindung fehlgeschlagen:', err.message);
    console.error('Bitte .env-Datei pruefen (DB_HOST, DB_USER, DB_PASSWORD).');
    process.exit(1);
  }

  // 2. Create database if not exists
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);
  console.log(`[OK] Datenbank "${dbName}" bereit`);

  // 3. Run migration
  const migrationPath = path.join(__dirname, 'migrations', '001_schema.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await conn.query(migrationSql);
  console.log('[OK] Datenbank-Schema erstellt');

  // 4. Check if admin exists
  const [admins] = await conn.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");

  if (admins.length === 0) {
    console.log('\n--- Admin-Benutzer anlegen ---');
    const name = await ask('Admin-Name [Admin]: ') || 'Admin';
    const email = await ask('Admin-E-Mail [admin@helpdesk.local]: ') || 'admin@helpdesk.local';
    const password = await ask('Admin-Passwort [admin123]: ') || 'admin123';

    const hash = await bcrypt.hash(password, 12);
    await conn.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, 'admin']
    );
    console.log(`[OK] Admin-Benutzer "${name}" erstellt`);
  } else {
    console.log('[INFO] Admin-Benutzer existiert bereits');
  }

  // 5. Insert default settings
  const defaults = {
    'company_name': 'IT-Helpdesk',
    'sla_default_hours': '24',
    'ticket_categories': JSON.stringify(['Hardware', 'Software', 'Netzwerk', 'Zugang/Passwort', 'Bestellung', 'Sonstiges']),
    'network_check_method': process.env.NETWORK_CHECK_METHOD || 'http'
  };

  for (const [key, value] of Object.entries(defaults)) {
    await conn.query(
      'INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_name=key_name',
      [key, value]
    );
  }

  // 5b. Run locations migration
  const migration2Path = path.join(__dirname, 'migrations', '002_locations.sql');
  if (fs.existsSync(migration2Path)) {
    const migration2Sql = fs.readFileSync(migration2Path, 'utf8');
    await conn.query(migration2Sql);
    console.log('[OK] Locations-Tabelle erstellt');
  }

  // 6. Insert KB default categories
  const kbCategories = [
    { name: 'Hardware', slug: 'hardware', icon: 'laptop', sort_order: 1 },
    { name: 'Software', slug: 'software', icon: 'code', sort_order: 2 },
    { name: 'Netzwerk', slug: 'netzwerk', icon: 'wifi', sort_order: 3 },
    { name: 'E-Mail', slug: 'email', icon: 'mail', sort_order: 4 },
    { name: 'Sicherheit', slug: 'sicherheit', icon: 'lock', sort_order: 5 },
    { name: 'Anleitungen', slug: 'anleitungen', icon: 'book', sort_order: 6 }
  ];

  for (const cat of kbCategories) {
    await conn.query(
      'INSERT INTO kb_categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=name',
      [cat.name, cat.slug, cat.icon, cat.sort_order]
    );
  }
  console.log('[OK] Standard-Kategorien erstellt');

  // 7. Optional: seed test data
  if (process.argv.includes('--seed')) {
    await seed(conn);
  }

  console.log('\n=== Setup abgeschlossen ===');
  console.log(`Starte den Server mit: npm start`);
  console.log(`Oeffne: ${process.env.APP_URL || 'http://localhost:3000'}\n`);

  rl.close();
  await conn.end();
}

async function seed(conn) {
  console.log('\n--- Testdaten einfuegen ---');

  const hash = await bcrypt.hash('password', 12);

  // Users
  const users = [
    ['Max Mustermann', 'max@firma.de', hash, 'agent', 'IT'],
    ['Erika Muster', 'erika@firma.de', hash, 'agent', 'IT'],
    ['Hans Schmidt', 'hans@firma.de', hash, 'user', 'Vertrieb'],
    ['Anna Weber', 'anna@firma.de', hash, 'user', 'Buchhaltung'],
    ['Peter Meyer', 'peter@firma.de', hash, 'user', 'Vertrieb'],
    ['Julia Klein', 'julia@firma.de', hash, 'user', 'Marketing'],
    ['Thomas Braun', 'thomas@firma.de', hash, 'user', 'Geschaeftsfuehrung'],
    ['Lisa Fischer', 'lisa@firma.de', hash, 'user', 'Personal'],
    ['Markus Wolf', 'markus@firma.de', hash, 'user', 'IT'],
    ['Sandra Richter', 'sandra@firma.de', hash, 'user', 'Kundenservice']
  ];

  for (const u of users) {
    await conn.query(
      'INSERT IGNORE INTO users (name, email, password_hash, role, department) VALUES (?, ?, ?, ?, ?)',
      u
    );
  }
  console.log('[OK] 10 Test-Benutzer erstellt (Passwort: password)');

  // Assets
  const assets = [
    ['LAP-001', 'ThinkPad T14', 'laptop', 'Lenovo', 'ThinkPad T14 Gen 3', 'SN-T14-001', 'active', 'hans@firma.de', 'Buero 1', '2023-06-15', '2026-06-15'],
    ['LAP-002', 'ThinkPad X1 Carbon', 'laptop', 'Lenovo', 'X1 Carbon Gen 11', 'SN-X1C-002', 'active', 'anna@firma.de', 'Buero 2', '2023-09-01', '2026-09-01'],
    ['LAP-003', 'ThinkPad L15', 'laptop', 'Lenovo', 'ThinkPad L15 Gen 4', 'SN-L15-003', 'active', 'peter@firma.de', 'Buero 1', '2024-01-10', '2027-01-10'],
    ['DES-001', 'Dell OptiPlex 7010', 'desktop', 'Dell', 'OptiPlex 7010', 'SN-OPT-001', 'active', 'julia@firma.de', 'Buero 3', '2023-03-20', '2026-03-20'],
    ['DES-002', 'Dell OptiPlex 5000', 'desktop', 'Dell', 'OptiPlex 5000', 'SN-OPT-002', 'available', null, 'Lager', '2023-03-20', '2026-03-20'],
    ['PHO-001', 'iPhone 15', 'phone', 'Apple', 'iPhone 15', 'SN-IP15-001', 'active', 'thomas@firma.de', null, '2024-02-01', '2026-02-01'],
    ['PHO-002', 'Samsung Galaxy S24', 'phone', 'Samsung', 'Galaxy S24', 'SN-GS24-001', 'active', 'max@firma.de', null, '2024-03-15', '2026-03-15'],
    ['PRI-001', 'HP LaserJet Pro', 'printer', 'HP', 'LaserJet Pro M404dn', 'SN-HP-001', 'active', null, 'Buero 1', '2022-11-01', '2025-11-01'],
    ['PRI-002', 'Canon imageRUNNER', 'printer', 'Canon', 'imageRUNNER 2630i', 'SN-CAN-001', 'in_repair', null, 'Buero 3', '2021-06-01', '2024-06-01'],
    ['SRV-001', 'Fileserver', 'server', 'Dell', 'PowerEdge R740', 'SN-PE-001', 'active', null, 'Serverraum', '2022-01-15', '2027-01-15'],
    ['SRV-002', 'Mailserver', 'server', 'Dell', 'PowerEdge R640', 'SN-PE-002', 'active', null, 'Serverraum', '2022-01-15', '2027-01-15'],
    ['NET-001', 'Core Switch', 'network', 'Cisco', 'Catalyst 9300', 'SN-CS-001', 'active', null, 'Serverraum', '2022-06-01', '2027-06-01']
  ];

  for (const a of assets) {
    let userId = null;
    if (a[7]) {
      const [rows] = await conn.query('SELECT id FROM users WHERE email = ?', [a[7]]);
      if (rows.length > 0) userId = rows[0].id;
    }
    await conn.query(
      'INSERT IGNORE INTO assets (asset_tag, name, type, brand, model, serial_number, status, assigned_to_user_id, location, purchase_date, warranty_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [a[0], a[1], a[2], a[3], a[4], a[5], a[6], userId, a[8], a[9], a[10]]
    );
  }
  console.log('[OK] 12 Test-Assets erstellt');

  // Network devices
  const netDevices = [
    ['Fileserver', '192.168.1.10', 'server', 'Zentraler Dateiserver', 'Serverraum'],
    ['Mailserver', '192.168.1.11', 'server', 'Exchange / Mail', 'Serverraum'],
    ['Core Switch', '192.168.1.1', 'switch', 'Cisco Catalyst 9300', 'Serverraum'],
    ['WLAN Controller', '192.168.1.5', 'router', 'Ubiquiti UniFi', 'Serverraum'],
    ['Drucker Buero 1', '192.168.1.50', 'printer', 'HP LaserJet', 'Buero 1']
  ];

  for (const d of netDevices) {
    await conn.query(
      'INSERT IGNORE INTO network_devices (name, ip_address, type, description, location) VALUES (?, ?, ?, ?, ?)',
      d
    );
  }
  console.log('[OK] 5 Netzwerkgeraete erstellt');

  // Locations
  const locations = [
    { name: 'Serverraum', slug: 'serverraum', address: 'Musterstr. 1, 80331 Muenchen, UG', directions: 'Eingang ueber Tiefgarage, Tuer links nach dem Aufzug. Schluessel bei Empfang abholen.', contact_name: 'Max Mustermann', contact_phone: '089 1234-100', contact_email: 'max@firma.de', notes: 'Klimaanlage muss dauerhaft laufen. Zutritt nur mit Begleitung. Alarmanlage Code: beim Admin erfragen.', sort_order: 1 },
    { name: 'Buero 1', slug: 'buero-1', address: 'Musterstr. 1, 80331 Muenchen, 1. OG', directions: 'Haupteingang, 1. OG rechts. Parkplaetze hinter dem Gebaeude.', contact_name: 'Sandra Richter', contact_phone: '089 1234-200', contact_email: 'sandra@firma.de', notes: 'Grossraumbuero, 15 Arbeitsplaetze. Netzwerkdosen an der Fensterseite.', sort_order: 2 },
    { name: 'Buero 2', slug: 'buero-2', address: 'Musterstr. 1, 80331 Muenchen, 2. OG', directions: 'Haupteingang, 2. OG. Aufzug vorhanden.', contact_name: 'Anna Weber', contact_phone: '089 1234-300', contact_email: 'anna@firma.de', notes: 'Einzelbueros, Buchhaltung und Geschaeftsfuehrung.', sort_order: 3 },
    { name: 'Buero 3', slug: 'buero-3', address: 'Musterstr. 3, 80331 Muenchen, EG', directions: 'Nebengebaeude gegenueber. Eingang von der Seitenstrasse.', contact_name: 'Julia Klein', contact_phone: '089 1234-400', contact_email: 'julia@firma.de', notes: 'Marketing-Abteilung. Eigener Netzwerk-Switch im Schrank neben Tuer.', sort_order: 4 },
    { name: 'Lager', slug: 'lager', address: 'Musterstr. 1, 80331 Muenchen, UG', directions: 'Tiefgarage, gegenueber dem Serverraum.', contact_name: 'Max Mustermann', contact_phone: '089 1234-100', contact_email: 'max@firma.de', notes: 'IT-Ersatzgeraete und Verbrauchsmaterial. Keine Netzwerkanbindung.', sort_order: 5 }
  ];

  for (const loc of locations) {
    await conn.query(
      'INSERT IGNORE INTO locations (name, slug, address, directions, contact_name, contact_phone, contact_email, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [loc.name, loc.slug, loc.address, loc.directions, loc.contact_name, loc.contact_phone, loc.contact_email, loc.notes, loc.sort_order]
    );
  }
  console.log('[OK] 5 Standorte erstellt');

  // Tickets
  const year = new Date().getFullYear();
  await conn.query('INSERT IGNORE INTO ticket_counters (year, last_number) VALUES (?, 0)', [year]);

  const [allUsers] = await conn.query('SELECT id, email, role FROM users');
  const userMap = {};
  allUsers.forEach(u => userMap[u.email] = u);

  const agentIds = allUsers.filter(u => u.role === 'agent' || u.role === 'admin').map(u => u.id);

  const tickets = [
    { title: 'Laptop faehrt nicht mehr hoch', desc: 'Mein ThinkPad T14 zeigt seit heute morgen nur noch einen schwarzen Bildschirm nach dem Einschalten. Power-LED leuchtet.', cat: 'Hardware', prio: 'high', status: 'open', req: 'hans@firma.de' },
    { title: 'Outlook synchronisiert keine E-Mails', desc: 'Seit ca. 2 Stunden werden keine neuen E-Mails mehr in Outlook angezeigt. Webmail funktioniert.', cat: 'Software', prio: 'high', status: 'in_progress', req: 'anna@firma.de' },
    { title: 'Neuen Benutzer anlegen - Praktikant', desc: 'Bitte einen neuen Benutzer fuer unseren Praktikanten Max Mueller anlegen. Abteilung Vertrieb, Start am 01.04.', cat: 'Zugang/Passwort', prio: 'medium', status: 'open', req: 'peter@firma.de' },
    { title: 'Drucker druckt nur leere Seiten', desc: 'Der HP LaserJet in Buero 1 druckt seit gestern nur noch leere Seiten. Testseite ebenfalls leer.', cat: 'Hardware', prio: 'medium', status: 'pending', req: 'julia@firma.de' },
    { title: 'VPN-Verbindung bricht staendig ab', desc: 'Im Homeoffice bricht die VPN-Verbindung alle 15-20 Minuten ab. Router wurde bereits neu gestartet.', cat: 'Netzwerk', prio: 'high', status: 'in_progress', req: 'thomas@firma.de' },
    { title: 'Passwort zuruecksetzen - SAP', desc: 'Ich habe mein SAP-Passwort vergessen und bin ausgesperrt. Bitte zuruecksetzen.', cat: 'Zugang/Passwort', prio: 'medium', status: 'resolved', req: 'lisa@firma.de' },
    { title: 'Neues Headset bestellen', desc: 'Mein Headset ist defekt (Mikrofon funktioniert nicht mehr). Bitte ein neues Jabra Evolve bestellen.', cat: 'Bestellung', prio: 'low', status: 'open', req: 'markus@firma.de' },
    { title: 'WLAN-Verbindung im Meetingraum 3 instabil', desc: 'Im Meetingraum 3 ist die WLAN-Verbindung seit dem Umbau sehr instabil. Video-Calls brechen ab.', cat: 'Netzwerk', prio: 'medium', status: 'open', req: 'sandra@firma.de' },
    { title: 'Excel stuerzt beim Oeffnen grosser Dateien ab', desc: 'Wenn ich die Quartalsauswertung (ca. 50MB) oeffne, stuerzt Excel nach 2-3 Minuten ab.', cat: 'Software', prio: 'medium', status: 'in_progress', req: 'anna@firma.de' },
    { title: 'Zugangskarte funktioniert nicht mehr', desc: 'Meine Zugangskarte wird am Haupteingang nicht mehr erkannt. Zugang nur noch mit Besucherausweis moeglich.', cat: 'Hardware', prio: 'high', status: 'open', req: 'peter@firma.de' },
    { title: 'Software-Update Adobe Creative Cloud', desc: 'Bitte Adobe CC auf allen Marketing-Rechnern auf die aktuelle Version aktualisieren.', cat: 'Software', prio: 'low', status: 'pending', req: 'julia@firma.de' },
    { title: 'Backup-Fehlermeldung Fileserver', desc: 'Das naeechtliche Backup des Fileservers ist mit Fehler E-4052 fehlgeschlagen. Logs anbei.', cat: 'Netzwerk', prio: 'critical', status: 'in_progress', req: 'markus@firma.de' },
    { title: 'Monitor flackert unregelmaessig', desc: 'Mein externer Dell-Monitor flackert seit einer Woche unregelmaessig. Kabel wurden bereits getauscht.', cat: 'Hardware', prio: 'low', status: 'resolved', req: 'hans@firma.de' },
    { title: 'Teams-Anrufe haben schlechte Audioqualitaet', desc: 'Bei Teams-Anrufen beschweren sich Gespraechspartner ueber Echo und schlechte Audioqualitaet.', cat: 'Software', prio: 'medium', status: 'open', req: 'thomas@firma.de' },
    { title: 'Netzlaufwerk nicht erreichbar', desc: 'Das Netzlaufwerk S: ist seit heute Morgen nicht mehr zugreifbar. Andere Laufwerke funktionieren.', cat: 'Netzwerk', prio: 'high', status: 'open', req: 'sandra@firma.de' }
  ];

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    await conn.query('UPDATE ticket_counters SET last_number = last_number + 1 WHERE year = ?', [year]);
    const [counter] = await conn.query('SELECT last_number FROM ticket_counters WHERE year = ?', [year]);
    const num = `#IT-${year}-${String(counter[0].last_number).padStart(4, '0')}`;

    const requesterId = userMap[t.req]?.id || allUsers[0].id;
    const assigneeId = (t.status !== 'open' && agentIds.length > 0) ? agentIds[i % agentIds.length] : null;
    const resolvedAt = t.status === 'resolved' ? 'NOW()' : 'NULL';

    const sla = new Date(Date.now() + (i < 5 ? -3600000 : 86400000)); // first 5 SLA breached for demo

    await conn.query(
      `INSERT IGNORE INTO tickets (ticket_number, title, description, category, priority, status, requester_id, assignee_id, source, sla_due_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'web', ?, ${resolvedAt})`,
      [num, t.title, t.desc, t.cat, t.prio, t.status, requesterId, assigneeId, sla]
    );
  }
  console.log('[OK] 15 Test-Tickets erstellt');

  // Add some comments to first few tickets
  const [ticketRows] = await conn.query('SELECT id FROM tickets ORDER BY id LIMIT 5');
  const commentTexts = [
    'Vielen Dank fuer die Meldung. Ich schaue mir das an.',
    'Koennen Sie bitte die genaue Fehlermeldung mitteilen?',
    'Das Problem wurde identifiziert. Wir arbeiten an der Loesung.',
    'Update: Wir warten auf ein Ersatzteil. Voraussichtliche Lieferung in 2 Tagen.',
    'Problem wurde behoben. Bitte pruefen Sie, ob alles funktioniert.'
  ];

  for (let i = 0; i < ticketRows.length; i++) {
    const agentId = agentIds[i % agentIds.length] || allUsers[0].id;
    await conn.query(
      'INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal) VALUES (?, ?, ?, ?)',
      [ticketRows[i].id, agentId, commentTexts[i], 0]
    );
    // Add an internal note on the first ticket
    if (i === 0) {
      await conn.query(
        'INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal) VALUES (?, ?, ?, ?)',
        [ticketRows[i].id, agentId, 'Interne Notiz: Geraet ist noch in Garantie, RMA einleiten.', 1]
      );
    }
  }
  console.log('[OK] Test-Kommentare erstellt');

  console.log('[OK] Testdaten eingefuegt');
}

main().catch(err => {
  console.error('Setup-Fehler:', err);
  process.exit(1);
});
