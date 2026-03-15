// ============================================
// Toast Notification Component
// ============================================

const Toast = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 4000) {
    this.init();

    const icons = {
      success: '\u2713',
      error: '\u2717',
      warning: '\u26A0',
      info: '\u2139'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;

    toast.addEventListener('click', () => this.dismiss(toast));
    this.container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }

    return toast;
  },

  dismiss(toast) {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 200);
  },

  success(msg) { return this.show(msg, 'success'); },
  error(msg) { return this.show(msg, 'error'); },
  warning(msg) { return this.show(msg, 'warning'); },
  info(msg) { return this.show(msg, 'info'); }
};
