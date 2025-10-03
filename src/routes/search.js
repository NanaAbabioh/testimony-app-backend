const express = require('express');

const router = express.Router();

// GET /api/search (placeholder)
router.get('/', async (req, res) => {
  res.json({ message: "Search endpoint - to be implemented", query: req.query.q });
});

module.exports = router;