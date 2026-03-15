// ============================================
// Modal Component
// ============================================

const Modal = {
  open(options) {
    const { title, content, footer, size, onClose } = options;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close(overlay, onClose);
    });

    const modal = document.createElement('div');
    modal.className = `modal ${size === 'lg' ? 'modal-lg' : ''}`;

    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" aria-label="Schlie\u00DFen">\u00D7</button>
      </div>
      <div class="modal-body">${typeof content === 'string' ? content : ''}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    `;

    if (typeof content !== 'string' && content instanceof HTMLElement) {
      modal.querySelector('.modal-body').innerHTML = '';
      modal.querySelector('.modal-body').appendChild(content);
    }

    modal.querySelector('.modal-close').addEventListener('click', () => this.close(overlay, onClose));

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Focus trap
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        Modal.close(overlay, onClose);
        document.removeEventListener('keydown', escHandler);
      }
    });

    return overlay;
  },

  close(overlay, callback) {
    if (overlay && overlay.parentNode) {
      overlay.remove();
      if (callback) callback();
    }
  },

  confirm(message, onConfirm) {
    const overlay = this.open({
      title: 'Best\u00E4tigung',
      content: `<p>${message}</p>`,
      footer: `
        <button class="btn btn-secondary" data-action="cancel">Abbrechen</button>
        <button class="btn btn-danger" data-action="confirm">Best\u00E4tigen</button>
      `
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => this.close(overlay));
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      this.close(overlay);
      onConfirm();
    });

    return overlay;
  }
};
