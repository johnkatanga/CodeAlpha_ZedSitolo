const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../db');
const { requireSeller } = require('../middleware/auth');
const { CATEGORIES } = require('../lib/categories');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename(req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (/^(image|video)\//.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image or video files can be uploaded.'));
    }
  },
});

const PLACEHOLDER_IMAGE = '/images/ZedSitolo.png';

router.use(requireSeller);

function ownedProduct(productId, sellerId) {
  return db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(productId, sellerId);
}

router.get('/products', (req, res) => {
  const products = db
    .prepare(
      `SELECT id, name, description, price, category, image_url, stock, location, video_url, created_at
       FROM products WHERE seller_id = ? ORDER BY created_at DESC`
    )
    .all(req.session.userId);
  res.json({ products });
});

router.post('/products', (req, res) => {
  const { name, description, price, category, image_url, stock, location, video_url } = req.body;

  if (!name || !description || price === undefined || price === '' || !category) {
    return res.status(400).json({
      error: 'Name, description, price, and category are required.',
    });
  }

  if (!CATEGORIES.includes(String(category).trim())) {
    return res.status(400).json({ error: 'Please choose a valid category from the list.' });
  }

  const seller = db.prepare('SELECT location FROM users WHERE id = ?').get(req.session.userId);
  const productLocation =
    location && String(location).trim()
      ? String(location).trim()
      : seller.location || '';

  const parsedPrice = parseFloat(price);
  const parsedStock = stock === undefined || stock === '' ? 0 : parseInt(stock, 10);

  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ error: 'Invalid price.' });
  }
  if (Number.isNaN(parsedStock) || parsedStock < 0) {
    return res.status(400).json({ error: 'Invalid stock quantity.' });
  }

  const result = db
    .prepare(
      `INSERT INTO products (name, description, price, category, image_url, stock, seller_id, location, video_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(name).trim(),
      String(description).trim(),
      parsedPrice,
      String(category).trim(),
      image_url && String(image_url).trim() ? String(image_url).trim() : PLACEHOLDER_IMAGE,
      parsedStock,
      req.session.userId,
      productLocation,
      video_url ? String(video_url).trim() : ''
    );

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ message: 'Product created.', product });
});

router.post('/products/upload-media', upload.single('media'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const publicPath = `/uploads/${req.file.filename}`;
  res.json({ url: publicPath, filename: req.file.filename });
});

router.put('/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid product id.' });
  }

  const existing = ownedProduct(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const { name, description, price, category, image_url, stock, location, video_url } = req.body;

  if (category !== undefined && !CATEGORIES.includes(String(category).trim())) {
    return res.status(400).json({ error: 'Please choose a valid category from the list.' });
  }

  const parsedPrice = price !== undefined ? parseFloat(price) : existing.price;
  const parsedStock = stock !== undefined ? parseInt(stock, 10) : existing.stock;

  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ error: 'Invalid price.' });
  }
  if (Number.isNaN(parsedStock) || parsedStock < 0) {
    return res.status(400).json({ error: 'Invalid stock quantity.' });
  }

  db.prepare(
    `UPDATE products SET name = ?, description = ?, price = ?, category = ?, image_url = ?,
     stock = ?, location = ?, video_url = ? WHERE id = ? AND seller_id = ?`
  ).run(
    name !== undefined ? String(name).trim() : existing.name,
    description !== undefined ? String(description).trim() : existing.description,
    parsedPrice,
    category !== undefined ? String(category).trim() : existing.category,
    image_url !== undefined && String(image_url).trim()
      ? String(image_url).trim()
      : existing.image_url,
    parsedStock,
    location !== undefined && String(location).trim() ? String(location).trim() : existing.location,
    video_url !== undefined ? String(video_url).trim() : existing.video_url || '',
    id,
    req.session.userId
  );

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json({ message: 'Product updated.', product });
});

router.patch('/products/stock/bulk', (req, res) => {
  const { stock, adjustment } = req.body;
  const mine = db.prepare('SELECT id, stock FROM products WHERE seller_id = ?').all(req.session.userId);
  if (!mine.length) {
    return res.status(400).json({ error: 'You have no products to update.' });
  }

  let compute;
  if (stock !== undefined && stock !== '') {
    const value = parseInt(stock, 10);
    if (Number.isNaN(value) || value < 0) {
      return res.status(400).json({ error: 'Invalid stock value.' });
    }
    compute = () => value;
  } else if (adjustment !== undefined) {
    const delta = parseInt(adjustment, 10);
    if (Number.isNaN(delta)) {
      return res.status(400).json({ error: 'Invalid adjustment value.' });
    }
    compute = (current) => Math.max(0, current + delta);
  } else {
    return res.status(400).json({ error: 'Provide stock or adjustment.' });
  }

  const apply = db.transaction(() => {
    const update = db.prepare('UPDATE products SET stock = ? WHERE id = ? AND seller_id = ?');
    for (const p of mine) {
      update.run(compute(p.stock), p.id, req.session.userId);
    }
  });
  apply();

  res.json({ message: `Stock updated for ${mine.length} product(s).` });
});

router.patch('/products/:id/stock', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid product id.' });
  }

  const existing = ownedProduct(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const { stock, adjustment } = req.body;
  let newStock = existing.stock;

  if (stock !== undefined) {
    newStock = parseInt(stock, 10);
    if (Number.isNaN(newStock) || newStock < 0) {
      return res.status(400).json({ error: 'Invalid stock value.' });
    }
  } else if (adjustment !== undefined) {
    const delta = parseInt(adjustment, 10);
    if (Number.isNaN(delta)) {
      return res.status(400).json({ error: 'Invalid adjustment value.' });
    }
    newStock = Math.max(0, existing.stock + delta);
  } else {
    return res.status(400).json({ error: 'Provide stock or adjustment.' });
  }

  db.prepare('UPDATE products SET stock = ? WHERE id = ? AND seller_id = ?').run(
    newStock,
    id,
    req.session.userId
  );

  const product = db.prepare('SELECT id, name, stock FROM products WHERE id = ?').get(id);
  res.json({ message: 'Stock updated.', product });
});

router.delete('/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid product id.' });
  }

  const existing = ownedProduct(id, req.session.userId);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const inOrders = db
    .prepare('SELECT id FROM order_items WHERE product_id = ? LIMIT 1')
    .get(id);
  if (inOrders) {
    return res.status(400).json({
      error: 'Cannot delete a product that appears in orders. Set stock to 0 instead.',
    });
  }

  db.prepare('DELETE FROM products WHERE id = ? AND seller_id = ?').run(id, req.session.userId);
  res.json({ message: 'Product deleted.' });
});

router.get('/orders', (req, res) => {
  const items = db
    .prepare(
      `SELECT oi.id AS order_item_id, oi.quantity, oi.price_at_purchase, oi.status,
              o.id AS order_id, o.created_at, o.shipping_address, o.phone AS buyer_contact_phone,
              u.username AS buyer_name, u.email AS buyer_email,
              p.id AS product_id, p.name AS product_name, p.image_url
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN users u ON u.id = o.user_id
       JOIN products p ON p.id = oi.product_id
       WHERE oi.seller_id = ?
       ORDER BY o.created_at DESC, oi.id DESC`
    )
    .all(req.session.userId);

  res.json({ items });
});

router.patch('/orders/items/:itemId/status', (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  if (Number.isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid order item id.' });
  }

  const { status } = req.body;
  const allowed = ['Shipped', 'Cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Status must be Shipped or Cancelled.' });
  }

  const item = db
    .prepare('SELECT * FROM order_items WHERE id = ? AND seller_id = ?')
    .get(itemId, req.session.userId);

  if (!item) {
    return res.status(404).json({ error: 'Order item not found.' });
  }

  if (item.status !== 'Pending' && status === 'Shipped') {
    return res.status(400).json({ error: 'Only pending items can be marked as shipped.' });
  }

  if (status === 'Cancelled' && item.status === 'Delivered') {
    return res.status(400).json({ error: 'Delivered items cannot be cancelled.' });
  }

  if (status === 'Cancelled' && item.status === 'Cancelled') {
    return res.status(400).json({ error: 'This item is already cancelled.' });
  }

  if (status === 'Cancelled' && (item.status === 'Pending' || item.status === 'Shipped')) {
    db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.product_id);
  }

  db.prepare('UPDATE order_items SET status = ? WHERE id = ?').run(status, itemId);

  const { syncOrderStatus } = require('../lib/order-utils');
  syncOrderStatus(item.order_id);

  const updated = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId);
  res.json({ message: 'Order item status updated.', item: updated });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (50 MB max).' : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Request failed.' });
  }
  next();
});

module.exports = router;
