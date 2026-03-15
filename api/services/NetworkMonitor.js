// Network Monitor removed from core — available as plugin 'network-monitor'
module.exports = {
  start() { console.log('[INFO] Netzwerk-Monitor ist jetzt als Plugin verfügbar. Bitte "network-monitor" Plugin installieren.'); },
  stop() {},
  checkDevice() { return { status: 'unknown', response_time_ms: null }; }
};
