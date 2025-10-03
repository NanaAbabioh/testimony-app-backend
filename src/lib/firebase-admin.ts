import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let adminDb: Firestore | null = null;

// Initialize Firebase Admin SDK
function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    // Already initialized
    adminDb = getFirestore();
    return;
  }

  // Check if we have valid credentials
  const hasValidCredentials = process.env.FIREBASE_CLIENT_EMAIL && 
                              process.env.FIREBASE_PRIVATE_KEY &&
                              process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
                              process.env.FIREBASE_CLIENT_EMAIL.includes('@') &&
                              process.env.FIREBASE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY');
  
  if (hasValidCredentials) {
    try {
      console.log('Initializing Firebase Admin with project:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
      
      initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        }),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: 'ah-testimony-library.firebasestorage.app', // Use the actual Firebase Storage bucket name
      });
      
      adminDb = getFirestore();
      console.log('Firebase Admin initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Firebase Admin:', error);
      adminDb = null;
    }
  } else {
    console.warn('Firebase Admin credentials not found or invalid.');
    console.log('Available env vars:', {
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmailValid: process.env.FIREBASE_CLIENT_EMAIL?.includes('@'),
      privateKeyValid: process.env.FIREBASE_PRIVATE_KEY?.includes('BEGIN PRIVATE KEY')
    });
    adminDb = null;
  }
}

// Initialize on import
initializeFirebaseAdmin();

export { adminDb };