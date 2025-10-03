import { transcribeAudio, analyzeTranscript } from './openai-processor';
import { downloadAudio, getRealTranscript } from './youtube-processor';
import { processVideoAndUpload } from './video-processor';

/**
 * Process audio and analyze transcript (existing logic)
 */
export async function processAudioAndAnalyze(youtubeUrl: string, videoId?: string): Promise<any[]> {
  console.log('🎵 Starting audio processing and transcript analysis...');
  
  // Try to get real transcript first (from captions)
  let transcript: string;
  
  try {
    console.log('📝 Attempting to get real transcript from YouTube captions...');
    transcript = await getRealTranscript(youtubeUrl);
    console.log('✅ Successfully got real transcript from captions');
  } catch (transcriptError) {
    console.warn('⚠️ Failed to get real transcript, falling back to audio processing:', transcriptError);
    
    // Fallback to audio processing
    console.log('🎵 Downloading audio for transcription...');
    const audioBuffer = await downloadAudio(youtubeUrl);
    console.log(`📝 Transcribing audio buffer (${audioBuffer.length} bytes)...`);
    transcript = await transcribeAudio(audioBuffer, youtubeUrl || '');
  }

  if (!transcript || transcript.trim() === '') {
    throw new Error('Transcription failed or produced empty text');
  }

  // Validate transcript type (existing validation logic)
  if (transcript.includes('Welcome to Alpha Hour! Pastor here, and today we have amazing testimonies')) {
    throw new Error('Old mock transcript detected - audio processing failed');
  }

  // Analyze transcript for testimonies
  console.log('🤖 Analyzing transcript with AI...');
  const testimonies = await analyzeTranscript(transcript, videoId);
  console.log(`✅ Found ${testimonies.length} testimonies`);

  return testimonies;
}

/**
 * Process testimonies and create video clips for each
 */
export async function processTestimoniesWithVideos(
  youtubeUrl: string, 
  testimonies: any[]
): Promise<any[]> {
  console.log(`🎬 Creating video clips for ${testimonies.length} testimonies...`);
  
  const processedClips = [];
  
  for (let i = 0; i < testimonies.length; i++) {
    const testimony = testimonies[i];
    console.log(`Processing clip ${i + 1}/${testimonies.length}: "${testimony.title}"`);
    
    try {
      // Create video clip for this testimony
      const processedClipUrl = await processVideoAndUpload(
        youtubeUrl,
        testimony.startTimeSeconds,
        testimony.endTimeSeconds
      );
      
      processedClips.push({
        ...testimony,
        processedClipUrl // Add the video URL to the testimony data
      });
      
      console.log(`✅ Clip ${i + 1} processed successfully`);
      
    } catch (clipError) {
      console.error(`❌ Failed to process clip ${i + 1}:`, clipError);
      
      // Add without video URL - the testimony data is still valuable
      processedClips.push({
        ...testimony,
        processedClipUrl: null,
        videoProcessingError: clipError instanceof Error ? clipError.message : 'Unknown error'
      });
    }
  }
  
  console.log(`✅ Finished processing ${processedClips.length} clips`);
  return processedClips;
}