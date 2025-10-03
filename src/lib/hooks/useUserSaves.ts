// lib/hooks/useUserSaves.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  where, 
  limit as firestoreLimit,
  Unsubscribe 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './useAuth';

interface UserSave {
  clipId: string;
  savedAt: Date;
  clipTitle: string;
  categoryId: string;
  videoId: string;
}

interface UseUserSavesOptions {
  categoryId?: string;
  limit?: number;
  realtime?: boolean; // Enable real-time updates
}

export function useUserSaves(options: UseUserSavesOptions = {}) {
  const { categoryId, limit = 20, realtime = true } = options;
  const { user, loading: authLoading } = useAuth();
  const [saves, setSaves] = useState<UserSave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSaves = useCallback(() => {
    if (!user?.uid) {
      setSaves([]);
      setLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe | null = null;

    try {
      // Build the query
      const savesRef = collection(db, 'userSaves', user.uid, 'clips');
      let q = query(savesRef, orderBy('savedAt', 'desc'));

      // Apply category filter
      if (categoryId) {
        q = query(q, where('categoryId', '==', categoryId));
      }

      // Apply limit
      if (limit > 0) {
        q = query(q, firestoreLimit(limit));
      }

      const handleSnapshot = (snapshot: any) => {
        const savesData: UserSave[] = [];
        
        snapshot.forEach((doc: any) => {
          const data = doc.data();
          savesData.push({
            clipId: doc.id,
            savedAt: data.savedAt?.toDate() || new Date(),
            clipTitle: data.clipTitle || '',
            categoryId: data.categoryId || '',
            videoId: data.videoId || '',
          });
        });

        setSaves(savesData);
        setLoading(false);
      };

      const handleError = (err: any) => {
        console.error('[useUserSaves] Error:', err);
        setError(new Error(err.message || 'Failed to fetch saves'));
        setLoading(false);
      };

      if (realtime) {
        // Real-time listener
        unsubscribe = onSnapshot(q, handleSnapshot, handleError);
      } else {
        // One-time fetch - you'd need to implement this with getDocs
        // For now, we'll use the real-time listener
        unsubscribe = onSnapshot(q, (snapshot) => {
          handleSnapshot(snapshot);
          // Unsubscribe immediately for one-time fetch
          unsubscribe?.();
        }, handleError);
      }

    } catch (err) {
      console.error('[useUserSaves] Setup error:', err);
      setError(err instanceof Error ? err : new Error('Failed to setup saves listener'));
      setLoading(false);
    }

    // Return cleanup function
    return () => {
      unsubscribe?.();
    };
  }, [user?.uid, categoryId, limit, realtime]);

  useEffect(() => {
    if (authLoading) return; // Wait for auth to load

    const cleanup = fetchSaves();
    return cleanup;
  }, [authLoading, fetchSaves]);

  const isSaved = useCallback((clipId: string): boolean => {
    return saves.some(save => save.clipId === clipId);
  }, [saves]);

  const getSaveInfo = useCallback((clipId: string): UserSave | null => {
    return saves.find(save => save.clipId === clipId) || null;
  }, [saves]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchSaves();
  }, [fetchSaves]);

  return {
    saves,
    loading: loading || authLoading,
    error,
    isSaved,
    getSaveInfo,
    refresh,
    totalSaves: saves.length,
  };
}

/**
 * Hook to check if a specific clip is saved
 */
export function useIsClipSaved(clipId: string) {
  const { user, loading: authLoading } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user?.uid || !clipId) {
      setIsSaved(false);
      setLoading(false);
      return;
    }

    const saveRef = doc(db, 'userSaves', user.uid, 'clips', clipId);
    
    const unsubscribe = onSnapshot(
      saveRef,
      (doc) => {
        setIsSaved(doc.exists());
        setLoading(false);
      },
      (err) => {
        console.error('[useIsClipSaved] Error:', err);
        setError(new Error(err.message || 'Failed to check save status'));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, clipId, authLoading]);

  return { isSaved, loading: loading || authLoading, error };
}