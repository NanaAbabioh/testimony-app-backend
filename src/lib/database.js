import { adminDb } from './firebase-admin';

/**
 * Save video information to Firestore
 */
export async function saveVideo(videoId, videoInfo) {
  if (!adminDb) {
    console.warn('Firebase Admin not initialized. Skipping video save.');
    return;
  }
  
  try {
    await adminDb.collection('videos').doc(videoId).set(videoInfo);
    console.log(`Video ${videoId} saved to database`);
  } catch (error) {
    console.error('Error saving video:', error);
    throw new Error('Failed to save video to database');
  }
}

/**
 * Save testimony clips to Firestore
 */
export async function saveClips(videoId, clips) {
  if (!adminDb) {
    console.warn('Firebase Admin not initialized. Skipping clips save.');
    return;
  }
  
  try {
    const batch = adminDb.batch();
    
    for (const clip of clips) {
      const clipRef = adminDb.collection('clips').doc();
      const clipToSave = {
        ...clip,
        sourceVideoId: videoId,
        createdAt: new Date().toISOString(),
      };
      
      console.log(`Saving clip to database:`, {
        title: clipToSave.title,
        category: clipToSave.category,
        sourceVideoId: clipToSave.sourceVideoId,
        hasFullText: !!clipToSave.fullText,
        startTime: clipToSave.startTimeSeconds,
        endTime: clipToSave.endTimeSeconds,
        hasProcessedClipUrl: !!clipToSave.processedClipUrl,
        hasVideoProcessingError: !!clipToSave.videoProcessingError
      });
      
      batch.set(clipRef, clipToSave);
    }
    
    await batch.commit();
    console.log(`${clips.length} clips saved to database`);
  } catch (error) {
    console.error('Error saving clips:', error);
    throw new Error('Failed to save clips to database');
  }
}

/**
 * Get or create category by name
 */
export async function ensureCategory(categoryName) {
  if (!adminDb) {
    console.warn('Firebase Admin not initialized. Returning mock category ID.');
    return 'mock-category-id';
  }
  
  try {
    const categoriesRef = adminDb.collection('categories');
    const querySnapshot = await categoriesRef.where('name', '==', categoryName).get();
    
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].id;
    }
    
    // Create new category
    const categoryData = {
      name: categoryName,
      description: `Testimonies related to ${categoryName}`,
      createdAt: new Date().toISOString(),
    };
    
    const docRef = await categoriesRef.add(categoryData);
    console.log(`Category "${categoryName}" created with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('Error ensuring category:', error);
    throw new Error('Failed to ensure category exists');
  }
}