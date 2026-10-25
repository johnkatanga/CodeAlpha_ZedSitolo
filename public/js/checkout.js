document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('checkout-form');
  const summaryEl = document.getElementById('checkout-summary');
  const alertBox = document.getElementById('checkout-alert');
  const submitBtn = document.getElementById('place-order-btn');

  const cart = getCart();
  if (!cart.length) {
    summaryEl.innerHTML = '<p class="empty-state">Your cart is empty. <a href="/">Continue shopping</a></p>';
    form.hidden = true;
    return;
  }

  try {
    await apiRequest('/api/auth/me');
  } catch {
    window.location.href = '/login.html?redirect=/checkout.html';
    return;
  }

  summaryEl.innerHTML = `
    <ul class="checkout-lines">
      ${cart
        .map(
          (item) => `
        <li>
          <span>${escapeHtml(item.name)} × ${item.quantity}</span>
          <span>${formatCurrency(item.price * item.quantity)}</span>
        </li>
      `
        )
        .join('')}
    </ul>
    <p class="checkout-total"><strong>Total:</strong> ${formatCurrency(getCartSubtotal())}</p>
  `;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertBox);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Placing order…';

    const payload = {
      shippingAddress: form.shippingAddress.value.trim(),
      phone: form.phone.value.trim(),
      items: getCart().map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    };

    try {
      const result = await apiRequest('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      clearCart();
      window.location.href = `/orders.html?placed=${result.order.id}`;
    } catch (err) {
      showAlert(alertBox, err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Place order';
    }
  });
});
