# IT-Helpdesk & Asset Management System

Modulares, webbasiertes IT-Helpdesk mit Plugin-System. Ticket-Management, Knowledge Base, Standorte, Bestellungen — erweitert durch Plugins für Asset-Verwaltung, Netzwerk-Monitoring, Onboarding und mehr.

## Quick Install

### Linux / macOS (One-Liner)
```bash
curl -fsSL https://raw.githubusercontent.com/florianschroller-boop/it-helpdesk/main/github-install.sh | bash
```

Mit Demo-Daten:
```bash
curl -fsSL https://raw.githubusercontent.com/florianschroller-boop/it-helpdesk/main/github-install.sh | bash -s -- --demo
```

In ein bestimmtes Verzeichnis:
```bash
curl -fsSL https://raw.githubusercontent.com/florianschroller-boop/it-helpdesk/main/github-install.sh | bash -s -- --dir /opt/helpdesk --demo
```

### Windows
```powershell
git clone https://github.com/florianschroller-boop/it-helpdesk.git
cd it-helpdesk
node install.js
START.bat
```

### Manuell (alle Systeme)
```bash
git clone https://github.com/florianschroller-boop/it-helpdesk.git
cd it-helpdesk
npm install --production
node install.js
node api/index.js
```

## Updates

```bash
cd IT-Helpdesk
git pull
npm install --production
```
Server neustarten. Neue Migrationen werden beim Start automatisch erkannt.

## Voraussetzungen

| Komponente | Minimum | Empfohlen |
|-----------|---------|-----------|
| Node.js | 18.x | 20.x LTS |
| MySQL / MariaDB | 5.7 / 10.3 | 8.x / 10.11 |

## Kern-Features

- **Ticket-System** — Web-Erstellung, Kanban-Board, SLA-Tracking, Kommentare, Anhänge
- **Benutzerverwaltung** — Rollen (Admin/Agent/User), Selbst-Registrierung, Microsoft-Login
- **Knowledge Base** — Artikel mit Kategorien, Volltextsuche, Voting
- **Standorte** — Standort-Profile mit Ansprechpartner, verknüpft mit Assets/Netzwerk
- **Bestellungen** — 7-Schritt-Workflow mit Fortschrittsanzeige
- **Antwortvorlagen** — Vordefinierte Antworten mit intelligentem Auto-Vorschlag
- **Self-Service Portal** — Vereinfachte Ansicht für Endbenutzer
- **White-Label** — Firmenname, Logos, Farben, Du/Sie-Anrede
- **Dark Mode** — Vollständig, mit manueller Umschaltung
- **Plugin-System** — Erweiterbar durch ZIP-Upload oder `plugins/`-Ordner

## Plugins

| Plugin | Beschreibung |
|--------|-------------|
| **asset-management** | Hardware-Assets, IT-Lager, Lieferanten, CSV-Import, Angebotsanfragen |
| **network-monitor** | Geräte-Überwachung, Ping/HTTP-Checks, Status-Dashboard, Alerting |
| **onboarding-offboarding** | Mitarbeiter-Lifecycle, Action-Plan, Offboarding-Checkliste, Übergabeprotokoll |
| **ticket-analytics** | KPIs, SLA-Compliance, Agent-Performance, Trend-Charts, CSV-Export |
| **system-maintenance** | System-Updates einspielen, DB-Wartung, Backups, Wartungsmodus |
| **admin-wiki** | Internes Wiki mit Namespaces, Markdown, Versionierung |

Plugins installieren: **Admin → Plugins → ZIP hochladen** oder manuell nach `plugins/<name>/` kopieren.

## Plugin entwickeln

```
plugins/mein-plugin/
├── plugin.json     # { id, name, version, description, entryPoint }
└── index.js        # exports { activate(ctx), deactivate() }
```

Der Plugin-Kontext (`ctx`) bietet:
- `ctx.registerRoute(method, path, ...handlers)` — API-Route
- `ctx.registerSidebarItem({icon, label, route})` — Navigation
- `ctx.registerFrontendAsset('js', 'file.js')` — Frontend laden
- `ctx.registerHook(event, handler)` — Event-System
- `ctx.db.query(sql, params)` — Datenbank
- `ctx.setSetting(key, value)` / `ctx.getSetting(key)` — Settings

## Tech Stack

- **Backend:** Node.js, Express 5, MySQL (mysql2)
- **Frontend:** Vanilla HTML/CSS/JS (kein Build-Step)
- **Auth:** JWT (HttpOnly Cookies)
- **Design:** CSS Custom Properties, Inter Font, Dark Mode

## Lizenz

Proprietär — Alle Rechte vorbehalten.
