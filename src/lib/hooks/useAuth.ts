// lib/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { auth, ensureGuest, onAuthChange } from '../authClient';

/**
 * Custom hook for Firebase authentication state
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(!auth.currentUser);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = onAuthChange((user) => {
      setUser(user);
      setLoading(false);
    });

    // Ensure guest user on mount if no user exists
    if (!auth.currentUser) {
      ensureGuest()
        .then(setUser)
        .catch(setError)
        .finally(() => setLoading(false));
    }

    // Cleanup subscription
    return unsubscribe;
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    isAnonymous: user?.isAnonymous ?? false,
    userId: user?.uid ?? null,
  };
}

/**
 * Hook to ensure user is authenticated before performing actions
 */
export function useEnsureAuth() {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    ensureGuest()
      .then((user) => {
        setUserId(user.uid);
        setReady(true);
      })
      .catch((error) => {
        console.error('[useEnsureAuth] Failed to ensure auth:', error);
        setReady(true); // Set ready even on error to prevent infinite loading
      });
  }, []);

  return { ready, userId };
}