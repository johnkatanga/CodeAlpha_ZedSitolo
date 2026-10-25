const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, (req, res) => {
  const { orderItemId, rating, comment } = req.body;

  const itemId = parseInt(orderItemId, 10);
  const ratingNum = parseInt(rating, 10);

  if (Number.isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid order item id.' });
  }
  if (Number.isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }
  if (!comment || String(comment).trim().length < 3) {
    return res.status(400).json({ error: 'Please write a short comment (at least 3 characters).' });
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

  if (item.status !== 'Delivered') {
    return res.status(400).json({ error: 'You can review items after confirming delivery.' });
  }

  const existing = db.prepare('SELECT id FROM reviews WHERE order_item_id = ?').get(itemId);
  if (existing) {
    return res.status(409).json({ error: 'You have already reviewed this item.' });
  }

  const result = db
    .prepare(
      `INSERT INTO reviews (order_item_id, user_id, product_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(itemId, req.session.userId, item.product_id, ratingNum, String(comment).trim());

  const review = db
    .prepare(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.username
       FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = ?`
    )
    .get(result.lastInsertRowid);

  res.status(201).json({ message: 'Review submitted. Thank you!', review });
});

module.exports = router;
