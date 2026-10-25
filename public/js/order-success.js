document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('order-success-content');
  const alertBox = document.getElementById('order-alert');

  const params = new URLSearchParams(window.location.search);
  const orderId = parseInt(params.get('id'), 10);

  if (Number.isNaN(orderId)) {
    container.innerHTML = '<p class="empty-state">No order specified.</p>';
    return;
  }

  try {
    await apiRequest('/api/auth/me');
    const { order, items } = await apiRequest(`/api/orders/${orderId}`);

    container.innerHTML = `
      <div class="success-card card">
        <div class="success-icon" aria-hidden="true">✓</div>
        <h1>Order confirmed</h1>
        <p class="success-lead">Thank you for shopping at ZedSitolo. Your order <strong>#${order.id}</strong> has been received.</p>
        <dl class="order-meta">
          <div><dt>Total paid</dt><dd>${formatCurrency(order.total)}</dd></div>
          <div><dt>Shipping to</dt><dd>${escapeHtml(order.shipping_address)}</dd></div>
          <div><dt>Phone</dt><dd>${escapeHtml(order.phone)}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(order.status)}</dd></div>
          <div><dt>Date</dt><dd>${escapeHtml(new Date(order.created_at + 'Z').toLocaleString())}</dd></div>
        </dl>
        <h2>Items</h2>
        <ul class="checkout-lines">
          ${items
            .map(
              (item) => `
            <li>
              <span>${escapeHtml(item.name)} × ${item.quantity}</span>
              <span>${formatCurrency(item.price_at_purchase * item.quantity)}</span>
            </li>
          `
            )
            .join('')}
        </ul>
        <a href="/" class="btn btn-primary">Continue shopping</a>
      </div>
    `;
  } catch (err) {
    container.innerHTML = '';
    showAlert(alertBox, err.message);
    if (err.message.includes('Authentication') || err.message.includes('Not authenticated')) {
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 1500);
    }
  }
});
