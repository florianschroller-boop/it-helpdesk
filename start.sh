#!/bin/bash
cd "$(dirname "$0")"
echo "IT-Helpdesk (automatischer Neustart bei Beendigung)"
echo ""
while true; do
  echo "Starte Server..."
  node api/index.js
  echo "Server beendet. Neustart in 2 Sekunden... (Strg+C zum Beenden)"
  sleep 2
done
