#!/usr/bin/env node
/**
 * ============================================
 * IT-Helpdesk — Interaktiver Installer
 * ============================================
 *
 * Installiert alle Voraussetzungen und richtet das System ein.
 * Funktioniert auf Windows, Linux (CentOS/Ubuntu) und macOS.
 *
 * Nutzung:
 *   node install.js
 *   node install.js --demo     (mit Demodaten)
 *   node install.js --unattended --db-host=localhost --db-user=root --db-pass= --db-name=helpdesk --admin-email=admin@firma.de --admin-pass=admin123
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def = '') => new Promise(resolve => rl.question(`${q}${def ? ` [${def}]` : ''}: `, a => resolve(a.trim() || def)));

const ROOT = __dirname;
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// Parse CLI args
const args = {};
process.argv.slice(2).forEach(a => {
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    args[k] = v !== undefined ? v : true;
  }
});

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', timeout: 120000, ...opts })?.toString().trim();
  } catch (e) {
    if (!opts.ignoreError) throw e;
    return '';
  }
}

function commandExists(cmd) {
  try {
    if (isWin) {
      execSync(`where ${cmd}`, { stdio: 'pipe' });
    } else {
      execSync(`which ${cmd}`, { stdio: 'pipe' });
    }
    return true;
  } catch { return false; }
}

// ============================================
// Step 1: Check & Install Node.js
// ============================================
async function checkNode() {
  console.log('\n[1/6] Node.js pruefen...');

  if (commandExists('node')) {
    const ver = run('node --version', { silent: true });
    const major = parseInt(ver.replace('v', ''));
    if (major >= 18) {
      console.log(`  [OK] Node.js ${ver} gefunden`);
      return;
    }
    console.log(`  [!] Node.js ${ver} ist zu alt (mind. v18 erforderlich)`);
  } else {
    console.log('  [!] Node.js nicht gefunden');
  }

  console.log('  Installiere Node.js...');

  if (isWin) {
    console.log('  Bitte Node.js manuell installieren: https://nodejs.org/');
    console.log('  Danach dieses Script erneut ausfuehren.');
    process.exit(1);
  } else if (isMac) {
    run('brew install node || curl -fsSL https://fnm.vercel.app/install | bash && fnm install 20', { ignoreError: true });
  } else {
    // Linux (CentOS/Ubuntu)
    if (fs.existsSync('/etc/centos-release') || fs.existsSync('/etc/redhat-release')) {
      run('curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -');
      run('sudo yum install -y nodejs');
    } else {
      run('curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -');
      run('sudo apt-get install -y nodejs');
    }
  }

  if (!commandExists('node')) {
    console.log('  [FEHLER] Node.js konnte nicht installiert werden.');
    process.exit(1);
  }
  console.log(`  [OK] Node.js ${run('node --version', { silent: true })} installiert`);
}

// ============================================
// Step 2: Check & Install MySQL
// ============================================
async function checkMySQL() {
  console.log('\n[2/6] MySQL pruefen...');

  if (commandExists('mysql')) {
    console.log(`  [OK] MySQL Client gefunden`);
    return;
  }

  if (commandExists('mariadb')) {
    console.log('  [OK] MariaDB gefunden (kompatibel)');
    return;
  }

  console.log('  [!] MySQL/MariaDB nicht gefunden');

  if (args.unattended) {
    console.log('  Ueberspringe MySQL-Installation (unattended mode)');
    console.log('  Stellen Sie sicher, dass MySQL/MariaDB erreichbar ist.');
    return;
  }

  const installDb = await ask('  MySQL/MariaDB installieren? (j/n)', 'n');
  if (installDb.toLowerCase() !== 'j') {
    console.log('  OK, uebersprungen. Stellen Sie sicher, dass ein MySQL-Server erreichbar ist.');
    return;
  }

  if (isWin) {
    console.log('  Fuer Windows empfehlen wir:');
    console.log('    - XAMPP: https://www.apachefriends.org/');
    console.log('    - MySQL Community: https://dev.mysql.com/downloads/');
    console.log('  Bitte manuell installieren und danach erneut starten.');
  } else if (fs.existsSync('/etc/centos-release') || fs.existsSync('/etc/redhat-release')) {
    run('sudo yum install -y mariadb-server mariadb');
    run('sudo systemctl start mariadb');
    run('sudo systemctl enable mariadb');
    console.log('  [OK] MariaDB installiert und gestartet');
  } else {
    run('sudo apt-get install -y mysql-server');
    run('sudo systemctl start mysql');
    console.log('  [OK] MySQL installiert und gestartet');
  }
}

// ============================================
// Step 3: Install npm dependencies
// ============================================
async function installDeps() {
  console.log('\n[3/6] npm-Pakete installieren...');
  const npmCmd = isWin ? 'npm.cmd' : 'npm';

  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    run(`${npmCmd} install --production`, { cwd: ROOT });
  } else {
    console.log('  [OK] node_modules existiert bereits');
    run(`${npmCmd} install --production`, { cwd: ROOT, silent: true });
  }
  console.log('  [OK] Abhaengigkeiten installiert');
}

// ============================================
// Step 4: Configure .env
// ============================================
async function configureEnv() {
  console.log('\n[4/6] Konfiguration...');

  const envPath = path.join(ROOT, '.env');
  const envExists = fs.existsSync(envPath);

  let config = {};

  if (args.unattended) {
    config = {
      DB_HOST: args['db-host'] || 'localhost',
      DB_PORT: args['db-port'] || '3306',
      DB_NAME: args['db-name'] || 'helpdesk',
      DB_USER: args['db-user'] || 'root',
      DB_PASSWORD: args['db-pass'] || '',
      APP_PORT: args['port'] || '3000',
      APP_URL: args['url'] || 'http://localhost:3000'
    };
  } else if (envExists) {
    const overwrite = await ask('  .env existiert bereits. Ueberschreiben? (j/n)', 'n');
    if (overwrite.toLowerCase() !== 'j') {
      console.log('  [OK] Bestehende .env wird verwendet');
      return;
    }
  }

  if (!args.unattended) {
    console.log('\n  --- Datenbank-Konfiguration ---');
    config.DB_HOST = await ask('  MySQL Host', 'localhost');
    config.DB_PORT = await ask('  MySQL Port', '3306');
    config.DB_NAME = await ask('  Datenbank-Name', 'helpdesk');
    config.DB_USER = await ask('  MySQL Benutzer', 'root');
    config.DB_PASSWORD = await ask('  MySQL Passwort', '');

    console.log('\n  --- Anwendung ---');
    config.APP_PORT = await ask('  Server-Port', '3000');
    config.APP_URL = await ask('  Oeffentliche URL', `http://localhost:${config.APP_PORT}`);
  }

  // Generate secret
  const crypto = require('crypto');
  config.APP_SECRET_KEY = crypto.randomBytes(32).toString('hex');

  // Write .env
  const envContent = `# IT-Helpdesk Konfiguration
# Erstellt am ${new Date().toISOString()}

# Datenbank
DB_HOST=${config.DB_HOST}
DB_PORT=${config.DB_PORT}
DB_NAME=${config.DB_NAME}
DB_USER=${config.DB_USER}
DB_PASSWORD=${config.DB_PASSWORD}

# Anwendung
APP_URL=${config.APP_URL}
APP_PORT=${config.APP_PORT}
APP_SECRET_KEY=${config.APP_SECRET_KEY}

# E-Mail (spaeter konfigurierbar ueber Einstellungen)
MAIL_SMTP_HOST=
MAIL_SMTP_PORT=587
MAIL_SMTP_USER=
MAIL_SMTP_PASS=
MAIL_FROM_ADDRESS=helpdesk@localhost
MAIL_FROM_NAME=IT-Helpdesk

MAIL_IMAP_HOST=
MAIL_IMAP_PORT=993
MAIL_IMAP_USER=
MAIL_IMAP_PASS=

PING_INTERVAL_MINUTES=5
MAIL_POLL_INTERVAL_MINUTES=2
UPLOAD_MAX_SIZE_MB=20
UPLOAD_PATH=./uploads
NETWORK_CHECK_METHOD=http

MS_OAUTH_ENABLED=false
MS_OAUTH_CLIENT_ID=
MS_OAUTH_CLIENT_SECRET=
MS_OAUTH_TENANT_ID=common
MS_OAUTH_REDIRECT_URI=${config.APP_URL}/api/auth/microsoft/callback
`;

  fs.writeFileSync(envPath, envContent);
  console.log('  [OK] .env erstellt');

  return config;
}

// ============================================
// Step 5: Setup Database
// ============================================
async function setupDatabase(config) {
  console.log('\n[5/6] Datenbank einrichten...');

  // Load .env
  require('dotenv').config({ path: path.join(ROOT, '.env') });

  const mysql = require(path.join(ROOT, 'node_modules', 'mysql2', 'promise'));
  const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));

  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });
  } catch (err) {
    console.log(`  [FEHLER] MySQL-Verbindung fehlgeschlagen: ${err.message}`);
    console.log('  Pruefen Sie die Zugangsdaten in der .env-Datei.');
    process.exit(1);
  }

  const dbName = process.env.DB_NAME || 'helpdesk';
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);
  console.log(`  [OK] Datenbank "${dbName}" bereit`);

  // Run all migrations in order
  const migrationsDir = path.join(ROOT, 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of migrationFiles) {
    try {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await conn.query(sql);
      console.log(`  [OK] Migration: ${file}`);
    } catch (err) {
      // Ignore "already exists" errors
      if (!err.message.includes('already exists') && !err.message.includes('Duplicate')) {
        console.log(`  [WARN] ${file}: ${err.message.substring(0, 80)}`);
      }
    }
  }

  // Create admin user
  const [admins] = await conn.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");

  if (admins.length === 0) {
    let adminEmail, adminPass, adminName;

    if (args.unattended) {
      adminEmail = args['admin-email'] || 'admin@helpdesk.local';
      adminPass = args['admin-pass'] || 'admin123';
      adminName = args['admin-name'] || 'Administrator';
    } else {
      console.log('\n  --- Admin-Benutzer ---');
      adminName = await ask('  Admin-Name', 'Administrator');
      adminEmail = await ask('  Admin-E-Mail', 'admin@helpdesk.local');
      adminPass = await ask('  Admin-Passwort', 'admin123');
    }

    const hash = await bcrypt.hash(adminPass, 12);
    await conn.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [adminName, adminEmail, hash, 'admin']);
    console.log(`  [OK] Admin "${adminName}" erstellt (${adminEmail})`);
  } else {
    console.log('  [OK] Admin existiert bereits');
  }

  // Default settings
  const defaults = {
    'company_name': 'IT-Helpdesk',
    'sla_default_hours': '24',
    'ticket_categories': JSON.stringify(['Hardware', 'Software', 'Netzwerk', 'Zugang/Passwort', 'Bestellung', 'Sonstiges']),
    'network_check_method': 'http',
    'wl_company_name': 'IT-Helpdesk',
    'wl_formality': 'sie',
    'wl_registration_enabled': 'true',
    'wl_primary_color': '#4F46E5',
    'departments': JSON.stringify(['IT', 'Vertrieb', 'Marketing', 'Buchhaltung', 'Personal', 'Geschaeftsfuehrung']),
    'positions': JSON.stringify(['Sachbearbeiter/in', 'Teamleiter/in', 'Abteilungsleiter/in', 'Geschaeftsfuehrer/in'])
  };

  for (const [key, value] of Object.entries(defaults)) {
    await conn.query('INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_name=key_name', [key, value]);
  }

  // KB categories
  const kbCats = [
    { name: 'Hardware', slug: 'hardware', icon: 'laptop', sort_order: 1 },
    { name: 'Software', slug: 'software', icon: 'code', sort_order: 2 },
    { name: 'Netzwerk', slug: 'netzwerk', icon: 'wifi', sort_order: 3 },
    { name: 'Anleitungen', slug: 'anleitungen', icon: 'book', sort_order: 4 }
  ];
  for (const cat of kbCats) {
    await conn.query('INSERT IGNORE INTO kb_categories (name, slug, icon, sort_order) VALUES (?, ?, ?, ?)',
      [cat.name, cat.slug, cat.icon, cat.sort_order]);
  }

  // Generate invite key
  const crypto = require('crypto');
  const inviteKey = crypto.randomBytes(4).toString('hex').toUpperCase();
  await conn.query('INSERT IGNORE INTO invite_keys (key_code, label, created_by) VALUES (?, ?, 1)', [inviteKey, 'Standard']);
  await conn.query('INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_name=key_name',
    ['mailhook_api_key', crypto.randomBytes(32).toString('hex')]);

  console.log(`  [OK] Einladungsschluessel: ${inviteKey}`);

  // Demo data?
  if (args.demo || (!args.unattended && (await ask('\n  Demodaten einfuegen? (j/n)', 'j')).toLowerCase() === 'j')) {
    await insertDemoData(conn, bcrypt);
  }

  await conn.end();
}

async function insertDemoData(conn, bcrypt) {
  console.log('  Demodaten werden eingefuegt...');

  const hash = await bcrypt.hash('demo123', 12);

  // Users
  const users = [
    ['Max Mustermann', 'max@demo.local', hash, 'agent', 'IT', 'Serverraum'],
    ['Erika Muster', 'erika@demo.local', hash, 'agent', 'IT', 'Serverraum'],
    ['Hans Schmidt', 'hans@demo.local', hash, 'user', 'Vertrieb', 'Buero 1'],
    ['Anna Weber', 'anna@demo.local', hash, 'user', 'Buchhaltung', 'Buero 2'],
    ['Peter Meyer', 'peter@demo.local', hash, 'user', 'Vertrieb', 'Buero 1'],
    ['Julia Klein', 'julia@demo.local', hash, 'user', 'Marketing', 'Buero 3']
  ];
  for (const u of users) {
    await conn.query('INSERT IGNORE INTO users (name, email, password_hash, role, department, location) VALUES (?, ?, ?, ?, ?, ?)', u);
  }

  // Tickets
  const year = new Date().getFullYear();
  await conn.query('INSERT IGNORE INTO ticket_counters (year, last_number) VALUES (?, 0)', [year]);

  const tickets = [
    { title: 'Laptop faehrt nicht hoch', cat: 'Hardware', prio: 'high', status: 'open', req: 'hans@demo.local' },
    { title: 'Outlook synchronisiert nicht', cat: 'Software', prio: 'high', status: 'in_progress', req: 'anna@demo.local' },
    { title: 'Neuen Benutzer anlegen', cat: 'Zugang/Passwort', prio: 'medium', status: 'open', req: 'peter@demo.local' },
    { title: 'Drucker druckt leere Seiten', cat: 'Hardware', prio: 'medium', status: 'pending', req: 'julia@demo.local' },
    { title: 'VPN-Verbindung instabil', cat: 'Netzwerk', prio: 'high', status: 'in_progress', req: 'hans@demo.local' },
    { title: 'Passwort zuruecksetzen', cat: 'Zugang/Passwort', prio: 'medium', status: 'resolved', req: 'anna@demo.local' }
  ];

  const [allUsers] = await conn.query('SELECT id, email, role FROM users');
  const agentIds = allUsers.filter(u => u.role === 'agent' || u.role === 'admin').map(u => u.id);
  const userMap = {};
  allUsers.forEach(u => userMap[u.email] = u);

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    await conn.query('UPDATE ticket_counters SET last_number = last_number + 1 WHERE year = ?', [year]);
    const [counter] = await conn.query('SELECT last_number FROM ticket_counters WHERE year = ?', [year]);
    const num = `#IT-${year}-${String(counter[0].last_number).padStart(4, '0')}`;
    const reqId = userMap[t.req]?.id || allUsers[0].id;
    const assignId = t.status !== 'open' && agentIds.length > 0 ? agentIds[i % agentIds.length] : null;
    const slaDue = new Date(Date.now() + 86400000);
    const resolved = t.status === 'resolved' ? 'NOW()' : 'NULL';

    await conn.query(
      `INSERT IGNORE INTO tickets (ticket_number, title, category, priority, status, requester_id, assignee_id, source, sla_due_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'web', ?, ${resolved})`,
      [num, t.title, t.cat, t.prio, t.status, reqId, assignId, slaDue]
    );
  }

  // Locations
  const locations = [
    ['Serverraum', 'serverraum', 'Musterstr. 1, UG', 'Max Mustermann', '0800-1234', 1],
    ['Buero 1', 'buero-1', 'Musterstr. 1, 1. OG', 'Hans Schmidt', '0800-2345', 2],
    ['Buero 2', 'buero-2', 'Musterstr. 1, 2. OG', 'Anna Weber', '0800-3456', 3]
  ];
  for (const l of locations) {
    await conn.query('INSERT IGNORE INTO locations (name, slug, address, contact_name, contact_phone, sort_order) VALUES (?, ?, ?, ?, ?, ?)', l);
  }

  // Response templates
  const templates = [
    ['Begruessung', 'Hallo {{name}},\n\nvielen Dank fuer Ihre Anfrage. Wir kuemmern uns darum.\n\nMit freundlichen Gruessen\nIhr IT-Team', null],
    ['Passwort zurueckgesetzt', 'Hallo {{name}},\n\nIhr Passwort wurde zurueckgesetzt.\n\nMit freundlichen Gruessen\nIhr IT-Team', 'Zugang/Passwort'],
    ['Ticket geloest', 'Hallo {{name}},\n\nIhr Anliegen wurde bearbeitet. Bitte pruefen Sie, ob alles funktioniert.\n\nMit freundlichen Gruessen\nIhr IT-Team', null]
  ];
  for (const t of templates) {
    await conn.query('INSERT IGNORE INTO response_templates (title, content, category) VALUES (?, ?, ?)', t);
  }

  console.log('  [OK] Demodaten: 6 Benutzer, 6 Tickets, 3 Standorte, 3 Vorlagen');
  console.log('  Demo-Logins: max@demo.local / demo123 (Agent), hans@demo.local / demo123 (User)');
}

// ============================================
// Step 6: Create start scripts
// ============================================
async function createStartScripts() {
  console.log('\n[6/6] Start-Scripts erstellen...');

  if (isWin) {
    fs.writeFileSync(path.join(ROOT, 'start.bat'), `@echo off
echo Starte IT-Helpdesk...
cd /d "%~dp0"
node api\\index.js
pause
`);
    fs.writeFileSync(path.join(ROOT, 'start-dev.bat'), `@echo off
echo Starte IT-Helpdesk (Entwicklungsmodus)...
cd /d "%~dp0"
node --watch api\\index.js
pause
`);
    console.log('  [OK] start.bat, start-dev.bat erstellt');
  } else {
    fs.writeFileSync(path.join(ROOT, 'start.sh'), `#!/bin/bash
cd "$(dirname "$0")"
echo "Starte IT-Helpdesk..."
node api/index.js
`);
    fs.chmodSync(path.join(ROOT, 'start.sh'), '755');

    // systemd service file
    const servicePath = path.join(ROOT, 'helpdesk.service');
    fs.writeFileSync(servicePath, `[Unit]
Description=IT-Helpdesk
After=network.target mysql.service mariadb.service

[Service]
Type=simple
User=www-data
WorkingDirectory=${ROOT}
ExecStart=/usr/bin/node ${ROOT}/api/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`);
    console.log('  [OK] start.sh, helpdesk.service erstellt');
    console.log('  Fuer systemd: sudo cp helpdesk.service /etc/systemd/system/ && sudo systemctl enable helpdesk && sudo systemctl start helpdesk');
  }

  // uploads dir
  const uploadsDir = path.join(ROOT, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, '.gitkeep'), '');
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║       IT-Helpdesk Installer          ║');
  console.log('  ║       v1.0.0                         ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');

  await checkNode();
  await checkMySQL();
  await installDeps();
  const config = await configureEnv();
  await setupDatabase(config);
  await createStartScripts();

  const port = process.env.APP_PORT || '3000';

  console.log('\n');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   Installation abgeschlossen!        ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  if (isWin) {
    console.log(`  Server starten:  start.bat`);
  } else {
    console.log(`  Server starten:  ./start.sh`);
    console.log(`  Als Dienst:      sudo systemctl start helpdesk`);
  }
  console.log(`  Im Browser:      http://localhost:${port}`);
  console.log('');

  rl.close();
}

main().catch(err => {
  console.error('\n[FEHLER]', err.message);
  process.exit(1);
});
