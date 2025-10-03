import { Timestamp } from "firebase-admin/firestore";

export type Clip = {
  id: string;
  videoId: string;
  startSec: number;
  endSec?: number;

  // existing
  categoryId?: string;
  transcript?: string;

  // NEW
  titleShort?: string;     // short, headline-style
  summaryShort?: string;   // 20–28 words, single sentence
  thumbUrl?: string;       // optional: per-clip or fallback
  serviceDate?: string;    // ISO YYYY-MM-DD
  savedCount?: number;

  // legacy/deprecated - keep for backward compatibility
  title?: string;          // will be replaced by titleShort
  
  status?: "submitted" | "processing" | "reviewing" | "live" | "hidden";
  createdAt?: Timestamp;
};

export type ClipDTO = Omit<Clip, "createdAt"> & { createdAt?: string };

// Safe defaults for Firestore operations
export const getClipWithDefaults = (rawClip: Partial<Clip> & Pick<Clip, 'id' | 'videoId' | 'startSec'>): Clip => ({
  // Required fields
  id: rawClip.id,
  videoId: rawClip.videoId,
  startSec: rawClip.startSec,
  
  // Optional fields with safe defaults
  endSec: rawClip.endSec,
  categoryId: rawClip.categoryId,
  transcript: rawClip.transcript,
  titleShort: rawClip.titleShort,
  summaryShort: rawClip.summaryShort,
  thumbUrl: rawClip.thumbUrl,
  serviceDate: rawClip.serviceDate,
  savedCount: rawClip.savedCount ?? 0,
  
  // Legacy support
  title: rawClip.title,
  
  // System fields
  status: rawClip.status ?? 'submitted',
  createdAt: rawClip.createdAt,
});

// Helper to get display title (prefer titleShort, fallback to title)
export const getClipDisplayTitle = (clip: Clip): string => {
  return clip.titleShort || clip.title || `Clip ${clip.id.slice(0, 8)}`;
};

// Helper to get display summary
export const getClipDisplaySummary = (clip: Clip): string => {
  return clip.summaryShort || clip.transcript?.slice(0, 100) + '...' || 'No summary available';
};

export type Video = {
  id: string;
  title: string;
  source: "youtube" | "hls" | "s3" | "gcs";
  sourceId: string;      // youtube id or storage path
  durationSec?: number;
  status: "submitted" | "processing" | "reviewing" | "live" | "hidden";
  createdAt?: Timestamp;
  processedAt?: Timestamp;
};