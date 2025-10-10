const express = require('express');
const { adminDb: db } = require('../lib/firebase-admin');
const { requireAdmin } = require('../lib/requireAdmin');
const { parseTimeToSeconds } = require('../lib/parse');
const { processVideoAndUpload } = require('../lib/video-processor');
const OpenAI = require('openai');

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper to extract video ID from YouTube URL
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  throw new Error(`Could not extract video ID from URL: ${url}`);
}

// POST /api/admin/clips/manual - Create a single manual clip
router.post('/manual', async (req, res) => {
  try {
    const admin = await requireAdmin(req.headers.authorization);

    const {
      videoUrl,
      videoId: providedVideoId,
      title,
      categoryId,
      startTime,
      endTime,
      start,
      end,
      description = '',
      transcript = '',
      transcriptLang = 'en'
    } = req.body;

    // Extract video ID from URL if provided
    let videoId = providedVideoId;
    if (videoUrl && !videoId) {
      try {
        videoId = extractVideoId(videoUrl);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }

    // Validation
    if (!videoId?.trim()) {
      return res.status(400).json({ error: 'videoId is required and cannot be empty' });
    }

    if (!title?.trim()) {
      return res.status(400).json({ error: 'title is required and cannot be empty' });
    }

    if (!categoryId?.trim()) {
      return res.status(400).json({ error: 'categoryId is required and cannot be empty' });
    }

    if (title.trim().length > 200) {
      return res.status(400).json({ error: 'title must be 200 characters or less' });
    }

    // Parse times
    const startTimeValue = startTime || start;
    const endTimeValue = endTime || end;

    let startSec, endSec;
    try {
      startSec = parseTimeToSeconds(startTimeValue);
    } catch (error) {
      return res.status(400).json({
        error: `Invalid start time: ${error.message}`
      });
    }

    try {
      endSec = parseTimeToSeconds(endTimeValue);
    } catch (error) {
      return res.status(400).json({
        error: `Invalid end time: ${error.message}`
      });
    }

    if (endSec <= startSec) {
      return res.status(400).json({ error: 'End time must be greater than start time' });
    }

    const duration = endSec - startSec;
    if (duration > 1800) {
      return res.status(400).json({ error: 'Clip duration cannot exceed 30 minutes' });
    }

    if (duration < 5) {
      return res.status(400).json({ error: 'Clip duration must be at least 5 seconds' });
    }

    // Check category exists
    const categoryDoc = await db.collection('categories').doc(categoryId).get();
    if (!categoryDoc.exists) {
      return res.status(400).json({ error: 'Category not found' });
    }

    // Create or update video document
    const videoRef = db.collection('videos').doc(videoId);
    const videoDoc = await videoRef.get();

    if (!videoDoc.exists) {
      await videoRef.set({
        id: videoId,
        title: `Video ${videoId}`,
        url: videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        createdAt: new Date().toISOString(),
        uploadDate: new Date().toISOString(),
        status: 'live'
      });
    }

    // Process video extraction
    let processedClipUrl = '';
    let videoProcessingError = null;

    try {
      console.log(`🎬 Extracting video clip: ${title} (${startSec}s-${endSec}s)`);
      const youtubeUrlForProcessing = videoUrl || `https://www.youtube.com/watch?v=${videoId}`;
      processedClipUrl = await processVideoAndUpload(
        youtubeUrlForProcessing,
        startSec,
        endSec
      );
      console.log(`✅ Video extracted successfully: ${processedClipUrl}`);
    } catch (extractError) {
      console.warn(`⚠️ Video extraction failed for clip: ${extractError.message}`);
      videoProcessingError = extractError.message || 'Unknown extraction error';
    }

    // Create clip document
    const clipDoc = db.collection('clips').doc();
    const clipData = {
      id: clipDoc.id,
      sourceVideoId: videoId.trim(),
      title: title.trim(),
      categoryId: categoryId.trim(),
      startTimeSeconds: startSec,
      endTimeSeconds: endSec,
      duration,
      fullText: description || transcript.trim(),
      language: transcriptLang.trim() || 'English',
      processedClipUrl: processedClipUrl,
      videoProcessingError: videoProcessingError,
      status: 'published',
      savedCount: 0,
      createdAt: new Date().toISOString(),
      createdBy: admin.uid,
      source: 'manual',
      confidence: 1.0,
    };

    await clipDoc.set(clipData);

    res.json({
      success: true,
      id: clipDoc.id,
      clip: {
        id: clipDoc.id,
        title: clipData.title,
        duration: clipData.duration,
        startTimeSeconds: clipData.startTimeSeconds,
        endTimeSeconds: clipData.endTimeSeconds,
        processedClipUrl: clipData.processedClipUrl,
        videoProcessingError: clipData.videoProcessingError
      }
    });

  } catch (error) {
    console.error('Error creating manual clip:', error);

    if (error.message?.includes('Unauthorized')) {
      return res.status(401).json({ error: 'Unauthorized access' });
    }

    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// POST /api/admin/clips/import - Bulk import clips
router.post('/import', async (req, res) => {
  try {
    const admin = await requireAdmin(req.headers.authorization);

    const { clips } = req.body;

    // Fetch categories
    const categoriesSnapshot = await db.collection('categories').get();
    const categories = categoriesSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name
    }));

    if (!clips || !Array.isArray(clips) || clips.length === 0) {
      return res.status(400).json({ error: 'No clips provided' });
    }

    if (clips.length > 100) {
      return res.status(400).json({
        error: `Too many clips. Maximum 100 clips per import. You provided ${clips.length}.`
      });
    }

    // Process clips that need AI for title generation
    const processedClips = [];
    const categoryList = categories.map(c => c.name).join(', ');

    console.log(`Processing ${clips.length} clips`);

    // Process in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < clips.length; i += BATCH_SIZE) {
      const batch = clips.slice(i, Math.min(i + BATCH_SIZE, clips.length));
      const batchPromises = [];

      for (const clip of batch) {
        const needsAITitle = !clip.clipTitle && clip.briefDescription;

        if (needsAITitle) {
          const aiPromise = openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
              {
                role: 'system',
                content: `You are an expert AI assistant that creates compelling titles for church testimonies.

                INSTRUCTIONS:
                1. TITLE CREATION: Create a concise, meaningful title that captures the essence of the testimony
                2. For multi-topic testimonies, use format "Main Topic | Secondary Topic" (e.g., "Cancer Healing | Job Promotion")
                3. Keep titles descriptive but concise (4-10 words maximum)
                4. Use active, positive language
                5. Focus on the outcome or breakthrough mentioned

                Respond with ONLY the title text (no JSON, no quotes, just the title):`
              },
              {
                role: 'user',
                content: `Generate a title for this testimony: ${clip.briefDescription}`
              }
            ],
            temperature: 0.2,
            max_tokens: 150,
          }).then(completion => {
            const aiResponse = completion.choices[0].message.content;
            const generatedTitle = aiResponse?.trim() || clip.briefDescription.slice(0, 50);

            return {
              ...clip,
              clipTitle: generatedTitle
            };
          }).catch(error => {
            console.error('AI processing error:', error);
            return { ...clip, clipTitle: clip.briefDescription.slice(0, 50) };
          });

          batchPromises.push(aiPromise);
        } else {
          batchPromises.push(Promise.resolve(clip));
        }
      }

      const batchResults = await Promise.all(batchPromises);
      processedClips.push(...batchResults);

      // Delay between batches
      if (i + BATCH_SIZE < clips.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Save clips to Firestore
    const batch = db.batch();
    const savedClips = [];
    const errors = [];

    for (const clip of processedClips) {
      try {
        const videoId = extractVideoId(clip.youtubeLink);
        const startTimeSeconds = parseTimeToSeconds(clip.startTime);
        const endTimeSeconds = parseTimeToSeconds(clip.endTime);

        // Find category
        let categoryDoc = categories.find(c =>
          c.name.toLowerCase() === clip.category?.toLowerCase()
        );

        if (!categoryDoc && clip.category) {
          const categoryId = clip.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const catRef = await db.collection('categories').doc(categoryId).get();
          if (catRef.exists) {
            categoryDoc = { id: categoryId, name: catRef.data()?.name || clip.category };
          } else {
            categoryDoc = { id: categoryId, name: clip.category };
          }
        }

        if (!categoryDoc) {
          errors.push({
            episode: clip.episode,
            error: `Category not found: ${clip.category}`
          });
          continue;
        }

        // Check/create video
        const videoRef = db.collection('videos').doc(videoId);
        const videoDoc = await videoRef.get();

        if (!videoDoc.exists) {
          batch.set(videoRef, {
            id: videoId,
            title: `Episode ${clip.episode}`,
            url: clip.youtubeLink,
            thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            createdAt: new Date().toISOString(),
            uploadDate: new Date().toISOString(),
            status: 'live'
          });
        }

        // Extract video clip
        let processedClipUrl = '';
        let videoProcessingError = null;

        try {
          console.log(`🎬 Extracting video clip: ${clip.clipTitle || 'Untitled'} (${startTimeSeconds}s-${endTimeSeconds}s)`);
          processedClipUrl = await processVideoAndUpload(
            clip.youtubeLink,
            startTimeSeconds,
            endTimeSeconds
          );
          console.log(`✅ Video extracted successfully: ${processedClipUrl}`);
        } catch (extractError) {
          console.warn(`⚠️ Video extraction failed for clip: ${extractError.message}`);
          videoProcessingError = extractError.message || 'Unknown extraction error';
        }

        // Create clip
        const clipRef = db.collection('clips').doc();
        const clipData = {
          sourceVideoId: videoId,
          categoryId: categoryDoc.id,
          title: clip.clipTitle || 'Untitled Testimony',
          startTimeSeconds,
          endTimeSeconds,
          fullText: clip.briefDescription,
          language: clip.language,
          episode: clip.episode,
          processedClipUrl: processedClipUrl,
          videoProcessingError: videoProcessingError,
          createdAt: new Date().toISOString(),
          createdBy: 'csv-import'
        };

        batch.set(clipRef, clipData);
        savedClips.push({
          ...clipData,
          id: clipRef.id
        });

      } catch (error) {
        errors.push({
          episode: clip.episode,
          error: error.message || 'Processing error'
        });
      }
    }

    // Commit batch
    await batch.commit();

    // Count results
    const clipsWithVideos = savedClips.filter(c => c.processedClipUrl && c.processedClipUrl.trim() !== '').length;
    const clipsWithoutVideos = savedClips.length - clipsWithVideos;

    res.json({
      success: true,
      imported: savedClips.length,
      errors: errors.length,
      details: {
        savedClips: savedClips.length,
        errors: errors.slice(0, 5),
        total: clips.length,
        videosExtracted: clipsWithVideos,
        videoExtractionFailed: clipsWithoutVideos,
        errorSample: errors.length > 0 ? errors[0] : null
      }
    });

  } catch (error) {
    console.error('Import error:', error);

    if (error.message?.includes('Unauthorized')) {
      return res.status(401).json({ error: 'Unauthorized access' });
    }

    res.status(500).json({ error: error.message || 'Import failed' });
  }
});

module.exports = router;
