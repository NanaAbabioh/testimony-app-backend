/**
 * Title Override System - Allows manual provision of clip titles
 * This system prioritizes manually provided titles over AI-generated ones
 */

import { adminDb } from './firebase-admin';

interface TitleMap {
  [clipIndex: number]: string;
}

interface Testimony {
  title: string;
  category?: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  fullText: string;
  originalAiTitle?: string;
  manualTitle?: boolean;
  titleSource?: 'manual' | 'ai';
}

/**
 * Structure for manually provided titles
 * Can be stored in database or provided via API
 */
export class TitleOverrideManager {
  public overrides: Map<string, TitleMap>;
  public loaded: boolean;

  constructor() {
    this.overrides = new Map(); // videoId -> { clipIndex: title }
    this.loaded = false;
  }

  /**
   * Add manual title for a specific clip
   */
  addTitleOverride(videoId: string, clipIndex: number, title: string): void {
    if (!this.overrides.has(videoId)) {
      this.overrides.set(videoId, {});
    }
    
    this.overrides.get(videoId)[clipIndex] = title;
    console.log(`📝 Added title override for ${videoId}[${clipIndex}]: "${title}"`);
  }

  /**
   * Add multiple title overrides for a video
   */
  addVideoTitles(videoId: string, titles: string[]): void {
    titles.forEach((title, index) => {
      if (title && title.trim()) {
        this.addTitleOverride(videoId, index, title.trim());
      }
    });
  }

  /**
   * Get manual title for a specific clip, if available
   */
  getTitleOverride(videoId: string, clipIndex: number): string | null {
    const videoOverrides = this.overrides.get(videoId);
    if (videoOverrides && videoOverrides[clipIndex]) {
      return videoOverrides[clipIndex];
    }
    return null;
  }

  /**
   * Check if we have any overrides for a video
   */
  hasOverridesForVideo(videoId: string): boolean {
    return this.overrides.has(videoId) && Object.keys(this.overrides.get(videoId)).length > 0;
  }

  /**
   * Get all overrides for a video
   */
  getVideoOverrides(videoId: string): TitleMap {
    return this.overrides.get(videoId) || {};
  }

  /**
   * Apply manual titles to testimony array
   */
  applyTitleOverrides(videoId: string, testimonies: Testimony[]): Testimony[] {
    if (!this.hasOverridesForVideo(videoId)) {
      console.log(`📋 No title overrides found for video ${videoId}`);
      return testimonies;
    }

    const overrides = this.getVideoOverrides(videoId);
    console.log(`📝 Applying ${Object.keys(overrides).length} title overrides for video ${videoId}`);

    return testimonies.map((testimony, index) => {
      const manualTitle = overrides[index];
      if (manualTitle) {
        console.log(`✏️  Clip ${index + 1}: "${testimony.title}" → "${manualTitle}"`);
        return {
          ...testimony,
          title: manualTitle,
          originalAiTitle: testimony.title, // Keep track of AI title
          manualTitle: true, // Flag to indicate manual override
          titleSource: 'manual'
        };
      }
      return {
        ...testimony,
        titleSource: 'ai'
      };
    });
  }

  /**
   * Save title overrides to database for persistence
   */
  async saveToDatabase() {
    if (!adminDb) {
      console.warn('Firebase not available, cannot save title overrides');
      return;
    }

    try {
      const overrideData = {};
      for (const [videoId, titles] of this.overrides) {
        overrideData[videoId] = titles;
      }

      await adminDb.collection('titleOverrides').doc('manual').set({
        overrides: overrideData,
        lastUpdated: new Date().toISOString()
      });

      console.log('💾 Title overrides saved to database');
    } catch (error) {
      console.error('❌ Error saving title overrides:', error.message);
    }
  }

  /**
   * Load title overrides from database
   */
  async loadFromDatabase() {
    if (!adminDb) {
      console.warn('Firebase not available, cannot load title overrides');
      return;
    }

    try {
      const doc = await adminDb.collection('titleOverrides').doc('manual').get();
      
      if (doc.exists) {
        const data = doc.data();
        if (data.overrides) {
          for (const [videoId, titles] of Object.entries(data.overrides)) {
            this.overrides.set(videoId, titles);
          }
          console.log(`📚 Loaded title overrides for ${this.overrides.size} videos`);
        }
      }
      
      this.loaded = true;
    } catch (error) {
      console.error('❌ Error loading title overrides:', error.message);
      this.loaded = true; // Still mark as loaded to prevent retries
    }
  }

  /**
   * Load from CSV-style data (for bulk import)
   * @param {Array} csvData - Array of objects with videoId, clipIndex, title
   */
  loadFromCSVData(csvData) {
    csvData.forEach(row => {
      if (row.videoId && row.title && row.clipIndex !== undefined) {
        this.addTitleOverride(row.videoId, parseInt(row.clipIndex), row.title);
      }
    });
  }

  /**
   * Clear all overrides
   */
  clear() {
    this.overrides.clear();
    console.log('🗑️ All title overrides cleared');
  }

  /**
   * Get summary of current overrides
   */
  getSummary() {
    const summary = {
      totalVideos: this.overrides.size,
      totalTitles: 0,
      videoDetails: {}
    };

    for (const [videoId, titles] of this.overrides) {
      const titleCount = Object.keys(titles).length;
      summary.totalTitles += titleCount;
      summary.videoDetails[videoId] = {
        titleCount,
        titles: titles
      };
    }

    return summary;
  }
}

// Global instance
export const titleOverrideManager = new TitleOverrideManager();

/**
 * Convenience function to apply title overrides during video processing
 * @param {string} videoId - YouTube video ID
 * @param {Array} testimonies - Array of testimony objects
 * @returns {Array} Updated testimony array
 */
export async function applyManualTitles(videoId, testimonies) {
  // Ensure overrides are loaded
  if (!titleOverrideManager.loaded) {
    await titleOverrideManager.loadFromDatabase();
  }

  // Apply any available overrides
  const updatedTestimonies = titleOverrideManager.applyTitleOverrides(videoId, testimonies);
  
  return updatedTestimonies;
}

/**
 * Add titles for a video programmatically
 * @param {string} videoId - YouTube video ID
 * @param {Array} titles - Array of titles in order
 */
export async function setVideoTitles(videoId, titles) {
  titleOverrideManager.addVideoTitles(videoId, titles);
  await titleOverrideManager.saveToDatabase();
  
  console.log(`✅ Set ${titles.length} manual titles for video ${videoId}`);
}