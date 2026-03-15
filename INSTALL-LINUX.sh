#!/bin/bash
# ============================================
# IT-Helpdesk — Linux Installer
# Funktioniert auf CentOS 7/8/9, Ubuntu 20/22/24, Debian 11/12
# ============================================

set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       IT-Helpdesk Installer          ║"
echo "  ║       Linux Edition                  ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_VERSION=$VERSION_ID
else
    OS="unknown"
fi

echo "  System: $OS $OS_VERSION"

# ---- Node.js ----
if ! command -v node &>/dev/null; then
    echo "  [!] Node.js nicht gefunden. Installiere..."

    case "$OS" in
        centos|rhel|rocky|alma|fedora)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo yum install -y nodejs
            ;;
        ubuntu|debian|linuxmint)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        *)
            echo "  [FEHLER] Unbekanntes OS. Bitte Node.js manuell installieren."
            exit 1
            ;;
    esac
fi

echo "  [OK] Node.js $(node --version)"

# ---- MySQL/MariaDB ----
if ! command -v mysql &>/dev/null && ! command -v mariadb &>/dev/null; then
    echo ""
    read -p "  MySQL/MariaDB installieren? (j/n) [j]: " INSTALL_DB
    INSTALL_DB=${INSTALL_DB:-j}

    if [ "$INSTALL_DB" = "j" ]; then
        case "$OS" in
            centos|rhel|rocky|alma)
                sudo yum install -y mariadb-server mariadb
                sudo systemctl start mariadb
                sudo systemctl enable mariadb
                sudo mysql_secure_installation
                ;;
            ubuntu|debian|linuxmint)
                sudo apt-get install -y mysql-server
                sudo systemctl start mysql
                sudo systemctl enable mysql
                ;;
            fedora)
                sudo dnf install -y mariadb-server
                sudo systemctl start mariadb
                sudo systemctl enable mariadb
                ;;
        esac
        echo "  [OK] Datenbank installiert"
    fi
else
    echo "  [OK] MySQL/MariaDB gefunden"
fi

# ---- npm install ----
echo ""
echo "  npm-Pakete installieren..."
npm install --production

# ---- Run installer ----
echo ""
node install.js --demo

# ---- Systemd service ----
echo ""
read -p "  Als systemd-Dienst einrichten? (j/n) [j]: " SETUP_SERVICE
SETUP_SERVICE=${SETUP_SERVICE:-j}

if [ "$SETUP_SERVICE" = "j" ]; then
    sudo cp helpdesk.service /etc/systemd/system/
    sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=$SCRIPT_DIR|" /etc/systemd/system/helpdesk.service
    sudo sed -i "s|ExecStart=.*|ExecStart=$(which node) $SCRIPT_DIR/api/index.js|" /etc/systemd/system/helpdesk.service
    sudo systemctl daemon-reload
    sudo systemctl enable helpdesk
    sudo systemctl start helpdesk
    echo "  [OK] Dienst 'helpdesk' gestartet"
    echo "  Status: sudo systemctl status helpdesk"
    echo "  Logs:   sudo journalctl -u helpdesk -f"
fi

echo ""
echo "  Installation abgeschlossen!"
echo ""
