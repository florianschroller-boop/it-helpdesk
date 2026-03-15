// Onboarding removed from core — available as plugin 'onboarding-offboarding'
const OnboardingPage = {
  listPage(c) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\u{1F464}</div><div class="empty-state-title">Plugin erforderlich</div><p class="text-muted">Bitte "Onboarding & Offboarding" Plugin installieren.</p><button class="btn btn-primary mt-4" onclick="Router.navigate(\'/plugins\')">Zum Plugin-Manager</button></div>'; },
  detailPage(c, p) { this.listPage(c); },
  configPage(c) { this.listPage(c); },
  openRequestForm() { Toast.error('Bitte Onboarding & Offboarding Plugin installieren'); }
};
