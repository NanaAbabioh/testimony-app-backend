import ytdl from '@distube/ytdl-core';
import { YoutubeTranscript } from 'youtube-transcript';
import { Innertube } from 'youtubei.js';

/**
 * Extract YouTube video ID from URL
 */
export function extractVideoId(url) {
  const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

/**
 * Get video info from YouTube URL
 */
export async function getVideoInfo(videoUrl) {
  console.log('getVideoInfo called with videoUrl:', videoUrl);

  if (!videoUrl) {
    throw new Error('Video URL is required');
  }

  try {
    // Extract video ID from URL
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL format');
    }

    const info = await ytdl.getInfo(videoId);
    return {
      title: info.videoDetails.title,
      thumbnailUrl: info.videoDetails.thumbnails[0]?.url || '',
      uploadDate: info.videoDetails.uploadDate || new Date().toISOString(),
      videoId: info.videoDetails.videoId,
    };
  } catch (error) {
    console.error('Error getting video info:', error);
    throw new Error('Failed to get video information. The URL might be invalid or private.');
  }
}

/**
 * Download audio from YouTube URL
 */
/**
 * Get real transcript from YouTube captions/subtitles
 */
export async function getRealTranscript(videoUrl) {
  console.log('📝 Attempting to get real transcript from YouTube...');
  
  try {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL format');
    }
    
    console.log(`🎯 Getting transcript for video ID: ${videoId}`);
    
    // Try multiple transcript extraction methods
    const methods = [
      // Method 1: YouTube Internal API (most reliable)
      async () => {
        console.log('🔄 Method 1: Trying YouTube Internal API...');
        try {
          const youtube = await Innertube.create();
          const info = await youtube.getInfo(videoId);
          
          if (info.captions && info.captions.caption_tracks.length > 0) {
            console.log(`Found ${info.captions.caption_tracks.length} caption tracks`);
            
            // Try to find English captions
            let captionTrack = info.captions.caption_tracks.find(track => 
              track.language_code === 'en' || track.language_code === 'en-US'
            );
            
            // If no English, use the first available
            if (!captionTrack && info.captions.caption_tracks.length > 0) {
              captionTrack = info.captions.caption_tracks[0];
              console.log(`Using ${captionTrack.language_code} captions as fallback`);
            }
            
            if (captionTrack) {
              const transcriptData = await captionTrack.fetch();
              console.log(`✅ Got ${transcriptData.length} caption segments`);
              
              // Convert to our format
              return transcriptData.map(segment => ({
                offset: segment.start_time * 1000, // Convert to milliseconds
                text: segment.text
              }));
            }
          }
          return null;
        } catch (apiError) {
          console.warn('YouTube API method failed:', apiError.message);
          return null;
        }
      },
      
      // Method 2: English with country
      async () => {
        console.log('🔄 Method 2: Trying English with US country...');
        return await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en', country: 'US' });
      },
      // Method 3: Just English
      async () => {
        console.log('🔄 Method 3: Trying English language...');
        return await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
      },
      // Method 4: Auto-generated
      async () => {
        console.log('🔄 Method 4: Trying auto-generated...');
        return await YoutubeTranscript.fetchTranscript(videoId, { lang: 'auto' });
      },
      // Method 5: No specification
      async () => {
        console.log('🔄 Method 5: Trying without language specification...');
        return await YoutubeTranscript.fetchTranscript(videoId);
      },
      // Method 6: Direct video URL approach
      async () => {
        console.log('🔄 Method 6: Trying with video URL...');
        return await YoutubeTranscript.fetchTranscript(videoUrl);
      }
    ];

    for (let i = 0; i < methods.length; i++) {
      try {
        const transcriptData = await methods[i]();
        
        if (transcriptData && transcriptData.length > 0) {
          console.log(`✅ Method ${i + 1} succeeded! Found ${transcriptData.length} transcript segments`);
          
          // Convert transcript to our format with timestamps
          let transcript = '';
          for (const segment of transcriptData) {
            const startTime = formatTimestampFromMs(segment.offset);
            // Clean up the text - remove extra spaces and normalize
            const cleanText = segment.text.replace(/\s+/g, ' ').trim();
            transcript += `[${startTime}] ${cleanText}\n\n`;
          }
          
          console.log(`📋 Generated transcript length: ${transcript.length} characters`);
          console.log('📝 First 200 characters:', transcript.substring(0, 200));
          return transcript;
        }
        
      } catch (methodError) {
        console.warn(`❌ Method ${i + 1} failed: ${methodError.message}`);
        
        // Check if the error message contains available languages
        if (methodError.message.includes('Available languages:')) {
          console.log('🔍 Found available languages in error message:', methodError.message);
          
          // Extract available languages from error message
          const languageMatch = methodError.message.match(/Available languages: (.+)/);
          if (languageMatch) {
            const availableLanguages = languageMatch[1].split(', ');
            console.log('📋 Available languages:', availableLanguages);
            
            // Try each available language
            for (const lang of availableLanguages) {
              try {
                console.log(`🔄 Trying specific language: ${lang}`);
                const langTranscriptData = await YoutubeTranscript.fetchTranscript(videoId, { lang: lang.trim() });
                
                if (langTranscriptData && langTranscriptData.length > 0) {
                  console.log(`✅ Success with language ${lang}! Found ${langTranscriptData.length} transcript segments`);
                  
                  // Convert transcript to our format with timestamps
                  let transcript = '';
                  for (const segment of langTranscriptData) {
                    const startTime = formatTimestampFromMs(segment.offset);
                    const cleanText = segment.text.replace(/\s+/g, ' ').trim();
                    transcript += `[${startTime}] ${cleanText}\n\n`;
                  }
                  
                  console.log(`📋 Generated transcript length: ${transcript.length} characters`);
                  console.log('📝 First 200 characters:', transcript.substring(0, 200));
                  return transcript;
                }
              } catch (langError) {
                console.warn(`❌ Language ${lang} failed: ${langError.message}`);
                continue;
              }
            }
          }
        }
        
        continue;
      }
    }
    
    throw new Error('No transcript available for this video');
    
  } catch (error) {
    console.error('🚨 Failed to get real transcript:', error);
    throw new Error(`Cannot get real transcript: ${error.message}. This video may not have any captions or transcripts available.`);
  }
}

/**
 * Format milliseconds to [MM:SS] or [HH:MM:SS] format
 */
function formatTimestampFromMs(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Format seconds to [MM:SS] or [HH:MM:SS] format
 */
function formatTimestamp(seconds) {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

export async function downloadAudio(videoUrl) {
  console.log('🎵 Audio download is currently disabled due to YouTube API changes');
  console.log('📝 Using caption-based transcript extraction instead');
  
  // Since we're now using captions for transcript, we don't need audio
  // Return a small buffer to indicate we're using caption-based approach
  const captionBasedBuffer = Buffer.alloc(100, 2); // Small buffer with different pattern
  return captionBasedBuffer;
}