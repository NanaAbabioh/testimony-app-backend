const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { getStorage } = require('firebase-admin/storage');
const { adminDb } = require('./firebase-admin');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

// Extract video ID from YouTube URL
function extractVideoId(url) {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

/**
 * Download and clip video from YouTube, then upload to Firebase Storage
 */
async function processVideoAndUpload(youtubeUrl, startTime, endTime) {
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
async function downloadVideoFile(youtubeUrl, outputPath) {
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
async function downloadWithYtdlCore(youtubeUrl, outputPath) {
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
        filter: (format) => {
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

      stream.on('info', (info, format) => {
        totalBytes = format.contentLength;
        console.log(`📊 Video quality: ${format.quality}, Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
      });

      stream.on('progress', (chunkLength, downloaded, total) => {
        downloadedBytes = downloaded;
        const percent = ((downloaded / total) * 100).toFixed(2);
        if (parseInt(percent) % 10 === 0) {
          console.log(`📥 Download progress: ${percent}%`);
        }
      });

      stream.on('error', (error) => {
        console.error('Stream error:', error);
        reject(new Error(`Failed to download video: ${error.message}`));
      });

      writeStream.on('error', (error) => {
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
async function downloadWithYtDlp(youtubeUrl, outputPath) {
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
async function downloadWithYtDlpCookies(youtubeUrl, outputPath) {
  const { spawn } = require('child_process');

  return new Promise((resolve, reject) => {
    console.log('🎯 Using yt-dlp with cookies for age-restricted content...');

    // Remove any existing empty file from failed ytdl-core attempt
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
      console.log('🗑️ Removed empty file from failed ytdl-core attempt');
    }

    // Try to find yt-dlp command - try direct command first, then python3 -m yt_dlp
    const ytDlpCommands = [
      { cmd: 'yt-dlp', args: [] },
      { cmd: 'python3', args: ['-m', 'yt_dlp'] },
      { cmd: '/usr/bin/python3', args: ['-m', 'yt_dlp'] }
    ];

    let currentCommandIndex = 0;

    const tryNextCommand = () => {
      if (currentCommandIndex >= ytDlpCommands.length) {
        reject(new Error('Could not find yt-dlp command'));
        return;
      }

      const { cmd, args } = ytDlpCommands[currentCommandIndex];
      const fullArgs = [
        ...args,
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
      ];

      console.log(`Trying command: ${cmd} ${fullArgs.join(' ')}`);
      const ytDlp = spawn(cmd, fullArgs);

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
        console.log(`Command failed: ${cmd}, trying next... Error: ${error.message}`);
        currentCommandIndex++;
        tryNextCommand();
      });
    };

    tryNextCommand();
  });
}

/**
 * Download using yt-dlp without cookies as fallback
 */
async function downloadWithYtDlpNoCookies(youtubeUrl, outputPath) {
  const { spawn } = require('child_process');

  return new Promise((resolve, reject) => {
    console.log('🎯 Using yt-dlp fallback without cookies...');

    // Remove any existing file from failed attempts
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
      console.log('🗑️ Removed existing file from failed attempt');
    }

    // Try to find yt-dlp command - try direct command first, then python3 -m yt_dlp
    const ytDlpCommands = [
      { cmd: 'yt-dlp', args: [] },
      { cmd: 'python3', args: ['-m', 'yt_dlp'] },
      { cmd: '/usr/bin/python3', args: ['-m', 'yt_dlp'] }
    ];

    let currentCommandIndex = 0;

    const tryNextCommand = () => {
      if (currentCommandIndex >= ytDlpCommands.length) {
        reject(new Error('Could not find yt-dlp command'));
        return;
      }

      const { cmd, args } = ytDlpCommands[currentCommandIndex];
      const fullArgs = [
        ...args,
        youtubeUrl,
        '--format', 'worst[height>=360]/worst',
        '--output', outputPath,
        '--extractor-args', 'youtube:player_client=android',
        '--user-agent', 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
        '--add-header', 'X-YouTube-Client-Name:3',
        '--add-header', 'X-YouTube-Client-Version:19.09.37',
        '--no-check-certificate',
        '--geo-bypass'
      ];

      console.log(`Trying command (no cookies): ${cmd} ${fullArgs.join(' ')}`);
      const ytDlp = spawn(cmd, fullArgs);

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
        console.log(`Command failed (no cookies): ${cmd}, trying next... Error: ${error.message}`);
        currentCommandIndex++;
        tryNextCommand();
      });
    };

    tryNextCommand();
  });
}

/**
 * Trim video using FFmpeg
 */
async function trimVideo(inputPath, outputPath, startTime, endTime) {
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
      .on('start', (commandLine) => {
        console.log('🎬 FFmpeg command started');
        console.log('Command:', commandLine);
      })
      .on('progress', (progress) => {
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
      .on('error', (error, stdout, stderr) => {
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
async function uploadToFirebaseStorage(filePath, videoId, startTime, endTime) {
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
async function cleanupTempFiles(workingDir) {
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

module.exports = {
  processVideoAndUpload,
  extractVideoId
};