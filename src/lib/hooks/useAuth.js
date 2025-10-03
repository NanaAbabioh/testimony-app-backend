'use client';

import { useState, useEffect } from 'react';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously, 
  signOut
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';

// Import Firebase configuration and magicLink utilities
import { firebaseConfig } from '../firebase/config';
import { 
  startMagicLink, 
  completeMagicLink, 
  isMagicLinkCallback, 
  getMagicLinkStatus,
  cancelMagicLink,
  isValidEmail
} from '../magicLink';

// Initialize Firebase app
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/**
 * Enhanced React Hook for Firebase Authentication
 * Integrates with the existing magicLink system for seamless anonymous-to-permanent account upgrade
 */
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authState, setAuthState] = useState('loading'); // 'loading', 'anonymous', 'authenticated', 'error'

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // User is signed in
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            isAnonymous: firebaseUser.isAnonymous,
            emailVerified: firebaseUser.emailVerified,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          });
          
          // Update auth state
          setAuthState(firebaseUser.isAnonymous ? 'anonymous' : 'authenticated');
          
          console.log('Auth state updated:', {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            isAnonymous: firebaseUser.isAnonymous
          });
        } else {
          // No user is signed in, automatically sign in anonymously
          console.log('No user detected, signing in anonymously...');
          const result = await signInAnonymously(auth);
          console.log('Anonymous sign-in successful:', result.user.uid);
        }
        
        setError(null); // Clear any previous errors on successful auth change
      } catch (error) {
        console.error('Authentication error:', error);
        setError(error.message);
        setAuthState('error');
      } finally {
        setLoading(false);
      }
    });

    // Check if user is returning from a magic link
    if (isMagicLinkCallback()) {
      handleMagicLinkReturn();
    }

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  /**
   * Handle user returning from magic link
   * Uses the sophisticated magicLink system
   */
  const handleMagicLinkReturn = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await completeMagicLink();
      
      console.log('Magic link completion result:', result);
      
      // The user state will be updated automatically via onAuthStateChanged
      return result;
    } catch (error) {
      console.error('Error completing magic link:', error);
      setError(error.message);
      setAuthState('error');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Send magic link to user's email using the sophisticated magicLink system
   * @param {string} email - User's email address
   */
  const sendSignInLink = async (email) => {
    if (!email || !isValidEmail(email)) {
      return { success: false, message: 'Please enter a valid email address' };
    }

    try {
      setLoading(true);
      setError(null);

      await startMagicLink(email);
      
      console.log('Magic link sent successfully to:', email);
      return { 
        success: true, 
        message: 'Check your email! We sent you a secure sign-in link.' 
      };
    } catch (error) {
      console.error('Error sending magic link:', error);
      setError(error.message);
      return { success: false, message: error.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign out the current user and clean up magic link state
   */
  const signOutUser = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Cancel any pending magic link flows
      cancelMagicLink();
      
      // Sign out from Firebase
      await signOut(auth);
      
      console.log('User signed out successfully');
      setAuthState('loading'); // Will trigger anonymous sign-in
    } catch (error) {
      console.error('Error signing out:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get magic link status information
   */
  const getMagicLinkInfo = () => {
    return getMagicLinkStatus();
  };

  /**
   * Cancel a pending magic link flow
   */
  const cancelPendingMagicLink = () => {
    cancelMagicLink();
    return { success: true, message: 'Magic link request cancelled' };
  };

  /**
   * Check if user can upgrade (is currently anonymous)
   */
  const canUpgrade = user && user.isAnonymous;

  /**
   * Check if user is fully authenticated (not anonymous)
   */
  const isAuthenticated = user && !user.isAnonymous;

  return {
    // User state
    user,
    loading,
    error,
    authState,
    
    // Status checks
    canUpgrade,
    isAuthenticated,
    
    // Actions
    sendSignInLink,
    signOutUser,
    
    // Magic link utilities
    getMagicLinkInfo,
    cancelPendingMagicLink,
    
    // For debugging/advanced usage
    isMagicLinkCallback: isMagicLinkCallback(),
  };
};