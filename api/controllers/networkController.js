// Network Monitor removed from core — available as plugin 'network-monitor'
// This stub keeps require() from failing if referenced elsewhere.

module.exports = {
  listDevices: (req, res) => res.json({ success: false, error: 'Netzwerk-Monitor ist als Plugin verfügbar. Bitte "network-monitor" Plugin installieren.' }),
  createDevice: (req, res) => res.json({ success: false, error: 'Plugin erforderlich' }),
  updateDevice: (req, res) => res.json({ success: false, error: 'Plugin erforderlich' }),
  deleteDevice: (req, res) => res.json({ success: false, error: 'Plugin erforderlich' }),
  publicStatus: (req, res) => res.json({ success: true, data: [] }),
  deviceStatus: (req, res) => res.json({ success: false, error: 'Plugin erforderlich' }),
  manualPing: (req, res) => res.json({ success: false, error: 'Plugin erforderlich' })
};
