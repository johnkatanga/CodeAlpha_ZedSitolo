document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('product-detail');
  const reviewsSection = document.getElementById('product-reviews');
  const alertBox = document.getElementById('product-alert');

  const pathMatch = window.location.pathname.match(/\/product\/(\d+)/);
  const productId = pathMatch ? parseInt(pathMatch[1], 10) : NaN;

  if (Number.isNaN(productId)) {
    container.innerHTML = '<p class="empty-state">Invalid product.</p>';
    return;
  }

  async function loadReviews() {
    if (!reviewsSection) return;
    try {
      const { reviews, summary } = await apiRequest(`/api/products/${productId}/reviews`);
      const summaryHtml =
        summary.count > 0
          ? `<p class="review-summary">${renderStars(summary.averageRating)} <strong>${summary.averageRating}</strong> (${summary.count} review${summary.count === 1 ? '' : 's'})</p>`
          : '<p class="muted-note">No reviews yet. Be the first after you receive your order!</p>';

      const listHtml = reviews.length
        ? `<ul class="review-list">${reviews
            .map(
              (r) => `
          <li class="review-item">
            <div class="review-head">${renderStars(r.rating)} · ${escapeHtml(r.username)}</div>
            <p>${escapeHtml(r.comment)}</p>
            <time class="review-date">${escapeHtml(new Date(r.created_at + 'Z').toLocaleDateString())}</time>
          </li>`
            )
            .join('')}</ul>`
        : '';

      reviewsSection.innerHTML = `<h2>Customer reviews</h2>${summaryHtml}${listHtml}`;
    } catch (err) {
      reviewsSection.innerHTML = `<p class="empty-state">Could not load reviews.</p>`;
    }
  }

  try {
    const { product } = await apiRequest(`/api/products/${productId}`);

    const sellerPhone = product.seller_phone || 'Not provided';
    const sellerLocation = product.location || product.seller_location || 'Not provided';
    const videoBlock = videoEmbedHtml(product.video_url);

    container.innerHTML = `
      <div class="product-detail-grid">
        <div class="product-detail-media">
          <img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" />
          ${videoBlock ? `<div class="product-video-wrap">${videoBlock}</div>` : ''}
        </div>
        <div class="product-detail-info">
          <span class="product-category">${escapeHtml(product.category)}</span>
          <h1>${escapeHtml(product.name)}</h1>
          <p class="product-price-lg">${formatCurrency(product.price)}</p>
          <p class="product-stock">${product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</p>
          <div class="seller-contact card-inline">
            <h2>Seller</h2>
            <p><strong>${escapeHtml(product.seller_name || 'Marketplace seller')}</strong></p>
            <p>📞 ${escapeHtml(sellerPhone)}</p>
            <p>📍 ${escapeHtml(sellerLocation)}</p>
          </div>
          <p class="product-description">${escapeHtml(product.description)}</p>
          <div class="quantity-row">
            <label for="quantity-input">Quantity</label>
            <input type="number" id="quantity-input" min="1" max="${Math.max(1, product.stock)}" value="1" />
          </div>
          <button type="button" class="btn btn-primary" id="add-to-cart-btn" ${product.stock < 1 ? 'disabled' : ''}>
            Add to cart
          </button>
          <a href="/" class="btn btn-ghost">← Back to shop</a>
        </div>
      </div>
    `;

    const freshQty = document.getElementById('quantity-input');
    const freshAdd = document.getElementById('add-to-cart-btn');

    freshAdd.addEventListener('click', () => {
      const qty = parseInt(freshQty.value, 10) || 1;
      if (qty > product.stock) {
        showAlert(alertBox, `Only ${product.stock} items available.`);
        return;
      }
      addToCart(product, qty);
      showAlert(alertBox, `"${product.name}" (${qty}) added to cart.`, 'success');
    });

    await loadReviews();
  } catch (err) {
    container.innerHTML = '<p class="empty-state">Product not found.</p>';
    showAlert(alertBox, err.message);
  }
});
