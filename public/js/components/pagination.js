// ============================================
// Pagination Component
// ============================================

function renderPagination(container, pagination, onPageChange) {
  const { page, pages, total, limit } = pagination;
  if (pages <= 1) {
    container.innerHTML = '';
    return;
  }

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  let buttonsHtml = '';
  const maxVisible = 5;
  let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
  let endPage = Math.min(pages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  buttonsHtml += `<button class="pagination-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">\u2039</button>`;

  for (let i = startPage; i <= endPage; i++) {
    buttonsHtml += `<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  buttonsHtml += `<button class="pagination-btn" ${page >= pages ? 'disabled' : ''} data-page="${page + 1}">\u203A</button>`;

  container.innerHTML = `
    <div class="pagination">
      <span class="pagination-info">${start}\u2013${end} von ${total}</span>
      <div class="pagination-buttons">${buttonsHtml}</div>
    </div>
  `;

  container.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= pages) onPageChange(p);
    });
  });
}
