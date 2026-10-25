const { db } = require('../db');

function syncOrderStatus(orderId) {
  const rows = db.prepare('SELECT status FROM order_items WHERE order_id = ?').all(orderId);
  if (!rows.length) return;

  const statuses = rows.map((r) => r.status);
  let orderStatus = 'Pending';

  if (statuses.every((s) => s === 'Cancelled')) {
    orderStatus = 'Cancelled';
  } else if (statuses.every((s) => s === 'Delivered' || s === 'Cancelled')) {
    const active = statuses.filter((s) => s !== 'Cancelled');
    orderStatus = active.length && active.every((s) => s === 'Delivered') ? 'Delivered' : 'Pending';
  } else if (statuses.some((s) => s === 'Shipped' || s === 'Delivered')) {
    orderStatus = statuses.every((s) => s === 'Delivered' || s === 'Cancelled')
      ? 'Delivered'
      : 'Shipped';
  }

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(orderStatus, orderId);
}

module.exports = { syncOrderStatus };
