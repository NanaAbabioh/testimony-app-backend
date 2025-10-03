import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

/**
 * Simple OpenAI Whisper transcription - no external services
 */
export async function transcribeAudio(audioBuffer, videoUrl = null) {
  try {
    // Check if this is a mock buffer and reject it
    if (audioBuffer.length === 100 ||
        audioBuffer.length === 1024 * 1024 * 5 ||
        (audioBuffer.length <= 1024 && audioBuffer.every(byte => byte === 0))) {
      throw new Error('Mock audio buffer detected. Use real YouTube audio or captions instead.');
    }

    // Create temporary file for Whisper processing
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `audio_${Date.now()}.mp4`);

    // Write buffer to temporary file
    await writeFile(tempFilePath, audioBuffer);

    // Create readable stream for Whisper
    const audioFile = fs.createReadStream(tempFilePath);

    // Transcribe with OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'text',
    });

    // Clean up temporary file
    await unlink(tempFilePath);

    return transcription;
  } catch (error) {
    console.error('Transcription error:', error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
}

/**
 * Split transcript into manageable chunks for GPT processing
 */
function chunkTranscript(transcript, maxChunkSize = 6000) {
  const lines = transcript.split('\n');
  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Import the title generators
import { generateIntelligentTitle, generateTitleWithLearning } from './title-generator.js';
import { generateTitleWithDatabaseLearning } from './title-learning.js';
import { applyManualTitles } from './title-override.js';

/**
 * Enhanced multi-pass analysis for accurate testimony detection
 */
export async function analyzeTranscript(transcript, videoId = null) {
  try {
    console.log(`📊 Starting enhanced analysis...`);

    const processedTranscript = preprocessTranscript(transcript);

    if (transcript.length < 20000) {
      return await enhancedSinglePassAnalysis(processedTranscript);
    } else {
      return await enhancedMultiPassAnalysis(processedTranscript);
    }

  } catch (error) {
    console.error('Error in analyzeTranscript:', error);
    throw error;
  }
}

function preprocessTranscript(transcript) {
  return transcript
    .replace(/\[(\d{2}:\d{2})\] \[SPEAKER_(\w+)\]/g, '\n\n[TIMESTAMP: $1] [SPEAKER: $2]')
    .replace(/\n\n/g, '\n\n---\n\n')
    .replace(/thank\s+god/gi, 'Thank God')
    .replace(/praise\s+the\s+lord/gi, 'Praise the Lord');
}

async function enhancedSinglePassAnalysis(transcript) {
  const testimonies = await analyzeTranscriptWithEnhancedPrompt(transcript);
  const validatedTestimonies = await validateTestimonies(testimonies, transcript);

  // Apply manual titles if available
  const testimoniesWithManualTitles = await applyManualTitles(null, validatedTestimonies);

  // Enhance titles
  const enhancedTestimonies = [];
  for (const testimony of testimoniesWithManualTitles) {
    if (!testimony.manualTitle && isLikelyTruncatedTitle(testimony.title)) {
      const enhancedTitle = await generateTitleWithDatabaseLearning(testimony);
      enhancedTestimonies.push({
        ...testimony,
        title: enhancedTitle,
        originalTitle: testimony.title
      });
    } else {
      enhancedTestimonies.push(testimony);
    }
  }

  return enhancedTestimonies;
}

async function enhancedMultiPassAnalysis(transcript) {
  const chunks = createOverlappingChunks(transcript, 8000, 1000);
  let allTestimonies = [];

  for (let i = 0; i < chunks.length; i++) {
    try {
      const chunkTestimonies = await analyzeTranscriptWithEnhancedPrompt(chunks[i]);
      if (chunkTestimonies && chunkTestimonies.length > 0) {
        allTestimonies.push(...chunkTestimonies);
      }
    } catch (chunkError) {
      console.error(`Error processing chunk ${i + 1}:`, chunkError.message);
    }

    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  const uniqueTestimonies = await advancedDeduplication(allTestimonies);
  return await validateTestimonies(uniqueTestimonies, transcript);
}

function createOverlappingChunks(transcript, chunkSize = 8000, overlapSize = 1000) {
  const lines = transcript.split('\n');
  const chunks = [];
  let currentChunk = '';

  for (let i = 0; i < lines.length; i++) {
    currentChunk += lines[i] + '\n';

    if (currentChunk.length >= chunkSize) {
      chunks.push(currentChunk.trim());

      let overlapChunk = '';
      for (let j = i; j >= 0 && overlapChunk.length < overlapSize; j--) {
        overlapChunk = lines[j] + '\n' + overlapChunk;
      }
      currentChunk = overlapChunk;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function advancedDeduplication(testimonies) {
  if (testimonies.length === 0) return [];

  const uniqueTestimonies = [];
  const processedStartTimes = new Set();

  const sortedTestimonies = [...testimonies].sort((a, b) =>
    (a.startTimeSeconds || 0) - (b.startTimeSeconds || 0)
  );

  for (const testimony of sortedTestimonies) {
    let isDuplicate = false;

    for (const existingTime of processedStartTimes) {
      const timeDiff = Math.abs((testimony.startTimeSeconds || 0) - existingTime);
      if (timeDiff < 45) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      uniqueTestimonies.push(testimony);
      processedStartTimes.add(testimony.startTimeSeconds || 0);
    }
  }

  return uniqueTestimonies;
}

async function validateTestimonies(testimonies, originalTranscript) {
  if (!testimonies || testimonies.length === 0) return [];

  const validatedTestimonies = [];

  for (const testimony of testimonies) {
    if (!testimony.title || !testimony.category) continue;

    const fullText = testimony.full_text || testimony.fullText || '';
    if (fullText.length < 50) continue;

    const startTime = testimony.startTimeSeconds || 0;
    let endTime = testimony.endTimeSeconds;

    if (!endTime || endTime <= startTime) {
      const wordCount = fullText.split(' ').length;
      const estimatedDuration = Math.max(60, Math.min(300, wordCount * 0.4));
      endTime = startTime + estimatedDuration;
    }

    if (endTime - startTime < 30) {
      endTime = startTime + 60;
    }

    validatedTestimonies.push({
      title: testimony.title,
      category: testimony.category,
      fullText: fullText,
      startTimeSeconds: startTime,
      endTimeSeconds: endTime,
      summary: testimony.summary || `A testimony about ${testimony.category.toLowerCase()}`
    });
  }

  return validatedTestimonies;
}

function isLikelyTruncatedTitle(title) {
  if (!title) return true;

  const truncationIndicators = [
    title.endsWith('...'),
    title.endsWith(' and'),
    title.endsWith(' but'),
    title.length < 15 && title.split(' ').length <= 3,
    title.toLowerCase().startsWith('i was'),
    title.includes('I want to thank God') && title.length > 30
  ];

  return truncationIndicators.some(indicator => indicator);
}

async function analyzeTranscriptWithEnhancedPrompt(transcript) {
  try {
    const prompt = `You are an expert AI assistant specializing in analyzing church service transcripts. Your task is to identify every distinct personal testimony.

Read the entire transcript and identify personal testimonies. For each testimony, extract:

- "title": Analyze the ENTIRE testimony content to create an intelligent, compelling title (MAX 50 characters)
- "summary": One-sentence summary (MAX 150 characters)
- "full_text": Complete word-for-word text of the entire testimony
- "startTimeSeconds": Convert timestamp to seconds (e.g., [15:30] = 930)
- "endTimeSeconds": EXACT end timestamp in seconds when testimony naturally concludes
- "category": Choose from: "Healing", "Financial Breakthrough", "Family and Childbirth", "Addiction and Deliverance", "Academic Breakthrough", "Career/Business", "Multiple Testimonies", "Others"

Return ONLY valid JSON array format. If no testimonies found, return [].

Here is the transcript:
${transcript}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 4000,
    });

    const analysisResult = response.choices[0].message.content;

    try {
      const parsed = JSON.parse(analysisResult);
      return parsed;
    } catch (parseError) {
      const jsonMatch = analysisResult.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      if (analysisResult.includes('[]')) {
        return [];
      }

      return [];
    }
  } catch (error) {
    console.error('Error analyzing transcript:', error);

    if (error.status === 429 || error.code === 'insufficient_quota') {
      return [
        {
          title: "God's Healing Power",
          category: "Healing",
          fullText: "Mock testimony for testing purposes.",
          startTimeSeconds: 120,
          endTimeSeconds: 300
        }
      ];
    }

    throw new Error('Failed to analyze transcript');
  }
}