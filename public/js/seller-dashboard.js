document.addEventListener('DOMContentLoaded', async () => {
  const productsEl = document.getElementById('seller-products');
  const ordersEl = document.getElementById('seller-orders');
  const alertBox = document.getElementById('seller-alert');
  const productForm = document.getElementById('product-form');
  const profileForm = document.getElementById('seller-profile-form');
  const uploadInput = document.getElementById('media-upload');

  try {
    const { user } = await apiRequest('/api/auth/me');
    if (user.role !== 'seller') {
      window.location.href = '/';
      return;
    }
    if (profileForm) {
      profileForm.phone.value = user.phone || '';
      profileForm.location.value = user.location || '';
    }
    if (productForm && productForm.location) {
      productForm.location.placeholder = user.location || 'Business location';
    }
  } catch {
    window.location.href = '/login.html?redirect=/seller-dashboard.html';
    return;
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiRequest('/api/auth/profile', {
          method: 'PATCH',
          body: JSON.stringify({
            phone: profileForm.phone.value.trim(),
            location: profileForm.location.value.trim(),
          }),
        });
        showAlert(alertBox, 'Profile updated.', 'success');
      } catch (err) {
        showAlert(alertBox, err.message);
      }
    });
  }

  if (uploadInput) {
    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('media', file);
      try {
        const res = await fetch('/api/seller/products/upload-media', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        if (file.type.startsWith('video/')) {
          productForm.video_url.value = data.url;
        } else {
          productForm.image_url.value = data.url;
        }
        showAlert(alertBox, 'File uploaded and linked to the form. Now click Create product.', 'success');
        uploadInput.value = '';
      } catch (err) {
        showAlert(alertBox, err.message);
      }
    });
  }

  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const submitBtn = document.getElementById('product-submit-btn');

  function exitEditMode() {
    delete productForm.dataset.editId;
    document.getElementById('product-form-title').textContent = 'Add new product';
    if (submitBtn) submitBtn.textContent = 'Create product';
    if (cancelEditBtn) cancelEditBtn.hidden = true;
    productForm.reset();
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', exitEditMode);
  }

  document.querySelectorAll('[data-bulk]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await apiRequest('/api/seller/products/stock/bulk', {
          method: 'PATCH',
          body: JSON.stringify({ adjustment: parseInt(btn.getAttribute('data-bulk'), 10) }),
        });
        showAlert(alertBox, result.message, 'success');
        await loadProducts();
      } catch (err) {
        showAlert(alertBox, err.message);
      }
    });
  });

  const bulkSetBtn = document.getElementById('bulk-set-btn');
  if (bulkSetBtn) {
    bulkSetBtn.addEventListener('click', async () => {
      const value = document.getElementById('bulk-set-value').value;
      if (value === '') {
        showAlert(alertBox, 'Enter a stock quantity to apply to all products.');
        return;
      }
      if (!confirm(`Set stock to ${value} for ALL your products?`)) return;
      try {
        const result = await apiRequest('/api/seller/products/stock/bulk', {
          method: 'PATCH',
          body: JSON.stringify({ stock: value }),
        });
        showAlert(alertBox, result.message, 'success');
        document.getElementById('bulk-set-value').value = '';
        await loadProducts();
      } catch (err) {
        showAlert(alertBox, err.message);
      }
    });
  }

  async function loadProducts() {
    const { products } = await apiRequest('/api/seller/products');
    if (!products.length) {
      productsEl.innerHTML = '<p class="empty-state">No products yet. Add your first listing below.</p>';
      return;
    }

    productsEl.innerHTML = products
      .map(
        (p) => `
      <div class="seller-product-row card" data-id="${p.id}">
        <img src="${escapeHtml(p.image_url)}" alt="" class="cart-thumb" onerror="this.onerror=null;this.src='/images/ZedSitolo.png'" />
        <div class="seller-product-info">
          <h3>${escapeHtml(p.name)}</h3>
          <p>${formatCurrency(p.price)} · ${escapeHtml(p.category)} · Stock: <strong data-stock="${p.id}">${p.stock}</strong></p>
          <div class="stock-adjust">
            <button type="button" class="btn btn-ghost btn-sm" data-stock-delta="-1" data-id="${p.id}">−1</button>
            <button type="button" class="btn btn-ghost btn-sm" data-stock-delta="1" data-id="${p.id}">+1</button>
            <button type="button" class="btn btn-ghost btn-sm" data-stock-delta="10" data-id="${p.id}">+10</button>
            <input type="number" min="0" placeholder="Set stock" style="width:100px;" data-stock-input="${p.id}" />
            <button type="button" class="btn btn-ghost btn-sm" data-stock-set="${p.id}">Set</button>
            <button type="button" class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
            <button type="button" class="btn btn-ghost btn-sm" data-delete="${p.id}">Delete</button>
          </div>
        </div>
      </div>`
      )
      .join('');

    productsEl.querySelectorAll('[data-stock-delta]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const delta = parseInt(btn.getAttribute('data-stock-delta'), 10);
        try {
          const { product } = await apiRequest(`/api/seller/products/${id}/stock`, {
            method: 'PATCH',
            body: JSON.stringify({ adjustment: delta }),
          });
          const el = productsEl.querySelector(`[data-stock="${id}"]`);
          if (el) el.textContent = String(product.stock);
        } catch (err) {
          showAlert(alertBox, err.message);
        }
      });
    });

    productsEl.querySelectorAll('[data-stock-set]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-stock-set');
        const input = productsEl.querySelector(`[data-stock-input="${id}"]`);
        if (!input || input.value === '') {
          showAlert(alertBox, 'Enter a stock quantity first.');
          return;
        }
        try {
          const { product } = await apiRequest(`/api/seller/products/${id}/stock`, {
            method: 'PATCH',
            body: JSON.stringify({ stock: input.value }),
          });
          const el = productsEl.querySelector(`[data-stock="${id}"]`);
          if (el) el.textContent = String(product.stock);
          input.value = '';
          showAlert(alertBox, 'Stock updated.', 'success');
        } catch (err) {
          showAlert(alertBox, err.message);
        }
      });
    });

    productsEl.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this product?')) return;
        try {
          await apiRequest(`/api/seller/products/${btn.getAttribute('data-delete')}`, { method: 'DELETE' });
          await loadProducts();
        } catch (err) {
          showAlert(alertBox, err.message);
        }
      });
    });

    productsEl.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-edit');
        const { products } = await apiRequest('/api/seller/products');
        const p = products.find((x) => x.id === parseInt(id, 10));
        if (!p) return;
        productForm.dataset.editId = id;
        productForm.name.value = p.name;
        productForm.description.value = p.description;
        productForm.price.value = p.price;
        productForm.category.value = p.category;
        productForm.image_url.value = p.image_url;
        productForm.video_url.value = p.video_url || '';
        productForm.stock.value = p.stock;
        productForm.location.value = p.location || '';
        document.getElementById('product-form-title').textContent = 'Edit product';
        if (submitBtn) submitBtn.textContent = 'Save changes';
        if (cancelEditBtn) cancelEditBtn.hidden = false;
        window.scrollTo({ top: productForm.offsetTop - 80, behavior: 'smooth' });
      });
    });
  }

  async function loadSellerOrders() {
    const { items } = await apiRequest('/api/seller/orders');
    if (!items.length) {
      ordersEl.innerHTML = '<p class="empty-state">No orders for your products yet.</p>';
      return;
    }

    ordersEl.innerHTML = items
      .map(
        (item) => `
      <div class="card seller-order-row">
        <div class="order-card-head">
          <div>
            <strong>Order #${item.order_id}</strong> · ${escapeHtml(item.product_name)}
            <span class="status-badge ${statusBadgeClass(item.status)}">${escapeHtml(item.status)}</span>
          </div>
          <time>${escapeHtml(new Date(item.created_at + 'Z').toLocaleString())}</time>
        </div>
        <p>Buyer: ${escapeHtml(item.buyer_name)} (${escapeHtml(item.buyer_email)}) · Qty ${item.quantity}</p>
        <p>Ship to: ${escapeHtml(item.shipping_address)} · ${escapeHtml(item.buyer_contact_phone)}</p>
        <div class="seller-order-actions">
          ${
            item.status === 'Pending'
              ? `<button type="button" class="btn btn-primary btn-sm" data-ship="${item.order_item_id}">Mark shipped</button>
                 <button type="button" class="btn btn-ghost btn-sm" data-cancel="${item.order_item_id}">Cancel</button>`
              : ''
          }
        </div>
      </div>`
      )
      .join('');

    ordersEl.querySelectorAll('[data-ship]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiRequest(`/api/seller/orders/items/${btn.getAttribute('data-ship')}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'Shipped' }),
          });
          await loadSellerOrders();
          showAlert(alertBox, 'Order marked as shipped.', 'success');
        } catch (err) {
          showAlert(alertBox, err.message);
        }
      });
    });

    ordersEl.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Cancel this line item and restore stock?')) return;
        try {
          await apiRequest(`/api/seller/orders/items/${btn.getAttribute('data-cancel')}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'Cancelled' }),
          });
          await loadSellerOrders();
          await loadProducts();
        } catch (err) {
          showAlert(alertBox, err.message);
        }
      });
    });
  }

  if (productForm) {
    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert(alertBox);
      const payload = {
        name: productForm.name.value.trim(),
        description: productForm.description.value.trim(),
        price: productForm.price.value,
        category: productForm.category.value.trim(),
        image_url: productForm.image_url.value.trim(),
        video_url: productForm.video_url.value.trim(),
        stock: productForm.stock.value,
        location: productForm.location.value.trim(),
      };

      try {
        const editId = productForm.dataset.editId;
        if (editId) {
          await apiRequest(`/api/seller/products/${editId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          exitEditMode();
        } else {
          await apiRequest('/api/seller/products', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          productForm.reset();
        }
        showAlert(alertBox, 'Product saved.', 'success');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await loadProducts();
      } catch (err) {
        showAlert(alertBox, err.message);
      }
    });
  }

  await loadProducts();
  await loadSellerOrders();
});
