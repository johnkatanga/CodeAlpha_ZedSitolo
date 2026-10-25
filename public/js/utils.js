const CART_KEY = 'zedsitolo_cart';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency: 'ZMW',
    minimumFractionDigits: 2,
  }).format(amount);
}

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
}

function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartBadge() {
  const badge = document.querySelector('[data-cart-count]');
  if (badge) {
    const count = getCartCount();
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
}

function addToCart(product, quantity = 1) {
  const cart = getCart();
  const existing = cart.find((item) => item.productId === product.id);
  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  if (existing) {
    existing.quantity += qty;
    existing.price = product.price;
    existing.name = product.name;
    existing.image_url = product.image_url;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      quantity: qty,
    });
  }

  saveCart(cart);
}

function setCartQuantity(productId, quantity) {
  const cart = getCart();
  const item = cart.find((i) => i.productId === productId);
  if (!item) return;

  const qty = parseInt(quantity, 10);
  if (Number.isNaN(qty) || qty < 1) {
    removeFromCart(productId);
    return;
  }

  item.quantity = qty;
  saveCart(cart);
}

function adjustCartQuantity(productId, delta) {
  const cart = getCart();
  const item = cart.find((i) => i.productId === productId);
  if (!item) return;
  setCartQuantity(productId, item.quantity + delta);
}

function removeFromCart(productId) {
  const cart = getCart().filter((item) => item.productId !== productId);
  saveCart(cart);
}

function getCartSubtotal() {
  return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
}

async function apiRequest(url, options = {}) {
  const config = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  };

  const response = await fetch(url, config);
  let data = null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = { error: await response.text() };
  }

  if (!response.ok) {
    const message = (data && data.error) || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

function statusBadgeClass(status) {
  const map = {
    Pending: 'status-pending',
    Shipped: 'status-shipped',
    Delivered: 'status-delivered',
    Cancelled: 'status-cancelled',
  };
  return map[status] || 'status-pending';
}

function renderStars(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

async function refreshAuthNav() {
  const authSlot = document.querySelector('[data-auth-nav]');
  const extraSlot = document.querySelector('[data-role-nav]');
  if (!authSlot) return;

  try {
    const { user } = await apiRequest('/api/auth/me');
    let roleLinks = '';
    if (user.role === 'seller') {
      roleLinks = `<a href="/seller-dashboard.html" class="btn btn-ghost btn-sm">Seller dashboard</a>`;
    }
    roleLinks += `<a href="/orders.html" class="btn btn-ghost btn-sm">My orders</a>`;

    if (extraSlot) {
      extraSlot.innerHTML = roleLinks;
    }

    authSlot.innerHTML = `
      <span class="nav-user">${escapeHtml(user.username)} · ${escapeHtml(user.role)}</span>
      <button type="button" class="btn btn-ghost btn-sm" id="logout-btn">Log out</button>
    `;
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await apiRequest('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
      });
    }
  } catch {
    if (extraSlot) extraSlot.innerHTML = '';
    authSlot.innerHTML = `
      <a href="/login.html" class="btn btn-ghost btn-sm">Log in</a>
      <a href="/register.html" class="btn btn-primary btn-sm">Register</a>
    `;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function showAlert(container, message, type = 'error') {
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type}" role="alert">${escapeHtml(message)}</div>`;
}

function clearAlert(container) {
  if (container) container.innerHTML = '';
}

function videoEmbedHtml(videoUrl) {
  if (!videoUrl || !String(videoUrl).trim()) return '';
  const url = String(videoUrl).trim();
  if (url.includes('youtube.com/watch')) {
    const id = new URL(url).searchParams.get('v');
    if (id) {
      return `<iframe class="product-video" src="https://www.youtube.com/embed/${escapeHtml(id)}" title="Product video" allowfullscreen loading="lazy"></iframe>`;
    }
  }
  if (url.includes('youtu.be/')) {
    const id = url.split('youtu.be/')[1]?.split(/[?&]/)[0];
    if (id) {
      return `<iframe class="product-video" src="https://www.youtube.com/embed/${escapeHtml(id)}" title="Product video" allowfullscreen loading="lazy"></iframe>`;
    }
  }
  if (url.includes('/embed/') || url.endsWith('.mp4') || url.startsWith('/uploads/')) {
    if (url.endsWith('.mp4') || url.startsWith('/uploads/')) {
      return `<video class="product-video" controls src="${escapeHtml(url)}"></video>`;
    }
    return `<iframe class="product-video" src="${escapeHtml(url)}" title="Product video" allowfullscreen loading="lazy"></iframe>`;
  }
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Watch product video</a>`;
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  refreshAuthNav();
});
