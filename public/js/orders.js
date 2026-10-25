document.addEventListener('DOMContentLoaded', async () => {
  const listEl = document.getElementById('orders-list');
  const alertBox = document.getElementById('orders-alert');
  const filterSelect = document.getElementById('status-filter');

  const params = new URLSearchParams(window.location.search);
  if (params.get('placed')) {
    showAlert(alertBox, `Order #${params.get('placed')} placed successfully. Status: Pending.`, 'success');
  }

  try {
    await apiRequest('/api/auth/me');
  } catch {
    window.location.href = '/login.html?redirect=/orders.html';
    return;
  }

  async function submitReview(orderItemId, form) {
    const rating = form.rating.value;
    const comment = form.comment.value.trim();
    try {
      await apiRequest('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ orderItemId, rating, comment }),
      });
      showAlert(alertBox, 'Review submitted. Thank you!', 'success');
      await loadOrders();
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  }

  async function confirmReceipt(itemId) {
    try {
      await apiRequest(`/api/orders/items/${itemId}/confirm`, { method: 'PATCH' });
      showAlert(alertBox, 'Delivery confirmed. You can leave a review below.', 'success');
      await loadOrders();
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  }

  function renderOrders(orders) {
    if (!orders.length) {
      listEl.innerHTML = '<p class="empty-state card">No orders yet. <a href="/">Start shopping</a></p>';
      return;
    }

    listEl.innerHTML = orders
      .map(({ order, items }) => {
        const itemsHtml = items
          .map((item) => {
            let actions = '';
            if (item.status === 'Shipped') {
              actions = `<button type="button" class="btn btn-primary btn-sm" data-confirm="${item.order_item_id}">Confirm receipt</button>`;
            }
            if (item.status === 'Delivered' && !item.review_id) {
              actions += `
                <form class="review-form" data-review-form="${item.order_item_id}">
                  <label>Rate ${escapeHtml(item.name)}</label>
                  <select name="rating" required>
                    <option value="5">5 — Excellent</option>
                    <option value="4">4</option>
                    <option value="3">3</option>
                    <option value="2">2</option>
                    <option value="1">1</option>
                  </select>
                  <textarea name="comment" required placeholder="Share your experience…" rows="2"></textarea>
                  <button type="submit" class="btn btn-ghost btn-sm">Submit review</button>
                </form>`;
            }
            if (item.review_id) {
              actions += '<span class="muted-note">Review submitted</span>';
            }

            return `
              <li class="order-line">
                <img src="${escapeHtml(item.image_url)}" alt="" class="cart-thumb" onerror="this.onerror=null;this.src='/images/ZedSitolo.png'" />
                <div>
                  <strong>${escapeHtml(item.name)}</strong> × ${item.quantity}
                  <span class="status-badge ${statusBadgeClass(item.status)}">${escapeHtml(item.status)}</span>
                  <p class="muted-note">Seller: ${escapeHtml(item.seller_name || '—')} · ${escapeHtml(item.seller_phone || '')}</p>
                  ${actions}
                </div>
                <span>${formatCurrency(item.price_at_purchase * item.quantity)}</span>
              </li>`;
          })
          .join('');

        return `
          <article class="card order-card" data-order-id="${order.id}">
            <header class="order-card-head">
              <div>
                <h2>Order #${order.id}</h2>
                <time>${escapeHtml(new Date(order.created_at + 'Z').toLocaleString())}</time>
              </div>
              <span class="status-badge ${statusBadgeClass(order.status)}">${escapeHtml(order.status)}</span>
            </header>
            <p class="muted-note">${escapeHtml(order.shipping_address)} · ${escapeHtml(order.phone)}</p>
            <ul class="order-lines">${itemsHtml}</ul>
            <p class="checkout-total"><strong>Total:</strong> ${formatCurrency(order.total)}</p>
          </article>`;
      })
      .join('');

    listEl.querySelectorAll('[data-confirm]').forEach((btn) => {
      btn.addEventListener('click', () => confirmReceipt(btn.getAttribute('data-confirm')));
    });

    listEl.querySelectorAll('[data-review-form]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitReview(form.getAttribute('data-review-form'), form);
      });
    });
  }

  async function loadOrders() {
    clearAlert(alertBox);
    listEl.innerHTML = '<p class="loading-state">Loading orders…</p>';
    const status = filterSelect ? filterSelect.value : '';
    const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    try {
      const { orders } = await apiRequest(`/api/orders${query}`);
      renderOrders(orders);
    } catch (err) {
      listEl.innerHTML = '';
      showAlert(alertBox, err.message);
    }
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', loadOrders);
  }

  await loadOrders();
});
