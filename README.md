# IT-Helpdesk & Asset Management System

Webbasiertes IT-Helpdesk mit Ticket-System, Asset-Verwaltung, Inventar, Netzwerk-Monitor, Knowledge Base, Onboarding und mehr.

## Quick Start

### Windows
1. `INSTALL-WINDOWS.bat` doppelklicken
2. Den Anweisungen folgen
3. `start.bat` doppelklicken
4. Browser öffnen: http://localhost:3000

### Linux (CentOS/Ubuntu)
```bash
chmod +x INSTALL-LINUX.sh
./INSTALL-LINUX.sh
```

### Shared Webspace (All-Inkl, cPanel)
```bash
node install-webspace.js
```

## Voraussetzungen
- Node.js 18+ (wird vom Installer automatisch installiert)
- MySQL 8.x oder MariaDB 10.x
- Webbrowser (Chrome, Firefox, Edge, Safari)

## Login
- **Admin:** Die Zugangsdaten werden bei der Installation festgelegt
- **Demo-Accounts:** (wenn mit `--demo` installiert)
  - Agent: `max@demo.local` / `demo123`
  - User: `hans@demo.local` / `demo123`

## Features
- Ticket-System (Web, E-Mail, Kanban)
- Asset-Verwaltung mit CSV-Import
- IT-Lager & Zubehör mit Mindestbeständen
- Lieferanten-Verwaltung mit Angebotsanfragen
- Bestellsystem mit Fortschritts-Workflow
- Netzwerk-Monitor (HTTP/ICMP)
- Knowledge Base
- Standorte-Verwaltung
- Onboarding (Neue Mitarbeiter)
- Antwortvorlagen
- Self-Service Portal
- Dark Mode
- White-Label / Branding
- Microsoft 365 Login (optional)
- Responsive Design

## Lizenz
Proprietär — Alle Rechte vorbehalten.
