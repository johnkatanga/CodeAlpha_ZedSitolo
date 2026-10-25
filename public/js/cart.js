document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('cart-subtotal');
  const checkoutLink = document.getElementById('checkout-link');
  const alertBox = document.getElementById('cart-alert');

  function render() {
    const cart = getCart();

    if (!cart.length) {
      listEl.innerHTML = `
        <div class="empty-state card">
          <p>Your cart is empty.</p>
          <a href="/" class="btn btn-primary">Browse products</a>
        </div>
      `;
      subtotalEl.textContent = formatCurrency(0);
      checkoutLink.classList.add('disabled');
      checkoutLink.setAttribute('aria-disabled', 'true');
      checkoutLink.href = '#';
      return;
    }

    checkoutLink.classList.remove('disabled');
    checkoutLink.removeAttribute('aria-disabled');
    checkoutLink.href = '/checkout.html';

    listEl.innerHTML = cart
      .map(
        (item) => `
      <div class="cart-row" data-product-id="${item.productId}">
        <img src="${escapeHtml(item.image_url)}" alt="" class="cart-thumb" onerror="this.onerror=null;this.src='/images/ZedSitolo.png'" />
        <div class="cart-row-info">
          <h3>${escapeHtml(item.name)}</h3>
          <p>${formatCurrency(item.price)} each</p>
        </div>
        <div class="cart-row-qty">
          <label class="sr-only" for="qty-${item.productId}">Quantity</label>
          <div class="qty-stepper">
            <button type="button" class="btn btn-ghost btn-sm" data-qty-dec aria-label="Decrease quantity">−</button>
            <input type="number" id="qty-${item.productId}" min="1" value="${item.quantity}" data-qty-input />
            <button type="button" class="btn btn-ghost btn-sm" data-qty-inc aria-label="Increase quantity">+</button>
          </div>
        </div>
        <p class="cart-line-total">${formatCurrency(item.price * item.quantity)}</p>
        <button type="button" class="btn btn-ghost btn-sm cart-remove" data-remove>Remove</button>
      </div>
    `
      )
      .join('');

    subtotalEl.textContent = formatCurrency(getCartSubtotal());

    listEl.querySelectorAll('.cart-row').forEach((row) => {
      const productId = parseInt(row.getAttribute('data-product-id'), 10);
      const qtyInput = row.querySelector('[data-qty-input]');
      const removeBtn = row.querySelector('[data-remove]');
      const decBtn = row.querySelector('[data-qty-dec]');
      const incBtn = row.querySelector('[data-qty-inc]');

      qtyInput.addEventListener('change', () => {
        setCartQuantity(productId, qtyInput.value);
        render();
      });

      decBtn.addEventListener('click', () => {
        adjustCartQuantity(productId, -1);
        render();
      });

      incBtn.addEventListener('click', () => {
        adjustCartQuantity(productId, 1);
        render();
      });

      removeBtn.addEventListener('click', () => {
        removeFromCart(productId);
        showAlert(alertBox, 'Item removed from cart.', 'success');
        render();
      });
    });
  }

  render();
});
