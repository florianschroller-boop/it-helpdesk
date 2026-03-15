#!/usr/bin/env node
/**
 * IT-Helpdesk — Interaktiver Installer v2.0
 * Modulare Version mit Plugin-System
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise(r => rl.question(`  ${q}${def ? ` [${def}]` : ''}: `, a => r(a.trim() || def || '')));
const pause = (msg) => new Promise(r => rl.question(`\n  ${msg || 'Weiter mit [Enter]...'}`, () => r()));
const ROOT = __dirname;
const isWin = process.platform === 'win32';
const hr = () => console.log('  ' + '\u2500'.repeat(50));
function commandExists(cmd) { try { execSync(isWin?`where ${cmd}`:`which ${cmd}`,{stdio:'pipe'}); return true; } catch { return false; } }
function getVersion(cmd) { try { return execSync(`${cmd} --version`,{stdio:'pipe'}).toString().trim().split('\n')[0]; } catch { return null; } }

async function main() {
  console.log(`
  \u2554${'═'.repeat(44)}\u2557
  \u2551  IT-Helpdesk v2.0 — Installer              \u2551
  \u2551  Modulares System mit Plugin-Architektur    \u2551
  \u255A${'═'.repeat(44)}\u255D

  Kern:    Tickets, Benutzer, Knowledge Base,
           Standorte, Bestellungen, Vorlagen

  Plugins: Asset-Verwaltung, Netzwerk-Monitor,
           Onboarding/Offboarding, Auswertungen,
           Systemwartung, Admin-Wiki u.v.m.
`);
  hr();

  // SCHRITT 1
  console.log('\n  SCHRITT 1/6: Voraussetzungen\n');
  const nv = getVersion('node');
  if (nv && parseInt(nv.replace(/[^0-9.]/g,'')) >= 18) { console.log('  \u2713 Node.js ' + nv); }
  else { console.log('  \u2717 Node.js ' + (nv||'nicht gefunden') + ' (mind. v18)\n');
    if (isWin) console.log('    \u2192 https://nodejs.org/de/download (LTS .msi)');
    else console.log('    Ubuntu: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs\n    CentOS: curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo yum install -y nodejs');
    await pause('Node.js installieren, Terminal neu oeffnen, dann [Enter]...');
    if (!commandExists('node')) { console.log('  \u2717 Abbruch.'); process.exit(1); }
  }
  if (commandExists('mysql')||commandExists('mariadb')) console.log('  \u2713 MySQL/MariaDB gefunden');
  else { console.log('  \u26A0 MySQL nicht gefunden\n');
    if (isWin) console.log('    \u2192 XAMPP: https://www.apachefriends.org/de/\n    \u2192 MySQL: https://dev.mysql.com/downloads/installer/\n    \u2192 MariaDB: https://mariadb.org/download/');
    else console.log('    Ubuntu: sudo apt-get install -y mysql-server\n    CentOS: sudo yum install -y mariadb-server');
    await pause('MySQL installieren und starten, dann [Enter]...');
  }
  await pause(); hr();

  // SCHRITT 2
  console.log('\n  SCHRITT 2/6: npm-Pakete installieren\n');
  await pause('npm install starten mit [Enter]...');
  try { execSync(isWin?'npm.cmd install --production':'npm install --production',{cwd:ROOT,stdio:'inherit',timeout:300000}); console.log('\n  \u2713 Installiert'); }
  catch { console.log('\n  \u2717 Fehlgeschlagen'); process.exit(1); }
  await pause(); hr();

  // SCHRITT 3
  console.log('\n  SCHRITT 3/6: Datenbank\n');
  const dbHost = await ask('MySQL Host','localhost'), dbPort = await ask('Port','3306');
  const dbUser = await ask('Benutzer','root'), dbPass = await ask('Passwort','');
  const dbName = await ask('Datenbank','helpdesk');
  console.log('\n  Teste...');
  let conn;
  try { const mysql = require(path.join(ROOT,'node_modules','mysql2','promise'));
    conn = await mysql.createConnection({host:dbHost,port:parseInt(dbPort),user:dbUser,password:dbPass,multipleStatements:true});
    console.log('  \u2713 Verbindung OK');
  } catch(e) { console.log('  \u2717 ' + e.message); process.exit(1); }
  await pause(); hr();

  // SCHRITT 4
  console.log('\n  SCHRITT 4/6: Tabellen erstellen\n');
  await pause('Einrichten mit [Enter]...');
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);
  console.log('  \u2713 Datenbank "'+dbName+'"');
  const migDir = path.join(ROOT,'migrations');
  if (fs.existsSync(migDir)) for (const f of fs.readdirSync(migDir).filter(f=>f.endsWith('.sql')).sort()) {
    try { await conn.query(fs.readFileSync(path.join(migDir,f),'utf8')); console.log('  \u2713 '+f); }
    catch(e) { console.log(e.message.includes('exists')||e.message.includes('Duplicate')?'  \u2713 '+f+' (vorhanden)':'  \u26A0 '+f); }
  }
  await pause(); hr();

  // SCHRITT 5
  console.log('\n  SCHRITT 5/6: Server-Konfiguration\n');

  // Detect server IP addresses
  const os = require('os');
  const nets = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(nets)) {
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) ips.push(cfg.address);
    }
  }

  if (ips.length > 0) {
    console.log('  Erkannte IP-Adresse(n) dieses Servers:');
    ips.forEach(ip => console.log('    \u2192 ' + ip));
    console.log('');
  }

  const port = await ask('Server-Port','3000');
  const defaultUrl = ips.length > 0 ? `http://${ips[0]}:${port}` : `http://localhost:${port}`;
  const url = await ask('URL', defaultUrl);
  fs.writeFileSync(path.join(ROOT,'.env'),`DB_HOST=${dbHost}\nDB_PORT=${dbPort}\nDB_NAME=${dbName}\nDB_USER=${dbUser}\nDB_PASSWORD=${dbPass}\nAPP_URL=${url}\nAPP_PORT=${port}\nAPP_SECRET_KEY=${crypto.randomBytes(32).toString('hex')}\nMAIL_SMTP_HOST=\nMAIL_SMTP_PORT=587\nMAIL_SMTP_USER=\nMAIL_SMTP_PASS=\nMAIL_FROM_ADDRESS=helpdesk@localhost\nMAIL_FROM_NAME=IT-Helpdesk\nMAIL_IMAP_HOST=\nMAIL_IMAP_PORT=993\nMAIL_IMAP_USER=\nMAIL_IMAP_PASS=\nPING_INTERVAL_MINUTES=5\nMAIL_POLL_INTERVAL_MINUTES=2\nUPLOAD_MAX_SIZE_MB=20\nUPLOAD_PATH=./uploads\nNETWORK_CHECK_METHOD=http\nMS_OAUTH_ENABLED=false\nMS_OAUTH_CLIENT_ID=\nMS_OAUTH_CLIENT_SECRET=\nMS_OAUTH_TENANT_ID=common\nMS_OAUTH_REDIRECT_URI=${url}/api/auth/microsoft/callback\n`);
  for (const d of ['uploads','backups']) { const p=path.join(ROOT,d); if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
  await conn.end();
  await pause(); hr();

  // SCHRITT 6
  console.log('\n  SCHRITT 6/6: Fertig!\n');
  if (isWin) { fs.writeFileSync(path.join(ROOT,'START.bat'),'@echo off\nchcp 65001 >nul 2>&1\ntitle IT-Helpdesk\n:loop\necho Starte IT-Helpdesk...\nnode api\\index.js\ntimeout /t 2 /nobreak >nul\ngoto loop\n'); console.log('  \u2713 START.bat'); }
  else { fs.writeFileSync(path.join(ROOT,'start.sh'),'#!/bin/bash\ncd "$(dirname "$0")"\nwhile true; do\n  node api/index.js\n  sleep 2\ndone\n'); try{fs.chmodSync(path.join(ROOT,'start.sh'),'755');}catch{} console.log('  \u2713 start.sh'); }
  const pc = fs.existsSync(path.join(ROOT,'plugins')) ? fs.readdirSync(path.join(ROOT,'plugins'),{withFileTypes:true}).filter(d=>d.isDirectory()).length : 0;

  console.log(`
  ${'═'.repeat(46)}
  Datenbank bereit — Server kann gestartet werden!
  ${'═'.repeat(46)}

  Server starten:  ${isWin ? 'START.bat doppelklicken' : './start.sh'}

  Dann im Browser oeffnen:

    \u2192  ${url}

  ${ips.length > 0 ? 'Von anderen Geraeten im Netzwerk:\n' + ips.map(ip => '    \u2192  http://' + ip + ':' + port).join('\n') : ''}

  Der Setup-Assistent im Browser fuehrt Sie durch
  die weitere Einrichtung (Admin, Firma, E-Mail).
`);
  rl.close();
}
main().catch(e => { console.error('\n  FEHLER:', e.message); process.exit(1); });
