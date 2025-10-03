const express = require('express');
const { adminDb: db } = require('../lib/firebase-admin');

const router = express.Router();

// GET /api/testimonies
router.get('/', async (req, res) => {
  try {
    // Basic testimonies listing
    const snapshot = await db.collection("clips").orderBy("serviceDate", "desc").limit(50).get();
    const testimonies = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ testimonies });
  } catch (error) {
    console.error("[Testimonies API] Error:", error);
    res.status(500).json({ error: "Failed to fetch testimonies" });
  }
});

module.exports = router;