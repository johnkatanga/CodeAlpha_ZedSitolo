document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('product-grid');
  const categorySelect = document.getElementById('category-filter');
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const alertBox = document.getElementById('shop-alert');

  async function loadCategories() {
    const { categories } = await apiRequest('/api/products/categories');
    categorySelect.innerHTML = '<option value="all">All categories</option>';
    for (const cat of categories) {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      categorySelect.appendChild(opt);
    }
  }

  function renderProducts(products) {
    if (!products.length) {
      grid.innerHTML = '<p class="empty-state">No products match your filters.</p>';
      return;
    }

    grid.innerHTML = products
      .map(
        (p) => `
      <article class="product-card">
        <a href="/product/${p.id}" class="product-card-image">
          <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy" />
        </a>
        <div class="product-card-body">
          <span class="product-category">${escapeHtml(p.category)}</span>
          <h3><a href="/product/${p.id}">${escapeHtml(p.name)}</a></h3>
          <p class="product-price">${formatCurrency(p.price)}</p>
          <div class="product-card-actions">
            <a href="/product/${p.id}" class="btn btn-ghost btn-sm">View</a>
            <button type="button" class="btn btn-primary btn-sm" data-add-id="${p.id}">Add to cart</button>
          </div>
        </div>
      </article>
    `
      )
      .join('');

    grid.querySelectorAll('[data-add-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-add-id'), 10);
        const product = products.find((x) => x.id === id);
        if (product) {
          addToCart(product, 1);
          showAlert(alertBox, `"${product.name}" added to your cart.`, 'success');
          setTimeout(() => clearAlert(alertBox), 2500);
        }
      });
    });
  }

  async function loadProducts() {
    clearAlert(alertBox);
    grid.innerHTML = '<p class="loading-state">Loading products…</p>';

    const params = new URLSearchParams();
    const category = categorySelect.value;
    const search = searchInput.value.trim();

    if (category && category !== 'all') params.set('category', category);
    if (search) params.set('search', search);

    try {
      const { products } = await apiRequest(`/api/products?${params.toString()}`);
      renderProducts(products);
    } catch (err) {
      grid.innerHTML = '';
      showAlert(alertBox, err.message);
    }
  }

  categorySelect.addEventListener('change', loadProducts);
  searchBtn.addEventListener('click', loadProducts);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadProducts();
  });

  try {
    await loadCategories();
    await loadProducts();
  } catch (err) {
    showAlert(alertBox, err.message);
    grid.innerHTML = '';
  }
});
