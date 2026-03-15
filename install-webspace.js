#!/usr/bin/env node
/**
 * ============================================
 * IT-Helpdesk — Webspace-Installer
 * ============================================
 *
 * Fuer Shared Hosting (All-Inkl, cPanel, Plesk).
 * Generiert:
 *  - .htaccess fuer Apache Reverse Proxy
 *  - Cron-Job-Befehle
 *  - Deployment-Anleitung
 *
 * Nutzung: node install-webspace.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def = '') => new Promise(resolve => rl.question(`${q} [${def}]: `, a => resolve(a.trim() || def)));

async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   IT-Helpdesk — Webspace-Setup           ║');
  console.log('  ║   Fuer All-Inkl, cPanel, Plesk            ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  const domain = await ask('Domain (z.B. helpdesk.firma.de)', 'helpdesk.example.com');
  const nodePort = await ask('Node.js Port', '3000');
  const dbHost = await ask('MySQL Host', 'localhost');
  const dbUser = await ask('MySQL Benutzer', '');
  const dbPass = await ask('MySQL Passwort', '');
  const dbName = await ask('MySQL Datenbank', 'helpdesk');
  const webRoot = await ask('Web-Root Pfad', `/www/htdocs/helpdesk`);

  // Generate .env
  const crypto = require('crypto');
  const envContent = `DB_HOST=${dbHost}
DB_PORT=3306
DB_NAME=${dbName}
DB_USER=${dbUser}
DB_PASSWORD=${dbPass}
APP_URL=https://${domain}
APP_PORT=${nodePort}
APP_SECRET_KEY=${crypto.randomBytes(32).toString('hex')}
MAIL_SMTP_HOST=
MAIL_SMTP_PORT=587
MAIL_SMTP_USER=
MAIL_SMTP_PASS=
MAIL_FROM_ADDRESS=helpdesk@${domain}
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
MS_OAUTH_REDIRECT_URI=https://${domain}/api/auth/microsoft/callback
`;

  fs.writeFileSync('.env', envContent);
  console.log('\n[OK] .env erstellt');

  // .htaccess for Apache reverse proxy
  const htaccess = `# IT-Helpdesk — Apache Reverse Proxy
# Leitet alle Anfragen an den Node.js-Server weiter

RewriteEngine On

# HTTPS erzwingen
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]

# Node.js Reverse Proxy
RewriteRule ^(.*)$ http://127.0.0.1:${nodePort}/$1 [P,L]

# Falls mod_proxy nicht verfuegbar ist (All-Inkl):
# Verwenden Sie stattdessen den Node.js-Selector in cPanel/Plesk
`;

  fs.writeFileSync('.htaccess', htaccess);
  console.log('[OK] .htaccess erstellt');

  // Deployment guide
  const guide = `
  ╔═══════════════════════════════════════════════════╗
  ║   Deployment-Anleitung: ${domain}
  ╚═══════════════════════════════════════════════════╝

  VARIANTE A: Node.js-Selector (empfohlen fuer All-Inkl, cPanel)
  ─────────────────────────────────────────────────────
  1. Alle Dateien per FTP/SFTP nach ${webRoot} hochladen
  2. cPanel → "Setup Node.js App" oder Plesk → "Node.js"
     - Node.js Version: 18 oder hoeher
     - Application root: ${webRoot}
     - Application startup file: api/index.js
     - Port: wird automatisch vergeben
  3. "NPM Install" im Node.js-Selector klicken
  4. App starten

  VARIANTE B: SSH-Zugang
  ─────────────────────────────────────────────────────
  1. Per SSH verbinden
  2. cd ${webRoot}
  3. node install.js --demo
  4. Fuer dauerhaften Betrieb:
     npm install -g pm2
     pm2 start api/index.js --name helpdesk
     pm2 save
     pm2 startup

  CRON-JOBS (optional, fuer E-Mail-Polling):
  ─────────────────────────────────────────────────────
  # E-Mail-Polling wird automatisch vom Server ausgefuehrt.
  # Falls der Server mal abstuerzt, Watchdog-Cron:
  */5 * * * * cd ${webRoot} && (curl -s http://127.0.0.1:${nodePort}/api/auth/branding > /dev/null || node api/index.js &)

  MySQL-DATENBANK:
  ─────────────────────────────────────────────────────
  Host:     ${dbHost}
  Benutzer: ${dbUser}
  Datenbank: ${dbName}

  Die Datenbank-Tabellen werden beim ersten Start automatisch erstellt.
  Fuehren Sie dazu einmalig aus: node install.js --demo

  URL: https://${domain}
`;

  console.log(guide);

  fs.writeFileSync('DEPLOY-GUIDE.txt', guide);
  console.log('[OK] DEPLOY-GUIDE.txt erstellt');

  rl.close();
}

main().catch(err => {
  console.error('[FEHLER]', err.message);
  process.exit(1);
});
