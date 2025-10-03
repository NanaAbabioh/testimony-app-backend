const express = require('express');
const { adminDb: db } = require('../lib/firebase-admin');

const router = express.Router();

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: "Database not initialized" });
    }

    const snapshot = await db.collection("categories").get();
    const categories = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ categories });
  } catch (error) {
    console.error("[Categories API] Error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

module.exports = router;