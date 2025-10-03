const express = require('express');

const router = express.Router();

// GET /api/user (placeholder)
router.get('/', async (req, res) => {
  res.json({ message: "User endpoint - to be implemented" });
});

module.exports = router;