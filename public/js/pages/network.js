// Network Monitor removed from core — available as plugin 'network-monitor'
const NetworkPage = {
  render(container) {
    container.innerHTML = `
      <div class="page-header"><h1 class="page-title">Netzwerk-Monitor</h1></div>
      <div class="card"><div class="card-body"><div class="empty-state">
        <div class="empty-state-icon">\u26A1</div>
        <div class="empty-state-title">Plugin erforderlich</div>
        <p class="text-muted">Der Netzwerk-Monitor ist als separates Plugin verf\u00FCgbar.<br>
        Bitte das <strong>network-monitor</strong> Plugin \u00FCber den Plugin-Manager installieren.</p>
        <button class="btn btn-primary mt-4" onclick="Router.navigate('/plugins')">Zum Plugin-Manager</button>
      </div></div></div>`;
  }
};
