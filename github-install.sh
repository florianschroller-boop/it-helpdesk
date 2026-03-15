#!/bin/bash
# ============================================
# IT-Helpdesk — GitHub Installer
# Installiert das System direkt von GitHub
#
# Nutzung:
#   curl -fsSL https://raw.githubusercontent.com/florianschroller-boop/it-helpdesk/main/github-install.sh | bash
#
# Oder mit Optionen:
#   curl -fsSL https://raw.githubusercontent.com/florianschroller-boop/it-helpdesk/main/github-install.sh | bash -s -- --demo --dir /opt/helpdesk
# ============================================

set -e

# Defaults
INSTALL_DIR="${HOME}/IT-Helpdesk"
WITH_DEMO=false
BRANCH="main"

# Parse args
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

# ---- Check Node.js ----
echo "  [1/4] Voraussetzungen pruefen..."
if ! command -v node &>/dev/null; then
  echo ""
  echo "  ✗ Node.js nicht gefunden. Bitte installieren:"
  echo ""
  if [ -f /etc/debian_version ]; then
    echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "    sudo apt-get install -y nodejs"
  elif [ -f /etc/redhat-release ]; then
    echo "    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -"
    echo "    sudo yum install -y nodejs"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "    brew install node"
  else
    echo "    https://nodejs.org/de/download"
  fi
  echo ""
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "  ✗ Node.js $(node -v) ist zu alt (mind. v18)"
  exit 1
fi
echo "  ✓ Node.js $(node -v)"

if command -v git &>/dev/null; then
  echo "  ✓ Git $(git --version | head -c 20)"
else
  echo "  ✗ Git nicht gefunden. Bitte installieren:"
  echo "    Ubuntu: sudo apt-get install -y git"
  echo "    CentOS: sudo yum install -y git"
  exit 1
fi

# ---- Clone ----
echo ""
echo "  [2/4] Repository klonen..."
if [ -d "$INSTALL_DIR" ]; then
  echo "  Verzeichnis $INSTALL_DIR existiert bereits."
  read -p "  Aktualisieren? (j/n) [j]: " UPDATE
  UPDATE=${UPDATE:-j}
  if [ "$UPDATE" = "j" ]; then
    cd "$INSTALL_DIR"
    git pull origin "$BRANCH" 2>/dev/null || git fetch && git reset --hard "origin/$BRANCH"
    echo "  ✓ Aktualisiert"
  fi
else
  git clone --depth 1 --branch "$BRANCH" "https://github.com/florianschroller-boop/it-helpdesk.git" "$INSTALL_DIR"
  echo "  ✓ Geklont nach $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ---- npm install ----
echo ""
echo "  [3/4] Abhaengigkeiten installieren..."
npm install --production --silent 2>&1
echo "  ✓ npm-Pakete installiert"

# ---- Setup ----
echo ""
echo "  [4/4] Konfiguration..."
if [ -f ".env" ]; then
  echo "  .env existiert bereits — uebersprungen"
else
  if [ "$WITH_DEMO" = true ]; then
    node install.js --demo
  else
    node install.js
  fi
fi

echo ""
echo "  ══════════════════════════════════════════"
echo "  Installation abgeschlossen!"
echo "  ══════════════════════════════════════════"
echo ""
echo "  Verzeichnis:  $INSTALL_DIR"
echo "  Starten:      cd $INSTALL_DIR && node api/index.js"
echo "  Oder:         cd $INSTALL_DIR && ./start.sh"
echo ""
echo "  Updates:      cd $INSTALL_DIR && git pull && npm install"
echo ""
