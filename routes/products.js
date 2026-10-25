const express = require('express');
const { db } = require('../db');
const { CATEGORIES } = require('../lib/categories');

const router = express.Router();

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.description, p.price, p.category, p.image_url, p.stock,
         p.location, p.video_url, p.seller_id, p.created_at,
         u.username AS seller_name, u.phone AS seller_phone, u.location AS seller_location
  FROM products p
  LEFT JOIN users u ON u.id = p.seller_id
`;

router.get('/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

router.get('/', (req, res) => {
  const { category, search } = req.query;
  let sql = `${PRODUCT_SELECT} WHERE 1=1`;
  const params = [];

  if (category && String(category).trim() !== '' && String(category).toLowerCase() !== 'all') {
    sql += ' AND p.category = ?';
    params.push(String(category).trim());
  }

  if (search && String(search).trim() !== '') {
    sql += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?)';
    const term = `%${String(search).trim()}%`;
    params.push(term, term, term);
  }

  sql += ' ORDER BY p.name ASC';

  const products = db.prepare(sql).all(...params);
  res.json({ products });
});

router.get('/:id/reviews', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid product id.' });
  }

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const reviews = db
    .prepare(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.username
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(id);

  const avgRow = db
    .prepare('SELECT AVG(rating) AS avg_rating, COUNT(*) AS count FROM reviews WHERE product_id = ?')
    .get(id);

  const count = avgRow ? avgRow.count : 0;
  res.json({
    reviews,
    summary: {
      averageRating:
        count && avgRow.avg_rating != null
          ? Number(Number(avgRow.avg_rating).toFixed(1))
          : null,
      count,
    },
  });
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid product id.' });
  }

  const product = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  res.json({ product });
});

module.exports = router;
