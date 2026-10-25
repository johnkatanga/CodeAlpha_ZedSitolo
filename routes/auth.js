const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const VALID_ROLES = ['buyer', 'seller'];

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role || 'buyer',
    phone: row.phone || '',
    location: row.location || '',
    created_at: row.created_at,
  };
}

router.post('/register', (req, res) => {
  const { username, email, password, role, phone, location } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }

  const trimmedUsername = String(username).trim();
  const trimmedEmail = String(email).trim().toLowerCase();
  const userRole = VALID_ROLES.includes(String(role)) ? String(role) : 'buyer';
  const trimmedPhone = phone ? String(phone).trim() : '';
  const trimmedLocation = location ? String(location).trim() : '';

  if (trimmedUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  if (userRole === 'seller') {
    if (trimmedPhone.length < 7) {
      return res.status(400).json({ error: 'Sellers must provide a valid phone contact number.' });
    }
    if (trimmedLocation.length < 5) {
      return res.status(400).json({ error: 'Sellers must provide a business or physical location.' });
    }
  }

  const existing = db
    .prepare('SELECT id FROM users WHERE email = ? OR username = ?')
    .get(trimmedEmail, trimmedUsername);

  if (existing) {
    return res.status(409).json({ error: 'Email or username is already registered.' });
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);

  const result = db
    .prepare(
      `INSERT INTO users (username, email, password_hash, role, phone, location)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      trimmedUsername,
      trimmedEmail,
      passwordHash,
      userRole,
      userRole === 'seller' ? trimmedPhone : trimmedPhone || null,
      userRole === 'seller' ? trimmedLocation : trimmedLocation || null
    );

  req.session.userId = result.lastInsertRowid;
  req.session.username = trimmedUsername;
  req.session.role = userRole;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json({
    message: 'Registration successful.',
    user: publicUser(user),
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const trimmedEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(trimmedEmail);

  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role || 'buyer';

  res.json({
    message: 'Login successful.',
    user: publicUser(user),
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out. Please try again.' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);

  if (!user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  res.json({ user: publicUser(user) });
});

router.patch('/profile', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const { phone, location } = req.body;
  const trimmedPhone = phone !== undefined ? String(phone).trim() : user.phone || '';
  const trimmedLocation = location !== undefined ? String(location).trim() : user.location || '';

  if (user.role === 'seller') {
    if (trimmedPhone.length < 7) {
      return res.status(400).json({ error: 'Please provide a valid phone contact number.' });
    }
    if (trimmedLocation.length < 5) {
      return res.status(400).json({ error: 'Please provide a business or physical location.' });
    }
  }

  db.prepare('UPDATE users SET phone = ?, location = ? WHERE id = ?').run(
    trimmedPhone || null,
    trimmedLocation || null,
    user.id
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ message: 'Profile updated.', user: publicUser(updated) });
});

module.exports = router;
