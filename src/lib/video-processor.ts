const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
import { getStorage } from 'firebase-admin/storage';
import { adminDb } from './firebase-admin';
import { extractVideoId } from './youtube-processor';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Set FFmpeg path
if (ffmpeg && ffmpegStatic) {
  console.log('Raw ffmpegStatic path:', ffmpegStatic);

  // Resolve the absolute path
  const absolutePath = path.resolve(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
  console.log('Resolved absolute path:', absolutePath);

  // Check if file exists and use appropriate path
  let ffmpegPath = ffmpegStatic;
  if (fs.existsSync(absolutePath)) {
    ffmpegPath = absolutePath;
  } else if (fs.existsSync(ffmpegStatic)) {
    ffmpegPath = ffmpegStatic;
  } else {
    console.warn('FFmpeg binary not found at expected locations, using default:', ffmpegStatic);
    ffmpegPath = ffmpegStatic;
  }

  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('FFmpeg path set to:', ffmpegPath);
}

/**
 * Download and clip video from YouTube, then upload to Firebase Storage
 */
export async function processVideoAndUpload(
  youtubeUrl: string,
  startTime: number,
  endTime: number
): Promise<string> {
  console.log(`🎬 Starting video processing for ${youtubeUrl} from ${startTime}s to ${endTime}s`);
  console.log('📊 Debug: Function called with times:', { startTime, endTime, duration: endTime - startTime });

  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube URL format');
  }

  // Create temporary directories
  const tempDir = os.tmpdir();
  const workingDir = path.join(tempDir, `video_${videoId}_${Date.now()}`);
  await fs.promises.mkdir(workingDir, { recursive: true });

  const originalVideoPath = path.join(workingDir, 'original.mp4');
  const clippedVideoPath = path.join(workingDir, 'clipped.mp4');

  try {
    // Step A: Get Video Stream and Download
    console.log('📥 Downloading video from YouTube...');
    console.log('📊 Debug: Temp paths:', { originalVideoPath, clippedVideoPath });
    await downloadVideoFile(youtubeUrl, originalVideoPath);

    // Step B: Trim the Video using FFmpeg
    console.log(`✂️ Trimming video from ${startTime}s to ${endTime}s...`);
    await trimVideo(originalVideoPath, clippedVideoPath, startTime, endTime);

    // Step C & D: Upload to Firebase Storage and get public URL
    console.log('☁️ Uploading clip to Firebase Storage...');
    const publicUrl = await uploadToFirebaseStorage(clippedVideoPath, videoId, startTime, endTime);

    console.log(`✅ Video processing complete. Public URL: ${publicUrl}`);
    return publicUrl;

  } catch (error) {
    console.error('❌ Video processing error:', error);
    throw error;
  } finally {
    // Step E: Cleanup temporary files
    console.log('🧹 Cleaning up temporary files...');
    try {
      await cleanupTempFiles(workingDir);
    } catch (cleanupError) {
      console.warn('Warning: Failed to cleanup temp files:', cleanupError);
    }
  }
}

/**
 * Download video file from YouTube URL
 */
async function downloadVideoFile(youtubeUrl: string, outputPath: string): Promise<void> {
  // Try ytdl-core first, fallback to yt-dlp if it fails
  try {
    await downloadWithYtdlCore(youtubeUrl, outputPath);
  } catch (error) {
    console.log('📉 ytdl-core failed, trying yt-dlp fallback...');
    await downloadWithYtDlp(youtubeUrl, outputPath);
  }
}

/**
 * Download using ytdl-core
 */
async function downloadWithYtdlCore(youtubeUrl: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const videoId = extractVideoId(youtubeUrl);
      if (!videoId) {
        reject(new Error('Invalid YouTube URL'));
        return;
      }

      console.log('🎯 Getting video info...');

      // Get video stream with both video and audio
      const stream = ytdl(videoId, {
        quality: 'highest',
        filter: (format: any) => {
          // Prefer formats with both video and audio
          if (format.hasVideo && format.hasAudio) {
            return true;
          }
          return false;
        }
      });

      const writeStream = fs.createWriteStream(outputPath);

      let downloadedBytes = 0;
      let totalBytes = 0;

      stream.on('info', (info: any, format: any) => {
        totalBytes = format.contentLength;
        console.log(`📊 Video quality: ${format.quality}, Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
      });

      stream.on('progress', (chunkLength: number, downloaded: number, total: number) => {
        downloadedBytes = downloaded;
        const percent = ((downloaded / total) * 100).toFixed(2);
        if (parseInt(percent) % 10 === 0) {
          console.log(`📥 Download progress: ${percent}%`);
        }
      });

      stream.on('error', (error: any) => {
        console.error('Stream error:', error);
        reject(new Error(`Failed to download video: ${error.message}`));
      });

      writeStream.on('error', (error: any) => {
        console.error('Write stream error:', error);
        reject(new Error(`Failed to write video file: ${error.message}`));
      });

      writeStream.on('finish', () => {
        const fileSizeMB = (downloadedBytes / 1024 / 1024).toFixed(2);
        console.log(`✅ Video download completed: ${fileSizeMB} MB`);
        resolve();
      });

      stream.pipe(writeStream);

    } catch (error) {
      reject(new Error(`Failed to start video download: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });
}

/**
 * Download using yt-dlp as fallback
 */
async function downloadWithYtDlp(youtubeUrl: string, outputPath: string): Promise<void> {
  // Try with cookies first, then fallback without cookies
  try {
    await downloadWithYtDlpCookies(youtubeUrl, outputPath);
  } catch (error) {
    console.log('🍪 Cookie-based download failed, trying without cookies...');
    await downloadWithYtDlpNoCookies(youtubeUrl, outputPath);
  }
}

/**
 * Download using yt-dlp with cookie support for age-restricted videos
 */
async function downloadWithYtDlpCookies(youtubeUrl: string, outputPath: string): Promise<void> {
  const { spawn } = require('child_process');

  return new Promise((resolve, reject) => {
    console.log('🎯 Using yt-dlp with cookies for age-restricted content...');

    // Remove any existing empty file from failed ytdl-core attempt
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
      console.log('🗑️ Removed empty file from failed ytdl-core attempt');
    }

    const ytDlp = spawn('python3', [
      '-m', 'yt_dlp',
      youtubeUrl,
      '--format', 'worst[height>=360]/worst',
      '--output', outputPath,
      '--extractor-args', 'youtube:player_client=android',
      '--user-agent', 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
      '--add-header', 'X-YouTube-Client-Name:3',
      '--add-header', 'X-YouTube-Client-Version:19.09.37',
      '--no-check-certificate',
      '--geo-bypass',
      '--cookies-from-browser', 'chrome',  // Extract cookies from Chrome for age-restricted videos
      '--age-limit', '0'  // Bypass age restrictions
    ]);

    let stderr = '';

    ytDlp.stdout.on('data', (data) => {
      console.log(`yt-dlp: ${data.toString().trim()}`);
    });

    ytDlp.stderr.on('data', (data) => {
      const output = data.toString().trim();
      stderr += output;
      console.log(`yt-dlp stderr: ${output}`);
    });

    ytDlp.on('close', (code) => {
      console.log(`yt-dlp (with cookies) exited with code: ${code}`);
      if (code === 0) {
        // Check if file was created
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          const fileSizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
          console.log(`✅ yt-dlp cookie download completed: ${fileSizeMB} MB`);
          resolve();
        } else {
          console.log(`❌ yt-dlp (cookies) created empty or missing file. Path: ${outputPath}, Exists: ${fs.existsSync(outputPath)}`);
          reject(new Error(`yt-dlp with cookies created empty file. stderr: ${stderr}`));
        }
      } else {
        reject(new Error(`yt-dlp with cookies failed with code ${code}: ${stderr}`));
      }
    });

    ytDlp.on('error', (error) => {
      reject(new Error(`yt-dlp with cookies process failed: ${error.message}`));
    });
  });
}

/**
 * Download using yt-dlp without cookies as fallback
 */
async function downloadWithYtDlpNoCookies(youtubeUrl: string, outputPath: string): Promise<void> {
  const { spawn } = require('child_process');

  return new Promise((resolve, reject) => {
    console.log('🎯 Using yt-dlp fallback without cookies...');

    // Remove any existing file from failed attempts
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
      console.log('🗑️ Removed existing file from failed attempt');
    }

    const ytDlp = spawn('python3', [
      '-m', 'yt_dlp',
      youtubeUrl,
      '--format', 'worst[height>=360]/worst',
      '--output', outputPath,
      '--extractor-args', 'youtube:player_client=android',
      '--user-agent', 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
      '--add-header', 'X-YouTube-Client-Name:3',
      '--add-header', 'X-YouTube-Client-Version:19.09.37',
      '--no-check-certificate',
      '--geo-bypass'
    ]);

    let stderr = '';

    ytDlp.stdout.on('data', (data) => {
      console.log(`yt-dlp: ${data.toString().trim()}`);
    });

    ytDlp.stderr.on('data', (data) => {
      const output = data.toString().trim();
      stderr += output;
      console.log(`yt-dlp stderr: ${output}`);
    });

    ytDlp.on('close', (code) => {
      console.log(`yt-dlp (no cookies) exited with code: ${code}`);
      if (code === 0) {
        // Check if file was created
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          const fileSizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
          console.log(`✅ yt-dlp fallback download completed: ${fileSizeMB} MB`);
          resolve();
        } else {
          console.log(`❌ yt-dlp (no cookies) created empty or missing file. Path: ${outputPath}, Exists: ${fs.existsSync(outputPath)}`);
          reject(new Error(`yt-dlp without cookies created empty file. stderr: ${stderr}`));
        }
      } else {
        reject(new Error(`yt-dlp without cookies failed with code ${code}: ${stderr}`));
      }
    });

    ytDlp.on('error', (error) => {
      reject(new Error(`yt-dlp without cookies process failed: ${error.message}`));
    });
  });
}

/**
 * Trim video using FFmpeg
 */
async function trimVideo(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = endTime - startTime;

    console.log(`⏱️ Trimming ${duration} seconds of video...`);

    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .output(outputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset', 'fast',
        '-crf', '22',
        '-movflags', '+faststart'
      ])
      .on('start', (commandLine: string) => {
        console.log('🎬 FFmpeg command started');
        console.log('Command:', commandLine);
      })
      .on('progress', (progress: any) => {
        if (progress.percent) {
          console.log(`✂️ Processing: ${Math.round(progress.percent)}% done`);
        }
      })
      .on('end', () => {
        // Check if output file exists and has size
        const stats = fs.statSync(outputPath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`✅ Video trimming completed: ${fileSizeMB} MB`);
        resolve();
      })
      .on('error', (error: any, stdout: any, stderr: any) => {
        console.error('FFmpeg error:', error.message);
        console.error('FFmpeg stderr:', stderr);
        reject(new Error(`Video trimming failed: ${error.message}`));
      })
      .run();
  });
}

/**
 * Upload video file to Firebase Storage and return public URL
 */
async function uploadToFirebaseStorage(
  filePath: string,
  videoId: string,
  startTime: number,
  endTime: number
): Promise<string> {
  try {
    if (!adminDb) {
      throw new Error('Firebase Admin not initialized');
    }

    const storage = getStorage();
    const bucket = storage.bucket('ah-testimony-library.firebasestorage.app');

    // Check file size
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / 1024 / 1024;
    console.log(`📊 Uploading file size: ${fileSizeMB.toFixed(2)} MB`);

    // Create a unique filename
    const timestamp = Math.floor(Date.now() / 1000);
    const fileName = `clips/${videoId}/${timestamp}_${startTime}-${endTime}.mp4`;

    console.log(`☁️ Uploading to: ${fileName}`);

    // Upload file with progress tracking
    const [file] = await bucket.upload(filePath, {
      destination: fileName,
      metadata: {
        contentType: 'video/mp4',
        metadata: {
          videoId: videoId,
          startTime: startTime.toString(),
          endTime: endTime.toString(),
          processedAt: new Date().toISOString(),
        }
      },
      public: true, // Make the file publicly accessible
      validation: 'crc32c',
    });

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    console.log(`✅ File uploaded successfully: ${publicUrl}`);
    return publicUrl;

  } catch (error) {
    console.error('Firebase Storage upload error:', error);
    throw new Error(`Failed to upload to Firebase Storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Clean up temporary files and directories
 */
async function cleanupTempFiles(workingDir: string): Promise<void> {
  try {
    if (fs.existsSync(workingDir)) {
      const files = await fs.promises.readdir(workingDir);

      // Delete all files in the directory
      for (const file of files) {
        const filePath = path.join(workingDir, file);
        await fs.promises.unlink(filePath);
        console.log(`🗑️ Deleted temp file: ${file}`);
      }

      // Remove the directory
      await fs.promises.rmdir(workingDir);
      console.log(`🗑️ Deleted temp directory: ${workingDir}`);
    }
  } catch (error) {
    console.warn('Cleanup warning:', error);
    // Don't throw here - cleanup failures shouldn't break the main process
  }
}

/**
 * Helper function to format time for logging
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}