// Manual transcripts for videos that don't have auto-captions
// These should be created by watching the actual video and noting exact timing

export const manualTranscripts = {
  // YouTube Video ID: ppHLJ9HloPs
  // "ALPHA HOUR EPISODE 1034 || THE GOD OF MIRACLES || 26th JUNE,2025"
  'ppHLJ9HloPs': `PLACEHOLDER - REQUIRES MANUAL TIMING

To create an accurate transcript for this video, please:

1. Watch the YouTube video: https://www.youtube.com/watch?v=ppHLJ9HloPs
2. Find where Pastor Jerry says "Everyday with God is everyday in victory!"  
3. Note the exact timestamps (minutes:seconds)
4. Write down the testimony content between each catch phrase
5. Update this file with the real timing and content

Example format:
[MM:SS] Regular content before testimonies...
[MM:SS] Everyday with God is everyday in victory! [First testimony content here]
[MM:SS] Everyday with God is everyday in victory! [Second testimony content here]
[MM:SS] Everyday with God is everyday in victory! [Third testimony content here]
[MM:SS] End of testimonies section...

CRITICAL: The timestamps must be exact to ensure video clips match the content.
`
};

export function getManualTranscript(videoId) {
  return manualTranscripts[videoId] || null;
}