const CATEGORIES = [
  'Electronics & Mobile Accessories',
  'Fashion & Beauty',
  'Home & Kitchen',
  'Arts, Crafts & Culture',
  'Local Foods & Groceries',
  'Sports',
  'Gifts & Celebration',
];

// Old category names used by earlier versions of the app -> new names
const LEGACY_CATEGORY_MAP = {
  Electronics: 'Electronics & Mobile Accessories',
  Fashion: 'Fashion & Beauty',
  Outdoors: 'Sports',
  Sports: 'Sports',
  'Home & Kitchen': 'Home & Kitchen',
};

module.exports = { CATEGORIES, LEGACY_CATEGORY_MAP };
