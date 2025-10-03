// Media source builder for optimizing video delivery based on data saver preferences
// Provides different quality variants and audio-only options

export interface MediaSources {
  videoHlsAuto: string;   // Full adaptive bitrate ladder
  videoHlsLow: string;    // Low-bitrate variant for data saving
  audioOnly: string;      // Audio-only track
  thumbnail: string;      // Video thumbnail/poster
  thumbnailLow: string;   // Lower quality thumbnail for data saving
}

export interface MediaOptions {
  startTime?: number;     // Start time in seconds
  endTime?: number;       // End time in seconds  
  quality?: 'auto' | 'low' | 'audio';
  format?: 'hls' | 'mp4'; // Format preference
}

/**
 * Gets media source URLs for a video with different quality options
 * These are stub endpoints that should be wired to your real HLS/audio infrastructure
 */
export function getMediaSources(videoId: string, options: MediaOptions = {}): MediaSources {
  const { startTime, endTime, quality = 'auto', format = 'hls' } = options;
  
  // Build query parameters for time-based clipping
  const timeParams = new URLSearchParams();
  if (startTime !== undefined) timeParams.set('start', startTime.toString());
  if (endTime !== undefined) timeParams.set('end', endTime.toString());
  const timeQuery = timeParams.toString() ? `?${timeParams.toString()}` : '';
  const timeQueryWithAmp = timeParams.toString() ? `&${timeParams.toString()}` : '';

  return {
    // HLS streams with adaptive bitrate
    videoHlsAuto: `/api/video-hls/${videoId}${timeQuery}`,
    videoHlsLow: `/api/video-hls/${videoId}?q=low${timeQueryWithAmp}`,
    
    // Audio-only option for maximum data saving
    audioOnly: `/api/audio/${videoId}.mp3${timeQuery}`,
    
    // Thumbnail/poster images
    thumbnail: `/api/thumbnail/${videoId}.jpg`,
    thumbnailLow: `/api/thumbnail/${videoId}.jpg?q=low`,
  };
}

/**
 * Gets the optimal media source based on data saver preferences
 * Integrates with the dataSaver utility to automatically select appropriate quality
 */
export function getOptimalMediaSource(videoId: string, options: MediaOptions = {}): {
  primary: string;
  fallback?: string;
  type: 'video' | 'audio';
  quality: 'auto' | 'low' | 'audio';
} {
  // Dynamic import to avoid server-side issues
  let isDataSaverActive = false;
  
  if (typeof window !== 'undefined') {
    try {
      // Import dataSaver utility dynamically
      const dataSaver = require('./dataSaver');
      isDataSaverActive = dataSaver.isDataSaverEffective();
    } catch (error) {
      console.warn('Could not load dataSaver utility:', error);
    }
  }

  const sources = getMediaSources(videoId, options);
  
  // Force audio-only mode
  if (options.quality === 'audio') {
    return {
      primary: sources.audioOnly,
      type: 'audio',
      quality: 'audio'
    };
  }
  
  // Force low quality
  if (options.quality === 'low') {
    return {
      primary: sources.videoHlsLow,
      fallback: sources.audioOnly,
      type: 'video',
      quality: 'low'
    };
  }
  
  // Auto mode - choose based on data saver
  if (isDataSaverActive) {
    return {
      primary: sources.videoHlsLow,
      fallback: sources.audioOnly,
      type: 'video',
      quality: 'low'
    };
  }
  
  // Default to full quality
  return {
    primary: sources.videoHlsAuto,
    fallback: sources.videoHlsLow,
    type: 'video',
    quality: 'auto'
  };
}

/**
 * Gets YouTube video URLs with time parameters for embedding or direct linking
 * Useful for fallback when custom video processing isn't available
 */
export function getYouTubeMediaSources(videoId: string, options: MediaOptions = {}): {
  embed: string;
  watch: string;
  thumbnail: string;
} {
  const { startTime } = options;
  
  const startParam = startTime ? `&start=${Math.floor(startTime)}` : '';
  
  return {
    embed: `https://www.youtube.com/embed/${videoId}?autoplay=0${startParam}`,
    watch: `https://www.youtube.com/watch?v=${videoId}${startTime ? `&t=${Math.floor(startTime)}s` : ''}`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  };
}

/**
 * Builds media source URLs for clip segments with start/end times
 * Optimized for testimony clips with specific time ranges
 */
export function getClipMediaSources(videoId: string, startSec: number, endSec: number): MediaSources {
  return getMediaSources(videoId, {
    startTime: startSec,
    endTime: endSec
  });
}

/**
 * Gets the appropriate thumbnail based on data saver preferences
 */
export function getOptimalThumbnail(videoId: string): string {
  let useDataSaver = false;
  
  if (typeof window !== 'undefined') {
    try {
      const dataSaver = require('./dataSaver');
      useDataSaver = dataSaver.isDataSaverEffective();
    } catch (error) {
      // Fallback gracefully
    }
  }
  
  const sources = getMediaSources(videoId);
  return useDataSaver ? sources.thumbnailLow : sources.thumbnail;
}

/**
 * Utility to format time for media URLs
 */
export function formatTimeForUrl(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Estimates data usage for different quality options
 * Useful for showing users the data cost of their choice
 */
export function estimateDataUsage(durationSeconds: number, quality: 'auto' | 'low' | 'audio'): {
  mbPerMinute: number;
  totalMB: number;
  description: string;
} {
  const durationMinutes = durationSeconds / 60;
  
  const rates = {
    auto: { mbPerMinute: 15, description: 'High quality video' },
    low: { mbPerMinute: 3, description: 'Low quality video' },
    audio: { mbPerMinute: 0.5, description: 'Audio only' }
  };
  
  const rate = rates[quality];
  const totalMB = rate.mbPerMinute * durationMinutes;
  
  return {
    mbPerMinute: rate.mbPerMinute,
    totalMB: Math.round(totalMB * 10) / 10, // Round to 1 decimal
    description: rate.description
  };
}