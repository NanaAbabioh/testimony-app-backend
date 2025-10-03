const express = require('express');
const { adminDb: db } = require('../lib/firebase-admin');

const router = express.Router();

// GET /api/admin/videos
router.get('/videos', async (req, res) => {
  try {
    // Basic video listing for admin
    const snapshot = await db.collection("clips").limit(100).get();
    const videos = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ videos });
  } catch (error) {
    console.error("[Admin Videos API] Error:", error);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    // Basic stats
    const clipsSnapshot = await db.collection("clips").get();
    const categoriesSnapshot = await db.collection("categories").get();

    res.json({
      totalClips: clipsSnapshot.size,
      totalCategories: categoriesSnapshot.size
    });
  } catch (error) {
    console.error("[Admin Stats API] Error:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

module.exports = router;