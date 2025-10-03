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
 * Transcribe audio using OpenAI Whisper
 */
export async function transcribeAudio(audioBuffer, videoUrl = null) {
  try {
    
    // Check if this is the caption-based buffer (small size with pattern 2)
    if (audioBuffer.length === 100 && audioBuffer[0] === 2) {
      throw new Error('YouTube transcript extraction failed. Use real audio buffer or YouTube captions instead.');
    }
    
    // Check if this is the old development buffer (large size with pattern 1)
    if (audioBuffer.length === 1024 * 1024 * 5 && audioBuffer[0] === 1) {
      console.error('🚨 CRITICAL ISSUE: Cannot create accurate transcript without real YouTube audio');
      console.error('❌ The current system uses fake timing that does not match the actual video');
      console.error('❌ This causes video clips to play wrong content at wrong times');
      console.error('🔧 SOLUTION NEEDED: Real YouTube transcript extraction');
      
      // Instead of fake transcript, throw error to prevent wrong timing
      throw new Error('Cannot process video accurately without real transcript. The system would create clips with wrong timing that do not match the actual video content. Please implement real YouTube transcription service.');
    }
    
    // Check if this is an old-style empty mock buffer
    if (audioBuffer.length <= 1024 && audioBuffer.every(byte => byte === 0)) {
      console.error('🚨 CRITICAL: Empty mock audio buffer detected!');
      throw new Error('Failed to download real audio from YouTube. Cannot process video with empty mock data as timing will be completely wrong.');
      
      // OLD CODE - returning mock transcript (commenting out to prevent incorrect timing)
      /*
      console.warn('Detected mock audio buffer, returning mock transcript');
      return `[00:15:30] Welcome to Alpha Hour! Pastor here, and today we have amazing testimonies to share with you.

[00:16:45] Let me start with our praise and worship time... [music plays]

[00:25:20] Now, let's dive into God's word. Today we're talking about faith and miracles.

[00:45:15] But before we continue, I want to share some powerful testimonies that came in this week. These are real people with real stories of God's goodness.

[00:46:17] Everyday with God is everyday in victory! Sister Mary from Lagos called us yesterday and said: "Pastor, I have to share this miracle! I was diagnosed with cancer last year and the doctors gave me only three months to live. But I prayed and trusted in God every single day. When I went back for my scan last week, the doctors said the tumor had completely disappeared. They can't explain it, but I know it was God! Praise the Lord!" Glory to God! What an amazing testimony of healing.

[00:48:52] Everyday with God is everyday in victory! Brother James from Abuja wrote to us: "Pastor, I was unemployed for eight months and my family was struggling financially. We were about to lose our house and I didn't know what to do. But I decided to tithe faithfully and trust God completely, even with the little we had. Pastor, within two weeks of that decision, I received three different job offers! I now earn double my previous salary. God is faithful!" Hallelujah! God is our provider.

[00:51:38] Everyday with God is everyday in victory! Sister Grace sent us this beautiful message: "Pastor, my marriage was falling apart after 15 years. My husband and I were not speaking to each other and divorce seemed inevitable. But through prayer and God's intervention, our love has been restored. We went for counseling, we prayed together, and now we are stronger than ever. God can restore anything!" Praise God for restoration!

[00:54:20] Everyday with God is everyday in victory! Brother Paul from Kano wrote: "Pastor, I was addicted to alcohol for 20 years. I lost my job, my family left me, and I was living on the streets. But one night, I heard your program on the radio and gave my life to Jesus. Instantly, the desire for alcohol left me. I've been sober for 3 years now, got my family back, and have a good job. Jesus set me free!" Glory to God for deliverance!

[00:57:10] Everyday with God is everyday in victory! Sister Ruth from Port Harcourt called us crying with joy: "Pastor, my son had been missing for 6 months. The police said there was no hope. But I never stopped praying and believing God would bring him home. Last week, he walked through our front door, safe and sound. Someone had been taking care of him all this time. God protected my child!" Hallelujah! God is our protector.

[00:59:45] Everyday with God is everyday in victory! Brother Daniel from Kaduna shared: "Pastor, my business was failing and I was millions in debt. I was about to declare bankruptcy when I heard your teaching on seed faith. I sowed my last 50,000 naira and believed God for a miracle. Within one month, I received the biggest contract of my life worth 50 million naira! God turned my situation around completely." Praise the Lord!

[01:03:20] These are just some of the amazing testimonies we received this week. God is still working miracles in our lives!

[01:04:00] Now let's continue with our message about faith...`;
      */
    }
    
    // Create a temporary file for the audio
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, `audio_${Date.now()}.mp4`);
    
    // Write buffer to temporary file
    await writeFile(tempFilePath, audioBuffer);
    
    // Create a readable stream from the file
    const audioFile = fs.createReadStream(tempFilePath);
    
    // Transcribe using Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'text',
    });
    
    // Clean up temporary file
    await unlink(tempFilePath);
    
    return transcription;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    
    // Provide helpful error messages based on error type
    
    if (error.message.includes('ECONNRESET') || error.message.includes('aborted')) {
      throw new Error('Network connection error while downloading audio. This may be due to YouTube restrictions or network issues. Please try again or use a different video.');
    }
    
    if (error.message.includes('Failed to download audio')) {
      throw new Error('Could not download audio from YouTube. The video may be private, restricted, or blocked. Try a different Alpha Hour video that is publicly accessible.');
    }
    
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
    // If adding this line would exceed the limit, start a new chunk
    if (currentChunk.length + line.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  // Add the final chunk if it has content
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Enhanced multi-pass analysis for accurate testimony detection
 */
// Import the title generator for enhanced title creation
import { generateIntelligentTitle, generateTitleWithLearning } from './title-generator.js';
import { generateTitleWithDatabaseLearning } from './title-learning.js';
import { applyManualTitles } from './title-override.js';

/**
 * Extract video ID from transcript (helper function)
 * This is a fallback - in practice we should pass videoId directly
 */
function extractVideoId(transcript) {
  // Try to extract from transcript content if it contains YouTube URL
  const urlMatch = transcript.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  // If not found, return null - manual titles should be provided by video ID separately
  return null;
}

/**
 * Detect if a title looks like it was truncated from the first line
 */
function isLikelyTruncatedTitle(title) {
  if (!title) return true;
  
  // Check for common truncation indicators
  const truncationIndicators = [
    title.endsWith('...'),
    title.endsWith(' and'),
    title.endsWith(' but'),
    title.endsWith(' or'),
    title.endsWith(' so'),
    title.endsWith(' because'),
    title.length < 15 && title.split(' ').length <= 3, // Very short, generic titles
    title.toLowerCase().startsWith('i was') || title.toLowerCase().startsWith('i had'),
    title.includes('I want to thank God') && title.length > 30, // Starts with common opening
    title.toLowerCase().includes('pastor') && title.length < 30, // Generic pastor mentions
    /^[A-Z][a-z]+ [a-z]+ [a-z]+$/i.test(title) && title.length < 25 // Simple 3-word patterns
  ];
  
  return truncationIndicators.some(indicator => indicator);
}

export async function analyzeTranscript(transcript, videoId = null) {
  try {
    console.log(`📊 Starting enhanced multi-pass analysis...`);
    console.log(`📊 Original transcript length: ${transcript.length} characters`);
    
    // Step 1: Pre-process transcript to identify speaker segments
    const processedTranscript = preprocessTranscript(transcript);
    console.log(`📊 Processed transcript length: ${processedTranscript.length} characters`);
    
    // Step 2: Multi-pass analysis for better accuracy
    if (transcript.length < 20000) {
      console.log('📝 Using single-pass analysis for small transcript');
      return await enhancedSinglePassAnalysis(processedTranscript);
    } else {
      console.log('📝 Using multi-pass analysis for large transcript');
      return await enhancedMultiPassAnalysis(processedTranscript);
    }
    
  } catch (error) {
    console.error('Error in enhanced analyzeTranscript:', error);
    throw error;
  }
}

/**
 * Pre-process transcript to improve speaker identification and segment boundaries
 */
function preprocessTranscript(transcript) {
  console.log('🔄 Pre-processing transcript for better analysis...');
  
  // Add clear speaker boundaries and enhance formatting
  let processed = transcript
    // Enhance speaker labels for clarity
    .replace(/\[(\d{2}:\d{2})\] \[SPEAKER_(\w+)\]/g, '\n\n[TIMESTAMP: $1] [SPEAKER: $2]')
    // Add clear section breaks
    .replace(/\n\n/g, '\n\n---\n\n')
    // Normalize common testimony phrases
    .replace(/thank\s+god/gi, 'Thank God')
    .replace(/praise\s+the\s+lord/gi, 'Praise the Lord')
    .replace(/glory\s+to\s+god/gi, 'Glory to God')
    .replace(/hallelujah/gi, 'Hallelujah');
  
  return processed;
}

/**
 * Enhanced single-pass analysis with improved prompting
 */
async function enhancedSinglePassAnalysis(transcript) {
  console.log('🎯 Running enhanced single-pass analysis...');
  
  try {
    const testimonies = await analyzeTranscriptWithEnhancedPrompt(transcript);
    
    // Validation pass
    const validatedTestimonies = await validateTestimonies(testimonies, transcript);
    
    console.log(`✅ Enhanced analysis complete: ${validatedTestimonies.length} testimonies found`);
    
    // Phase 3: Apply manual title overrides (if provided)
    console.log('\n📝 Phase 3: Checking for manual title overrides...');
    const testimoniesWithManualTitles = await applyManualTitles(videoId || extractVideoId(transcript), validatedTestimonies);
    const manualTitleCount = testimoniesWithManualTitles.filter(t => t.manualTitle).length;
    
    if (manualTitleCount > 0) {
      console.log(`✅ Applied ${manualTitleCount} manual titles`);
    } else {
      console.log('📋 No manual titles found, will use AI generation');
    }
    
    // Phase 4: Enhance remaining titles using intelligent title generation
    console.log('\n🎯 Phase 4: Enhancing remaining titles...');
    const enhancedTestimonies = [];
    
    for (let i = 0; i < testimoniesWithManualTitles.length; i++) {
      const testimony = testimoniesWithManualTitles[i];
      console.log(`\n📝 Processing title ${i + 1}/${testimoniesWithManualTitles.length}: "${testimony.title}"`);
      
      try {
        // Check if this has a manual title or is a Twi testimony
        const isManuallyProvided = testimony.manualTitle === true || testimony.language === 'Twi' || testimony.titleSource === 'manual';
        
        if (isManuallyProvided) {
          console.log('📌 Keeping manually provided title');
          enhancedTestimonies.push(testimony);
          continue;
        }
        
        // Check if title looks like it was just truncated from first line
        const needsEnhancement = isLikelyTruncatedTitle(testimony.title);
        
        if (needsEnhancement) {
          console.log('🔄 Title needs enhancement, generating intelligent title...');
          
          // Generate a better title using database learning (includes Twi examples)
          const enhancedTitle = await generateTitleWithDatabaseLearning(testimony);
          
          const enhancedTestimony = {
            ...testimony,
            title: enhancedTitle,
            originalTitle: testimony.title // Keep track of original
          };
          
          enhancedTestimonies.push(enhancedTestimony);
        } else {
          console.log('✅ Title looks good, keeping it');
          enhancedTestimonies.push(testimony);
        }
        
      } catch (titleError) {
        console.error(`❌ Error enhancing title for testimony ${i + 1}:`, titleError.message);
        // Keep original testimony if title enhancement fails
        enhancedTestimonies.push(testimony);
      }
    }
    
    console.log(`\n✨ Title enhancement complete. Enhanced ${enhancedTestimonies.length} testimonies`);
    
    return enhancedTestimonies;
    
  } catch (error) {
    console.error('❌ Enhanced single-pass analysis failed:', error);
    throw error;
  }
}

/**
 * Enhanced multi-pass analysis for large transcripts
 */
async function enhancedMultiPassAnalysis(transcript) {
  console.log('🎯 Running enhanced multi-pass analysis...');
  
  try {
    // Step 1: Split into overlapping chunks for better boundary detection
    const chunks = createOverlappingChunks(transcript, 8000, 1000);
    console.log(`📊 Split into ${chunks.length} overlapping chunks`);
    
    let allTestimonies = [];
    
    // Step 2: Analyze each chunk
    for (let i = 0; i < chunks.length; i++) {
      console.log(`🔄 Processing chunk ${i + 1}/${chunks.length}...`);
      try {
        const chunkTestimonies = await analyzeTranscriptWithEnhancedPrompt(chunks[i]);
        if (chunkTestimonies && chunkTestimonies.length > 0) {
          console.log(`✅ Found ${chunkTestimonies.length} testimonies in chunk ${i + 1}`);
          allTestimonies.push(...chunkTestimonies);
        }
      } catch (chunkError) {
        console.error(`❌ Error processing chunk ${i + 1}:`, chunkError.message);
      }
      
      // Rate limiting delay
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    console.log(`📊 Total testimonies found: ${allTestimonies.length}`);
    
    // Step 3: Advanced deduplication and validation
    const uniqueTestimonies = await advancedDeduplication(allTestimonies);
    const validatedTestimonies = await validateTestimonies(uniqueTestimonies, transcript);
    
    console.log(`📊 Final validated testimonies: ${validatedTestimonies.length}`);
    return validatedTestimonies;
    
  } catch (error) {
    console.error('❌ Enhanced multi-pass analysis failed:', error);
    throw error;
  }
}

/**
 * Create overlapping chunks for better boundary detection
 */
function createOverlappingChunks(transcript, chunkSize = 8000, overlapSize = 1000) {
  const lines = transcript.split('\n');
  const chunks = [];
  let currentChunk = '';
  let currentStartLine = 0;
  
  for (let i = 0; i < lines.length; i++) {
    currentChunk += lines[i] + '\n';
    
    // If chunk is large enough, create a chunk
    if (currentChunk.length >= chunkSize) {
      chunks.push({
        text: currentChunk.trim(),
        startLine: currentStartLine,
        endLine: i
      });
      
      // Create overlap for next chunk
      let overlapChunk = '';
      let overlapLines = 0;
      
      // Go back to create overlap
      for (let j = i; j >= 0 && overlapChunk.length < overlapSize; j--) {
        overlapChunk = lines[j] + '\n' + overlapChunk;
        overlapLines++;
      }
      
      currentChunk = overlapChunk;
      currentStartLine = Math.max(0, i - overlapLines + 1);
    }
  }
  
  // Add final chunk if it has content
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      startLine: currentStartLine,
      endLine: lines.length - 1
    });
  }
  
  console.log(`📊 Created ${chunks.length} overlapping chunks`);
  return chunks.map(chunk => chunk.text);
}

/**
 * Advanced deduplication across chunk boundaries
 */
async function advancedDeduplication(testimonies) {
  console.log('🔄 Running advanced deduplication...');
  
  if (testimonies.length === 0) return [];
  
  const uniqueTestimonies = [];
  const processedStartTimes = new Set();
  
  // Sort testimonies by start time
  const sortedTestimonies = [...testimonies].sort((a, b) => 
    (a.startTimeSeconds || 0) - (b.startTimeSeconds || 0)
  );
  
  for (const testimony of sortedTestimonies) {
    let isDuplicate = false;
    
    // Check for duplicates based on multiple criteria
    for (const existingTime of processedStartTimes) {
      // Time-based deduplication (within 45 seconds)
      const timeDiff = Math.abs((testimony.startTimeSeconds || 0) - existingTime);
      if (timeDiff < 45) {
        isDuplicate = true;
        break;
      }
    }
    
    // Content-based deduplication
    if (!isDuplicate) {
      for (const existing of uniqueTestimonies) {
        // Check for similar content (first 100 characters)
        const testimonyStart = (testimony.full_text || testimony.fullText || '').substring(0, 100).toLowerCase();
        const existingStart = (existing.full_text || existing.fullText || '').substring(0, 100).toLowerCase();
        
        if (testimonyStart && existingStart && testimonyStart === existingStart) {
          isDuplicate = true;
          break;
        }
        
        // Check for similar titles
        const testimonyTitle = (testimony.title || '').toLowerCase();
        const existingTitle = (existing.title || '').toLowerCase();
        
        if (testimonyTitle && existingTitle && testimonyTitle === existingTitle) {
          isDuplicate = true;
          break;
        }
      }
    }
    
    if (!isDuplicate) {
      uniqueTestimonies.push(testimony);
      processedStartTimes.add(testimony.startTimeSeconds || 0);
    } else {
      // If it's a duplicate, check if this version is more complete
      const existingIndex = uniqueTestimonies.findIndex(existing => {
        const timeDiff = Math.abs((existing.startTimeSeconds || 0) - (testimony.startTimeSeconds || 0));
        return timeDiff < 45;
      });
      
      if (existingIndex >= 0) {
        const existing = uniqueTestimonies[existingIndex];
        const currentLength = (testimony.full_text || testimony.fullText || '').length;
        const existingLength = (existing.full_text || existing.fullText || '').length;
        
        // Replace with longer/more complete version
        if (currentLength > existingLength) {
          console.log(`🔄 Replacing shorter testimony (${existingLength} chars) with longer version (${currentLength} chars): ${testimony.title}`);
          uniqueTestimonies[existingIndex] = testimony;
        }
      }
    }
  }
  
  console.log(`📊 Deduplication: ${testimonies.length} → ${uniqueTestimonies.length} testimonies`);
  return uniqueTestimonies;
}

/**
 * Validate testimonies for quality and completeness
 */
async function validateTestimonies(testimonies, originalTranscript) {
  console.log('✅ Running testimony validation...');
  
  if (!testimonies || testimonies.length === 0) return [];
  
  const validatedTestimonies = [];
  
  for (const testimony of testimonies) {
    // Basic structure validation
    if (!testimony.title || !testimony.category) {
      console.warn('⚠️ Skipping testimony missing title or category');
      continue;
    }
    
    // Text content validation
    const fullText = testimony.full_text || testimony.fullText || '';
    if (fullText.length < 50) {
      console.warn('⚠️ Skipping testimony with insufficient content length');
      continue;
    }
    
    // Time validation with smarter end time detection
    const startTime = testimony.startTimeSeconds || 0;
    let endTime = testimony.endTimeSeconds;
    
    // Debug specific problematic testimony
    if (testimony.category === 'Addiction and Deliverance' || testimony.title?.toLowerCase().includes('alcohol')) {
      console.log(`🔍 VALIDATION DEBUG for "${testimony.title}":`);
      console.log(`   Original startTime: ${testimony.startTimeSeconds}`);
      console.log(`   Original endTime: ${testimony.endTimeSeconds}`);
      console.log(`   Text length: ${fullText.length} chars`);
    }
    
    // Only use fallback if absolutely no end time is provided
    if (!endTime || endTime <= startTime) {
      // Try to estimate based on content length (roughly 150 words per minute)
      const wordCount = fullText.split(' ').length;
      const estimatedDuration = Math.max(60, Math.min(300, wordCount * 0.4)); // Between 1-5 minutes
      endTime = startTime + estimatedDuration;
      console.warn(`⚠️ No valid end time found for "${testimony.title}", estimating ${estimatedDuration}s based on content length (${wordCount} words)`);
    }
    
    // Ensure minimum reasonable duration (30 seconds)
    if (endTime - startTime < 30) {
      endTime = startTime + 60; // Minimum 1 minute
      console.warn('⚠️ Testimony too short, setting minimum 1-minute duration');
    }
    
    // Ensure required fields are properly named
    const validatedTestimony = {
      title: testimony.title,
      category: testimony.category,
      fullText: fullText,
      startTimeSeconds: startTime,
      endTimeSeconds: endTime,
      summary: testimony.summary || `A testimony about ${testimony.category.toLowerCase()}`
    };
    
    validatedTestimonies.push(validatedTestimony);
  }
  
  console.log(`✅ Validation complete: ${validatedTestimonies.length} valid testimonies`);
  return validatedTestimonies;
}

/**
 * Remove duplicate testimonies that might appear across chunk boundaries (legacy function)
 */
function removeDuplicateTestimonies(testimonies) {
  const uniqueTestimonies = [];
  const usedStartTimes = new Set();
  
  for (const testimony of testimonies) {
    // Consider testimonies within 30 seconds as potential duplicates
    const isDuplicate = Array.from(usedStartTimes).some(time => 
      Math.abs(time - testimony.startTimeSeconds) < 30
    );
    
    if (!isDuplicate) {
      uniqueTestimonies.push(testimony);
      usedStartTimes.add(testimony.startTimeSeconds);
    }
  }
  
  return uniqueTestimonies;
}

/**
 * Analyze transcript using enhanced prompting (your improved prompt)
 */
async function analyzeTranscriptWithEnhancedPrompt(transcript) {
  try {
    const prompt = `You are an expert AI assistant specializing in analyzing church service transcripts. Your task is to act as a highly accurate "section identifier."

Read the entire transcript provided below and identify every distinct personal testimony. A testimony is a first-person account of what God has done in an individual's life. It is not a prayer, a song, or part of the sermon.

ENHANCED DETECTION CRITERIA:
- Look for speaker changes indicated by [SPEAKER: X] tags
- Identify personal narratives with phrases like "I want to thank God...", "My name is...", "God did this for me..."
- Distinguish between the pastor/host speaking vs. congregation members sharing testimonies
- Focus on complete, standalone testimony segments

CRITICAL ANALYSIS REQUIREMENTS:
1. Read the ENTIRE transcript from start to finish
2. Identify each distinct speaker and their content
3. Determine if each speaker segment contains a personal testimony
4. Extract COMPLETE testimony boundaries (full start to natural end)
5. Ensure no testimonies are cut off or incomplete
6. VERY IMPORTANT: Find the EXACT ending timestamp where the testimony naturally concludes (when the person stops speaking or says closing phrases like "Glory to God", "Thank you Jesus", etc.)

For each distinct testimony you find, extract the following information and return it as a clean JSON array []:

- "title": Analyze the ENTIRE testimony content to create an intelligent, compelling title that captures the core miracle/breakthrough. DO NOT just use the first line. Extract key concepts and focus on the specific outcome/result (e.g., "Terminal Cancer Completely Disappeared," "From Bankruptcy to 50 Million Contract," "Marriage Restored After 15 Years"). MAX 50 characters.
- "summary": A one-sentence summary of the testimony - MAX 150 characters  
- "full_text": The complete, word-for-word text of the entire testimony, from the very first word the person speaks to their very last word. INCLUDE THE COMPLETE TESTIMONY - do not cut it short, find where it naturally ends
- "startTimeSeconds": Convert timestamp to seconds (e.g., [15:30] = 15*60 + 30 = 930)
- "endTimeSeconds": EXACT end timestamp in seconds when testimony naturally concludes (REQUIRED - do not estimate, find the actual timestamp)
- "category": Choose from: "Healing", "Financial Breakthrough", "Family and Childbirth", "Addiction and Deliverance", "Academic Breakthrough", "Career/Business", "Multiple Testimonies", "Others"

VALIDATION CHECKLIST:
✓ Is this a first-person account? ("I was...", "God helped me...")
✓ Does it describe a specific problem/challenge?
✓ Does it describe God's intervention/solution?
✓ Does it have a clear beginning and end?
✓ Is it spoken by a congregation member (not the pastor teaching)?

IMPORTANT FORMATTING:
- Your response must be ONLY valid JSON - no explanations, no extra text
- Start with [ and end with ]
- Properly escape quotes in text fields
- Ensure complete JSON structure with no truncated strings
- If no testimonies found, return []

Pay close attention to speaker changes and introductory phrases like "I want to thank God..." or "My name is...". If a section is not a personal testimony, ignore it.

CRITICAL: For endTimeSeconds, you MUST find the exact timestamp where the testimony naturally ends. Look for:
- When the person says closing phrases like "Glory to God", "Thank you Jesus", "Praise the Lord", "Every day with God is every day in victory"
- When they stop speaking and the pastor takes over
- When there's a clear speaker change back to the host
- The last timestamp in their complete testimony segment

NEVER cut off testimonies at arbitrary time intervals (like 60 seconds, 120 seconds, etc.). The testimony could be 30 seconds or 5 minutes - find the ACTUAL ending where the person concludes their story naturally.

DO NOT use arbitrary durations or estimates - find the actual ending timestamp in the transcript.

TITLE CREATION EXAMPLES - Study these patterns:
- Don't use: "I was diagnosed with cancer" (just first line)
- Instead use: "Terminal Cancer Completely Gone" (captures the outcome)
- Don't use: "I had financial problems and God helped me"  
- Instead use: "From Debt to 50M Contract" (specific transformation)
- Don't use: "My marriage was in trouble but God restored it"
- Instead use: "15-Year Marriage Rescued from Divorce" (specific details)

MULTI-CATEGORY TESTIMONIES:
If a testimony contains MULTIPLE distinct breakthroughs/miracles in different categories, use pipe separation (|):
- "Cancer Healed | University Admission | Visa Approved"
- "Job Promotion | Marriage Restored | Child Born" 
- "Debt Cleared | House Purchased | Business Success"
- "Depression Healed | Career Breakthrough"

Only use pipe separation if there are truly DISTINCT miracles in different categories. Don't use it for related events in the same category.

EXAMPLE OUTPUT:
[{"title":"Terminal Cancer Completely Gone","summary":"Woman healed from terminal cancer through prayer and faith.","full_text":"I want to thank God because I was diagnosed with cancer last year and doctors gave me 3 months to live. But through prayer and believing God, when I went for my check-up last week, the doctor said the cancer was completely gone. Glory to God!","startTimeSeconds":1830,"endTimeSeconds":1950,"category":"Healing"}]

Here is the transcript:
${transcript}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4', // Use GPT-4 for better analysis
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2, // Slightly higher temperature to avoid rigid patterns
      max_tokens: 4000,
    });

    const analysisResult = response.choices[0].message.content;
    console.log('Raw GPT response length:', analysisResult.length);
    console.log('Raw GPT response (first 500 chars):', analysisResult.substring(0, 500));
    console.log('Raw GPT response (last 200 chars):', analysisResult.substring(-200));
    
    try {
      // Try to parse the response as-is first
      const parsed = JSON.parse(analysisResult);
      console.log('✅ Successfully parsed JSON directly');
      
      // Debug specific testimonies with timing issues
      parsed.forEach((testimony, index) => {
        if (testimony.category === 'Addiction and Deliverance' || testimony.title?.toLowerCase().includes('alcohol')) {
          console.log(`🔍 DEBUG DELIVERANCE TESTIMONY ${index + 1}:`);
          console.log(`   Title: ${testimony.title}`);
          console.log(`   Start: ${testimony.startTimeSeconds}s`);
          console.log(`   End: ${testimony.endTimeSeconds}s`);
          console.log(`   Duration: ${(testimony.endTimeSeconds - testimony.startTimeSeconds)}s`);
          console.log(`   Text length: ${testimony.full_text?.length || 0} chars`);
          console.log(`   Text preview: ${testimony.full_text?.substring(0, 150)}...`);
        }
      });
      
      return parsed;
    } catch (parseError) {
      console.error('❌ Error parsing GPT response as JSON:', parseError.message);
      console.log('🔍 Attempting to extract JSON from response...');
      
      // Try to extract JSON from the response if it contains extra text
      try {
        // Look for JSON array patterns in the response (more flexible regex)
        const jsonMatch = analysisResult.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const extractedJSON = jsonMatch[0];
          console.log('🎯 Found JSON array, length:', extractedJSON.length);
          console.log('🎯 Extracted JSON (first 200 chars):', extractedJSON.substring(0, 200));
          
          const parsed = JSON.parse(extractedJSON);
          console.log('✅ Successfully parsed extracted JSON');
          
          // Debug specific testimonies with timing issues
          parsed.forEach((testimony, index) => {
            if (testimony.category === 'Addiction and Deliverance' || testimony.title?.toLowerCase().includes('alcohol')) {
              console.log(`🔍 DEBUG DELIVERANCE TESTIMONY ${index + 1} (extracted):`);
              console.log(`   Title: ${testimony.title}`);
              console.log(`   Start: ${testimony.startTimeSeconds}s`);
              console.log(`   End: ${testimony.endTimeSeconds}s`);
              console.log(`   Duration: ${(testimony.endTimeSeconds - testimony.startTimeSeconds)}s`);
              console.log(`   Text length: ${testimony.full_text?.length || 0} chars`);
            }
          });
          
          return parsed;
        }
        
        // Look for empty array specifically
        if (analysisResult.includes('[]')) {
          console.log('🎯 Found empty array in response');
          return [];
        }
        
        // Try to find JSON objects within the text
        const objectMatch = analysisResult.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          console.log('🎯 Found JSON object, trying to wrap in array...');
          const extractedObject = objectMatch[0];
          const parsed = JSON.parse(`[${extractedObject}]`);
          console.log('✅ Successfully parsed extracted object as array');
          
          // Debug specific testimonies with timing issues
          parsed.forEach((testimony, index) => {
            if (testimony.category === 'Addiction and Deliverance' || testimony.title?.toLowerCase().includes('alcohol')) {
              console.log(`🔍 DEBUG DELIVERANCE TESTIMONY ${index + 1} (object):`);
              console.log(`   Title: ${testimony.title}`);
              console.log(`   Start: ${testimony.startTimeSeconds}s`);
              console.log(`   End: ${testimony.endTimeSeconds}s`);
              console.log(`   Duration: ${(testimony.endTimeSeconds - testimony.startTimeSeconds)}s`);
              console.log(`   Text length: ${testimony.full_text?.length || 0} chars`);
            }
          });
          
          return parsed;
        }
        
        throw new Error('No valid JSON found in response');
      } catch (extractError) {
        console.error('❌ Error extracting JSON:', extractError.message);
        console.error('🚨 Full GPT response was:');
        console.error('---START RESPONSE---');
        console.error(analysisResult);
        console.error('---END RESPONSE---');
        
        // Return empty array instead of throwing error to prevent pipeline failure
        console.log('⚠️ Returning empty array to prevent pipeline failure');
        return [];
      }
    }
  } catch (error) {
    console.error('Error analyzing transcript:', error);
    
    // Check if it's a quota exceeded error
    if (error.status === 429 || error.code === 'insufficient_quota') {
      console.warn('OpenAI quota exceeded, returning mock analysis for testing');
      return [
        {
          title: "God's Healing Power",
          category: "Healing",
          fullText: "This is a mock testimony about God's healing power. The person was sick and God healed them completely.",
          startTimeSeconds: 120,
          endTimeSeconds: 300
        },
        {
          title: "Financial Breakthrough",
          category: "Financial Breakthrough", 
          fullText: "This is a mock testimony about God's financial provision. The person was in need and God provided miraculously.",
          startTimeSeconds: 400,
          endTimeSeconds: 600
        },
        {
          title: "Spiritual Growth",
          category: "Spiritual Growth",
          fullText: "This is a mock testimony about spiritual growth. The person grew closer to God through their experiences.",
          startTimeSeconds: 700,
          endTimeSeconds: 900
        }
      ];
    }
    
    throw new Error('Failed to analyze transcript');
  }
}