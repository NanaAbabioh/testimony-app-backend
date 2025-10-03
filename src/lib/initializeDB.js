import { db } from './firebase';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';

export const initializeDatabase = async () => {
  try {
    // Initialize categories collection with sample data
    const categoriesData = [
      { name: 'Healing', description: 'Testimonies about physical, emotional, or spiritual healing' },
      { name: 'Financial Breakthrough', description: 'Testimonies about financial miracles and provisions' },
      { name: 'Salvation', description: 'Testimonies about accepting Jesus Christ as savior' },
      { name: 'Deliverance', description: 'Testimonies about freedom from spiritual bondage' },
      { name: 'Relationship Restoration', description: 'Testimonies about restored marriages and relationships' },
      { name: 'Career & Education', description: 'Testimonies about job opportunities and academic success' }
    ];

    // Add categories to Firestore
    for (const category of categoriesData) {
      await addDoc(collection(db, 'categories'), category);
    }

    // Add a sample video (we'll use a placeholder YouTube ID)
    const sampleVideo = {
      title: 'Sunday Service - Powerful Testimonies',
      thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      uploadDate: new Date().toISOString().split('T')[0]
    };

    await setDoc(doc(db, 'videos', 'dQw4w9WgXcQ'), sampleVideo);

    console.log('Database initialized successfully!');
    return { success: true, message: 'Database initialized with sample data' };
  } catch (error) {
    console.error('Error initializing database:', error);
    return { success: false, error: error.message };
  }
};

export const testDatabaseRead = async () => {
  try {
    const { getDocs } = await import('firebase/firestore');
    
    // Test reading categories
    const categoriesSnapshot = await getDocs(collection(db, 'categories'));
    const categories = categoriesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log('Categories:', categories);
    return { success: true, categories };
  } catch (error) {
    console.error('Error reading database:', error);
    return { success: false, error: error.message };
  }
};