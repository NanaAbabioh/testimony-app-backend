const express = require('express');
const { processVideoAndUpload } = require('../lib/video-processor');

const router = express.Router();

// POST /api/process-video
router.post('/', async (req, res) => {
  try {
    const { youtubeUrl, startTime, endTime } = req.body;

    if (!youtubeUrl || typeof startTime !== 'number' || typeof endTime !== 'number') {
      return res.status(400).json({
        error: "Missing required fields: youtubeUrl, startTime, endTime"
      });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        error: "Start time must be less than end time"
      });
    }

    console.log('🎬 Processing video:', { youtubeUrl, startTime, endTime });

    const publicUrl = await processVideoAndUpload(youtubeUrl, startTime, endTime);

    res.json({
      success: true,
      publicUrl,
      message: "Video processed and uploaded successfully"
    });

  } catch (error) {
    console.error("[Process Video API] Error:", error);
    res.status(500).json({
      error: "Failed to process video",
      message: error.message
    });
  }
});

module.exports = router;