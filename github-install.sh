#!/bin/bash
# ============================================
# IT-Helpdesk — GitHub Installer
#
# Nutzung:
#   curl -fsSL https://raw.githubusercontent.com/florianschroller-boop/it-helpdesk/main/github-install.sh | bash
#   curl -fsSL ... | bash -s -- --demo --dir /opt/helpdesk
# ============================================

set -e

INSTALL_DIR="${HOME}/IT-Helpdesk"
WITH_DEMO=false
BRANCH="main"
REPO="https://github.com/florianschroller-boop/it-helpdesk.git"

while [[ $# -gt 0 ]]; do
  case $1 in
    --demo) WITH_DEMO=true; shift ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    *) shift ;;
  esac
done

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  IT-Helpdesk — GitHub Installer          ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Detect OS
OS="unknown"
PKG=""
if [ -f /etc/debian_version ]; then
  OS="debian"
  PKG="apt-get"
elif [ -f /etc/redhat-release ]; then
  OS="rhel"
  PKG="yum"
  if command -v dnf &>/dev/null; then PKG="dnf"; fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS="mac"
  PKG="brew"
fi

echo "  System: $OS"
echo ""

# ============================================
# [1/5] System-Abhaengigkeiten
# ============================================
echo "  [1/5] System-Abhaengigkeiten pruefen & installieren..."
echo ""

# ---- curl ----
if ! command -v curl &>/dev/null; then
  echo "  → curl installieren..."
  if [ "$PKG" = "apt-get" ]; then apt-get update -qq && apt-get install -y -qq curl; fi
  if [ "$PKG" = "yum" ] || [ "$PKG" = "dnf" ]; then $PKG install -y -q curl; fi
  echo "  ✓ curl installiert"
fi

# ---- git ----
if ! command -v git &>/dev/null; then
  echo "  → git installieren..."
  if [ "$PKG" = "apt-get" ]; then apt-get update -qq && apt-get install -y -qq git; fi
  if [ "$PKG" = "yum" ] || [ "$PKG" = "dnf" ]; then $PKG install -y -q git; fi
  if [ "$PKG" = "brew" ]; then brew install git; fi
  if command -v git &>/dev/null; then
    echo "  ✓ git installiert"
  else
    echo "  ✗ git konnte nicht installiert werden"
    exit 1
  fi
else
  echo "  ✓ git vorhanden"
fi

# ---- Node.js ----
NEED_NODE=false
if ! command -v node &>/dev/null; then
  NEED_NODE=true
else
  NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d 'v')
  if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "  ⚠ Node.js $(node -v) zu alt (mind. v18)"
    NEED_NODE=true
  fi
fi

if [ "$NEED_NODE" = true ]; then
  echo "  → Node.js 20 installieren..."
  if [ "$OS" = "debian" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
  elif [ "$OS" = "rhel" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    $PKG install -y -q nodejs
  elif [ "$OS" = "mac" ]; then
    brew install node
  else
    echo "  ✗ Automatische Node.js-Installation nicht moeglich."
    echo "    Bitte manuell installieren: https://nodejs.org/"
    exit 1
  fi

  if command -v node &>/dev/null; then
    echo "  ✓ Node.js $(node -v) installiert"
  else
    echo "  ✗ Node.js-Installation fehlgeschlagen"
    exit 1
  fi
else
  echo "  ✓ Node.js $(node -v)"
fi

# ---- MySQL/MariaDB ----
if command -v mysql &>/dev/null || command -v mariadb &>/dev/null; then
  echo "  ✓ MySQL/MariaDB vorhanden"
else
  echo ""
  echo "  ⚠ MySQL/MariaDB nicht gefunden."
  echo ""
  read -p "  MySQL/MariaDB jetzt installieren? (j/n) [j]: " INSTALL_DB
  INSTALL_DB=${INSTALL_DB:-j}

  if [ "$INSTALL_DB" = "j" ]; then
    echo "  → Datenbank installieren..."
    if [ "$OS" = "debian" ]; then
      apt-get update -qq && apt-get install -y -qq mysql-server
      systemctl start mysql 2>/dev/null || service mysql start 2>/dev/null
      systemctl enable mysql 2>/dev/null || true
    elif [ "$OS" = "rhel" ]; then
      $PKG install -y -q mariadb-server mariadb
      systemctl start mariadb
      systemctl enable mariadb
    elif [ "$OS" = "mac" ]; then
      brew install mysql && brew services start mysql
    fi
    echo "  ✓ Datenbank installiert und gestartet"

    # Create helpdesk user
    echo ""
    echo "  Datenbank-Benutzer fuer das Helpdesk anlegen..."
    read -p "  MySQL Root-Passwort (leer falls keins gesetzt): " MYSQL_ROOT_PASS
    read -p "  Helpdesk DB-Passwort [helpdesk123]: " HD_PASS
    HD_PASS=${HD_PASS:-helpdesk123}

    MYSQL_CMD="mysql"
    if [ -n "$MYSQL_ROOT_PASS" ]; then MYSQL_CMD="mysql -p$MYSQL_ROOT_PASS"; fi

    $MYSQL_CMD -e "CREATE DATABASE IF NOT EXISTS helpdesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || \
      sudo mysql -e "CREATE DATABASE IF NOT EXISTS helpdesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

    $MYSQL_CMD -e "CREATE USER IF NOT EXISTS 'helpdesk'@'localhost' IDENTIFIED BY '$HD_PASS'; GRANT ALL PRIVILEGES ON helpdesk.* TO 'helpdesk'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null || \
      sudo mysql -e "CREATE USER IF NOT EXISTS 'helpdesk'@'localhost' IDENTIFIED BY '$HD_PASS'; GRANT ALL PRIVILEGES ON helpdesk.* TO 'helpdesk'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null

    echo "  ✓ Datenbank 'helpdesk' und Benutzer 'helpdesk' erstellt"
    echo "  ✓ Passwort: $HD_PASS"
  else
    echo "  OK — stellen Sie sicher, dass ein MySQL/MariaDB-Server erreichbar ist."
  fi
fi

echo ""

# ============================================
# [2/5] Repository klonen
# ============================================
echo "  [2/5] Repository klonen..."
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  Verzeichnis existiert — aktualisiere..."
  cd "$INSTALL_DIR"
  git pull origin "$BRANCH" 2>/dev/null || (git fetch && git reset --hard "origin/$BRANCH")
  echo "  ✓ Aktualisiert"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$INSTALL_DIR"
  echo "  ✓ Geklont nach $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ============================================
# [3/5] npm install
# ============================================
echo ""
echo "  [3/5] Node.js-Pakete installieren..."
npm install --production --silent 2>&1
echo "  ✓ npm-Pakete installiert"

# ============================================
# [4/6] Konfiguration
# ============================================
echo ""
echo "  [4/6] Konfiguration..."
chmod +x start.sh 2>/dev/null || true
if [ -f ".env" ]; then
  echo "  .env existiert — uebersprungen"
else
  node install.js
fi

# ============================================
# [5/6] Systemdienst einrichten
# ============================================
echo ""
echo "  [5/6] Systemdienst einrichten..."

NODE_PATH=$(which node)

cat > /etc/systemd/system/helpdesk.service << SVCEOF
[Unit]
Description=IT-Helpdesk
After=network.target mysql.service mariadb.service

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_PATH $INSTALL_DIR/api/index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable helpdesk 2>/dev/null
echo "  ✓ Dienst 'helpdesk' eingerichtet (startet automatisch bei Boot)"

# ============================================
# [6/6] Server starten
# ============================================
echo ""
echo "  [6/6] Server starten..."
systemctl start helpdesk 2>/dev/null
sleep 2

# Pruefen ob er laeuft
if systemctl is-active --quiet helpdesk; then
  echo "  ✓ Server laeuft!"
else
  echo "  ⚠ Dienst konnte nicht gestartet werden — starte manuell:"
  echo "    cd $INSTALL_DIR && ./start.sh"
fi

# IP-Adressen erkennen
IPS=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$' | head -3)
PORT=$(grep APP_PORT .env 2>/dev/null | cut -d= -f2 || echo "3000")
PORT=${PORT:-3000}

echo ""
echo "  ══════════════════════════════════════════"
echo "  Installation abgeschlossen!"
echo "  ══════════════════════════════════════════"
echo ""
echo "  Im Browser oeffnen:"
for ip in $IPS; do
  echo "    →  http://$ip:$PORT"
done
echo ""
echo "  Der Setup-Assistent im Browser fuehrt Sie"
echo "  durch die weitere Einrichtung."
echo ""
echo "  Nuetzliche Befehle:"
echo "    systemctl status helpdesk     Status pruefen"
echo "    systemctl restart helpdesk    Neustart"
echo "    journalctl -u helpdesk -f     Logs ansehen"
echo ""
echo "  Updates:"
echo "    cd $INSTALL_DIR && git pull && npm install && systemctl restart helpdesk"
echo ""
