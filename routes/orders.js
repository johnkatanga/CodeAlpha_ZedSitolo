const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { syncOrderStatus } = require('../lib/order-utils');

const router = express.Router();

const VALID_STATUSES = ['Pending', 'Shipped', 'Delivered', 'Cancelled'];

function orderItemDetails(orderId) {
  return db
    .prepare(
      `SELECT oi.id AS order_item_id, oi.quantity, oi.price_at_purchase, oi.status,
              p.id AS product_id, p.name, p.image_url,
              u.username AS seller_name, u.phone AS seller_phone, u.location AS seller_location,
              (SELECT id FROM reviews WHERE order_item_id = oi.id) AS review_id
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN users u ON u.id = oi.seller_id
       WHERE oi.order_id = ?`
    )
    .all(orderId);
}

router.get('/', requireAuth, (req, res) => {
  const { status } = req.query;
  let orders = db
    .prepare(
      `SELECT id, user_id, total, shipping_address, phone, status, created_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(req.session.userId);

  if (status && VALID_STATUSES.includes(String(status))) {
    orders = orders.filter((o) => o.status === status);
  }

  const result = orders.map((order) => ({
    order,
    items: orderItemDetails(order.id),
  }));

  res.json({ orders: result });
});

router.post('/', requireAuth, (req, res) => {
  const { shippingAddress, phone, items } = req.body;

  if (!shippingAddress || !phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'Shipping address, phone, and at least one cart item are required.',
    });
  }

  const address = String(shippingAddress).trim();
  const phoneNumber = String(phone).trim();

  if (address.length < 10) {
    return res.status(400).json({ error: 'Please enter a complete shipping address.' });
  }

  if (phoneNumber.length < 7) {
    return res.status(400).json({ error: 'Please enter a valid phone number.' });
  }

  const normalizedItems = [];
  for (const item of items) {
    const productId = parseInt(item.productId, 10);
    const quantity = parseInt(item.quantity, 10);
    if (Number.isNaN(productId) || Number.isNaN(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Invalid cart item data.' });
    }
    normalizedItems.push({ productId, quantity });
  }

  const getProduct = db.prepare(
    'SELECT id, name, price, stock, seller_id FROM products WHERE id = ?'
  );

  let total = 0;
  const lineItems = [];

  for (const item of normalizedItems) {
    const product = getProduct.get(item.productId);
    if (!product) {
      return res.status(400).json({ error: `Product #${item.productId} is no longer available.` });
    }
    if (product.stock < item.quantity) {
      return res.status(400).json({
        error: `Insufficient stock for "${product.name}". Only ${product.stock} left.`,
      });
    }
    if (product.seller_id === req.session.userId) {
      return res.status(400).json({ error: `You cannot buy your own product "${product.name}".` });
    }
    total += product.price * item.quantity;
    lineItems.push({
      productId: product.id,
      sellerId: product.seller_id,
      quantity: item.quantity,
      priceAtPurchase: product.price,
    });
  }

  const placeOrder = db.transaction(() => {
    const orderResult = db
      .prepare(
        `INSERT INTO orders (user_id, total, shipping_address, phone, status)
         VALUES (?, ?, ?, ?, 'Pending')`
      )
      .run(req.session.userId, total, address, phoneNumber);

    const orderId = orderResult.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, seller_id, quantity, price_at_purchase, status)
      VALUES (?, ?, ?, ?, ?, 'Pending')
    `);

    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const line of lineItems) {
      insertItem.run(
        orderId,
        line.productId,
        line.sellerId,
        line.quantity,
        line.priceAtPurchase
      );
      updateStock.run(line.quantity, line.productId);
    }

    return orderId;
  });

  try {
    const orderId = placeOrder();
    const order = db
      .prepare(
        `SELECT id, user_id, total, shipping_address, phone, status, created_at
         FROM orders WHERE id = ?`
      )
      .get(orderId);

    res.status(201).json({
      message: 'Order placed successfully.',
      order,
      items: orderItemDetails(orderId),
    });
  } catch (err) {
    console.error('Order placement failed:', err);
    res.status(500).json({ error: 'Could not place order. Please try again.' });
  }
});

router.patch('/items/:itemId/confirm', requireAuth, (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  if (Number.isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid order item id.' });
  }

  const item = db
    .prepare(
      `SELECT oi.*, o.user_id
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.id = ? AND o.user_id = ?`
    )
    .get(itemId, req.session.userId);

  if (!item) {
    return res.status(404).json({ error: 'Order item not found.' });
  }

  if (item.status !== 'Shipped') {
    return res.status(400).json({ error: 'Only shipped items can be confirmed as delivered.' });
  }

  db.prepare("UPDATE order_items SET status = 'Delivered' WHERE id = ?").run(itemId);
  syncOrderStatus(item.order_id);

  const updated = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId);
  res.json({ message: 'Delivery confirmed. You can now leave a review.', item: updated });
});

router.get('/:id', requireAuth, (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  if (Number.isNaN(orderId)) {
    return res.status(400).json({ error: 'Invalid order id.' });
  }

  const order = db
    .prepare(
      `SELECT id, user_id, total, shipping_address, phone, status, created_at
       FROM orders WHERE id = ? AND user_id = ?`
    )
    .get(orderId, req.session.userId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  res.json({ order, items: orderItemDetails(orderId) });
});

module.exports = router;
