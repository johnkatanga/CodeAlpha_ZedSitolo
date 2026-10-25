const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { LEGACY_CATEGORY_MAP } = require('./lib/categories');

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'zedsitolo.db');

const PLATFORM_SELLER_EMAIL = 'marketplace@zedsitolo.local';
const PLATFORM_SELLER_USERNAME = 'ZedSitolo Official';

let sqlEngine = null;
let rawDb = null;
let inTransaction = false;

function persistDatabase() {
  if (!rawDb) return;
  const binary = rawDb.export();
  fs.writeFileSync(dbPath, Buffer.from(binary));
}

function prepare(sql) {
  return {
    get(...params) {
      const stmt = rawDb.prepare(sql);
      try {
        if (params.length) stmt.bind(params);
        if (stmt.step()) {
          return stmt.getAsObject();
        }
        return undefined;
      } finally {
        stmt.free();
      }
    },
    all(...params) {
      const stmt = rawDb.prepare(sql);
      const rows = [];
      try {
        if (params.length) stmt.bind(params);
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        return rows;
      } finally {
        stmt.free();
      }
    },
    run(...params) {
      rawDb.run(sql, params);
      const idRow = rawDb.exec('SELECT last_insert_rowid() AS id');
      const lastInsertRowid = idRow[0] ? idRow[0].values[0][0] : 0;
      if (!inTransaction) {
        persistDatabase();
      }
      return { lastInsertRowid, changes: rawDb.getRowsModified() };
    },
  };
}

const db = {
  exec(sql) {
    rawDb.exec(sql);
    if (!inTransaction) {
      persistDatabase();
    }
  },
  prepare,
  transaction(fn) {
    return (...args) => {
      inTransaction = true;
      rawDb.exec('BEGIN');
      try {
        const result = fn(...args);
        rawDb.exec('COMMIT');
        inTransaction = false;
        persistDatabase();
        return result;
      } catch (err) {
        inTransaction = false;
        try {
          rawDb.exec('ROLLBACK');
        } catch (rollbackErr) {
          /* ignore */
        }
        throw err;
      }
    };
  },
};

function tableHasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

function migrateSchema() {
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total REAL NOT NULL,
      shipping_address TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price_at_purchase REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_item_id INTEGER NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  if (!tableHasColumn('users', 'role')) {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'buyer'`);
  }
  if (!tableHasColumn('users', 'phone')) {
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
  }
  if (!tableHasColumn('users', 'location')) {
    db.exec(`ALTER TABLE users ADD COLUMN location TEXT`);
  }

  if (!tableHasColumn('products', 'seller_id')) {
    db.exec(`ALTER TABLE products ADD COLUMN seller_id INTEGER REFERENCES users(id)`);
  }
  if (!tableHasColumn('products', 'location')) {
    db.exec(`ALTER TABLE products ADD COLUMN location TEXT`);
  }
  if (!tableHasColumn('products', 'video_url')) {
    db.exec(`ALTER TABLE products ADD COLUMN video_url TEXT`);
  }

  if (!tableHasColumn('order_items', 'seller_id')) {
    db.exec(`ALTER TABLE order_items ADD COLUMN seller_id INTEGER REFERENCES users(id)`);
  }
  if (!tableHasColumn('order_items', 'status')) {
    db.exec(`ALTER TABLE order_items ADD COLUMN status TEXT NOT NULL DEFAULT 'Pending'`);
  }

  db.exec(`UPDATE orders SET status = 'Pending' WHERE status = 'confirmed' OR status = '' OR status IS NULL`);
  db.exec(`UPDATE order_items SET status = 'Pending' WHERE status IS NULL OR status = ''`);
  db.exec(`
    UPDATE order_items
    SET seller_id = (SELECT seller_id FROM products WHERE products.id = order_items.product_id)
    WHERE seller_id IS NULL
  `);

  for (const [oldName, newName] of Object.entries(LEGACY_CATEGORY_MAP)) {
    if (oldName !== newName) {
      db.prepare('UPDATE products SET category = ? WHERE category = ?').run(newName, oldName);
    }
  }

  persistDatabase();
}

function ensurePlatformSeller() {
  let seller = db.prepare('SELECT id FROM users WHERE email = ?').get(PLATFORM_SELLER_EMAIL);
  if (!seller) {
    const hash = bcrypt.hashSync('platform-seller-not-for-login', 10);
    const result = db
      .prepare(
        `INSERT INTO users (username, email, password_hash, role, phone, location)
         VALUES (?, ?, ?, 'seller', ?, ?)`
      )
      .run(
        PLATFORM_SELLER_USERNAME,
        PLATFORM_SELLER_EMAIL,
        hash,
        '+260 211 000 000',
        'Lusaka, Zambia — ZedSitolo Marketplace HQ'
      );
    seller = { id: result.lastInsertRowid };
  }

  db.prepare('UPDATE products SET seller_id = ? WHERE seller_id IS NULL').run(seller.id);
  db.prepare(
    `UPDATE products SET location = (SELECT location FROM users WHERE id = ?)
     WHERE seller_id = ? AND (location IS NULL OR location = '')`
  ).run(seller.id, seller.id);

  return seller.id;
}

function seedProducts(platformSellerId) {
  const countRow = db.prepare('SELECT COUNT(*) AS c FROM products').get();
  const count = countRow ? countRow.c : 0;
  if (count > 0) {
    return;
  }

  const insert = db.prepare(`
    INSERT INTO products (name, description, price, category, image_url, stock, seller_id, location, video_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sellerLocation = 'Lusaka, Zambia — ZedSitolo Marketplace HQ';

  const products = [
    [
      'Lusaka Wireless Headphones',
      'Premium over-ear headphones with active noise cancellation, 30-hour battery life, and deep bass tuned for everyday commuting in Zambia.',
      899.99,
      'Electronics & Mobile Accessories',
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop',
      45,
      platformSellerId,
      sellerLocation,
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'Copperbelt Canvas Tote',
      'Durable cotton tote with reinforced handles. Ideal for market runs, laptop carry, and weekend trips.',
      189.5,
      'Fashion & Beauty',
      'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=600&h=600&fit=crop',
      120,
      platformSellerId,
      sellerLocation,
      '',
    ],
    [
      'Victoria Falls Trail Boots',
      'Water-resistant hiking boots with grippy soles and ankle support for rocky trails and rainy season adventures.',
      649.0,
      'Sports',
      'https://images.unsplash.com/photo-1520256862855-398228c41684?w=600&h=600&fit=crop',
      38,
      platformSellerId,
      sellerLocation,
      '',
    ],
    [
      'Zed Brew Coffee Maker',
      'Programmable drip coffee maker with thermal carafe, brew-strength control, and auto shut-off for busy mornings.',
      429.99,
      'Home & Kitchen',
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=600&fit=crop',
      62,
      platformSellerId,
      sellerLocation,
      '',
    ],
    [
      'Mosi-oa-Tunya Smart Watch',
      'Fitness smartwatch with heart-rate monitoring, GPS tracking, sleep insights, and 7-day battery in smart mode.',
      1199.0,
      'Electronics & Mobile Accessories',
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop',
      29,
      platformSellerId,
      sellerLocation,
      'https://www.youtube.com/embed/LXb3EKWsInQ',
    ],
    [
      'Chikanda Yoga Mat',
      'Extra-thick non-slip yoga mat with carrying strap. Eco-friendly material suitable for home and studio practice.',
      249.99,
      'Sports',
      'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=600&h=600&fit=crop',
      85,
      platformSellerId,
      sellerLocation,
      '',
    ],
    [
      'Livingstone Desk Lamp',
      'Adjustable LED desk lamp with warm and cool light modes, touch dimmer, and USB charging port built into the base.',
      319.0,
      'Home & Kitchen',
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&h=600&fit=crop',
      54,
      platformSellerId,
      sellerLocation,
      '',
    ],
    [
      'Savanna Running Shoes',
      'Lightweight breathable runners with responsive cushioning designed for road training and casual wear.',
      579.5,
      'Sports',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop',
      71,
      platformSellerId,
      sellerLocation,
      '',
    ],
  ];

  for (const item of products) {
    insert.run(...item);
  }
  console.log(`Seeded ${products.length} sample products into the database.`);
}

function initDatabase() {
  return initSqlJs().then((SQL) => {
    sqlEngine = SQL;
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      rawDb = new SQL.Database(fileBuffer);
    } else {
      rawDb = new SQL.Database();
    }

    migrateSchema();
    const platformSellerId = ensurePlatformSeller();
    seedProducts(platformSellerId);
    persistDatabase();
  });
}

module.exports = { db, initDatabase };
