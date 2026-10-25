# ZedSitolo — Multi-vendor marketplace

Express + SQLite (`sql.js`) + vanilla HTML/CSS/JS. Supports **buyers**, **sellers**, inventory, order tracking, and product reviews.

## Project structure

```
ZedSitolo/
├── server.js
├── db.js
├── lib/order-utils.js
├── middleware/auth.js
├── routes/
│   ├── auth.js
│   ├── products.js
│   ├── orders.js
│   ├── seller.js
│   └── reviews.js
├── data/zedsitolo.db          (created at runtime)
└── public/
    ├── images/ZedSitolo.png   ← navbar logo (move your file here)
    ├── uploads/               ← seller media uploads
    ├── index.html
    ├── product.html
    ├── cart.html
    ├── checkout.html
    ├── orders.html            ← buyer order history & reviews
    ├── seller-dashboard.html
    ├── login.html
    ├── register.html
    └── css/, js/
```

## Database schema (SQLite)

**users** — `id`, `username`, `email`, `password_hash`, `role` (`buyer`|`seller`), `phone`, `location`, `created_at`

**products** — `id`, `name`, `description`, `price`, `category`, `image_url`, `stock`, `seller_id`, `location`, `video_url`, `created_at`

**orders** — `id`, `user_id`, `total`, `shipping_address`, `phone`, `status` (`Pending`|`Shipped`|`Delivered`|`Cancelled`), `created_at`

**order_items** — `id`, `order_id`, `product_id`, `seller_id`, `quantity`, `price_at_purchase`, `status` (same lifecycle as above, tracked per line)

**reviews** — `id`, `order_item_id` (unique), `user_id`, `product_id`, `rating` (1–5), `comment`, `created_at`

On startup, `db.js` runs **migrations** (adds missing columns) and backfills `seller_id` on products/order items. Legacy `confirmed` order status is converted to `Pending`.

## Setup (Windows 11)

```powershell
cd C:\Users\CtlAltDefeat\Projects\ZedSitolo
npm install
npm start
```

Open **http://localhost:3000**

### Logo

Place **`ZedSitolo.png`** at:

`public/images/ZedSitolo.png`

Express already serves the `public/` folder; the navbar uses `/images/ZedSitolo.png` on every page (height ~44px in CSS).

### Reset or migrate the database

**Option A — Fresh start (deletes local data):**

```powershell
Remove-Item .\data\zedsitolo.db -ErrorAction SilentlyContinue
npm start
```

**Option B — Keep data:** Just run `npm start`. Migrations run automatically.

## Marketplace test plan

1. **Seller onboarding** — Register as **Seller**, enter phone + location → lands on seller dashboard.
2. **Add product** — Create a listing with image URL, optional YouTube embed in video URL, stock (e.g. 5). Or upload media via the file input.
3. **Buyer account** — Log out; register as **Buyer** (or use another browser).
4. **Cart** — Add product; on cart page use **+ / −**, quantity input, or **Remove**.
5. **Checkout** — Log in if prompted; place order → **My orders** shows status **Pending**; product **stock decreases**.
6. **Seller ships** — Log in as seller → **Incoming orders** → **Mark shipped**.
7. **Buyer confirms** — **My orders** → **Confirm receipt** → status **Delivered**.
8. **Review** — Submit rating + comment on that line item; open **product detail** to see reviews.

## API overview

| Area | Endpoints |
|------|-----------|
| Auth | `POST /api/auth/register`, `login`, `logout`, `GET /me`, `PATCH /profile` |
| Shop | `GET /api/products`, `/categories`, `/:id`, `/:id/reviews` |
| Buyer orders | `GET /api/orders`, `POST /api/orders`, `PATCH /api/orders/items/:id/confirm` |
| Seller | `GET/POST/PUT/DELETE /api/seller/products`, `PATCH .../stock`, `POST .../upload-media`, seller order status |
| Reviews | `POST /api/reviews` |
