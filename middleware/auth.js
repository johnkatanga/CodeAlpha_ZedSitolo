function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  next();
}

function requireSeller(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  if (req.session.role !== 'seller') {
    return res.status(403).json({ error: 'Seller account required.' });
  }
  next();
}

function requireBuyer(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  if (req.session.role !== 'buyer') {
    return res.status(403).json({ error: 'Buyer account required for this action.' });
  }
  next();
}

module.exports = { requireAuth, requireSeller, requireBuyer };
