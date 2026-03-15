// Inventory removed from core — available as plugin 'asset-management'
const InventoryPage = { stockPage(c) { c.innerHTML = '<div class="empty-state"><div class="empty-state-title">Plugin erforderlich</div><p class="text-muted">Bitte "asset-management" Plugin installieren.</p></div>'; }, suppliersPage(c) { this.stockPage(c); }, customFieldsPage(c) { this.stockPage(c); } };
