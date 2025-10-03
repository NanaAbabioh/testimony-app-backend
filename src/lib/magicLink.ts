// Magic Link authentication helpers for Firebase Auth
// Supports both new sign-ins and anonymous user account linking

import {
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  EmailAuthProvider,
  linkWithCredential,
  type Auth,
  type ActionCodeSettings
} from "firebase/auth";

// Storage key for persisting email during magic link flow
const STORAGE_KEY = "ah:ml:email";
const STORAGE_KEY_TIMESTAMP = "ah:ml:timestamp";
const LINK_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generates action code settings for magic link emails
 * Configures the callback URL and app behavior
 */
function actionCodeSettings(): ActionCodeSettings {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const url = `${baseUrl}/auth/finish-sign-in`;
  
  return {
    url,
    handleCodeInApp: true,
    // iOS and Android app settings (if you have mobile apps)
    iOS: {
      bundleId: 'com.alphahour.testimony' // Replace with your bundle ID
    },
    android: {
      packageName: 'com.alphahour.testimony' // Replace with your package name
    }
    // If you set up Firebase Dynamic Links later:
    // dynamicLinkDomain: "alphahour.page.link"
  };
}

/**
 * Initiates a magic link authentication flow
 * Sends a sign-in email to the provided address
 */
export async function startMagicLink(email: string): Promise<void> {
  if (!email || !email.includes('@')) {
    throw new Error('Valid email address required');
  }

  try {
    const auth = getAuth();
    
    // Send the magic link email
    await sendSignInLinkToEmail(auth, email.toLowerCase().trim(), actionCodeSettings());
    
    // Store email and timestamp for later verification
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, email.toLowerCase().trim());
      localStorage.setItem(STORAGE_KEY_TIMESTAMP, Date.now().toString());
    }
    
    console.log('Magic link sent to:', email);
  } catch (error: any) {
    console.error('Error sending magic link:', error);
    
    // Provide user-friendly error messages
    if (error.code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address');
    } else if (error.code === 'auth/too-many-requests') {
      throw new Error('Too many requests. Please wait a few minutes and try again');
    } else if (error.code === 'auth/quota-exceeded') {
      throw new Error('Email sending limit exceeded. Please try again later');
    } else {
      throw new Error('Failed to send magic link. Please try again');
    }
  }
}

/**
 * Checks if the current page URL is a magic link callback
 * Call this on page load to detect if user clicked a magic link
 */
export function isMagicLinkCallback(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const auth = getAuth();
    return isSignInWithEmailLink(auth, window.location.href);
  } catch (error) {
    console.error('Error checking magic link callback:', error);
    return false;
  }
}

/**
 * Gets the stored email from the magic link flow
 * Returns null if no email is stored or if it's expired
 */
export function getStoredEmail(): string | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const email = localStorage.getItem(STORAGE_KEY);
    const timestamp = localStorage.getItem(STORAGE_KEY_TIMESTAMP);
    
    if (!email || !timestamp) return null;
    
    // Check if the stored email has expired
    const storedTime = parseInt(timestamp, 10);
    if (Date.now() - storedTime > LINK_EXPIRY_MS) {
      // Clean up expired data
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY_TIMESTAMP);
      return null;
    }
    
    return email;
  } catch (error) {
    console.error('Error getting stored email:', error);
    return null;
  }
}

/**
 * Completes the magic link authentication flow
 * Handles both new sign-ins and anonymous user account linking
 */
export async function completeMagicLink(): Promise<{
  isNewUser: boolean;
  wasAnonymous: boolean;
  email: string;
}> {
  const auth = getAuth();
  
  // Get email from storage or prompt user
  let email = getStoredEmail();
  
  if (!email && typeof window !== 'undefined') {
    email = window.prompt(
      "Please confirm your email address to finish signing in:"
    )?.toLowerCase().trim() || "";
  }
  
  if (!email) {
    throw new Error('Email address is required to complete sign-in');
  }
  
  if (!email.includes('@')) {
    throw new Error('Please enter a valid email address');
  }

  try {
    const wasAnonymous = auth.currentUser?.isAnonymous || false;
    let userCredential;

    // If user is currently anonymous, link the email credential to preserve their data
    if (auth.currentUser?.isAnonymous) {
      console.log('Linking email credential to anonymous account...');
      const credential = EmailAuthProvider.credentialWithLink(email, window.location.href);
      userCredential = await linkWithCredential(auth.currentUser, credential);
    } else {
      console.log('Signing in with email link...');
      userCredential = await signInWithEmailLink(auth, email, window.location.href);
    }

    // Clean up stored data
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY_TIMESTAMP);
      
      // Clean up the URL to remove the magic link parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      url.searchParams.delete('oobCode');
      url.searchParams.delete('apiKey');
      url.searchParams.delete('lang');
      window.history.replaceState({}, '', url.pathname);
    }

    return {
      isNewUser: userCredential.additionalUserInfo?.isNewUser || false,
      wasAnonymous,
      email: userCredential.user.email || email
    };

  } catch (error: any) {
    console.error('Error completing magic link:', error);
    
    // Provide user-friendly error messages
    if (error.code === 'auth/invalid-action-code') {
      throw new Error('This link has expired or is invalid. Please request a new one');
    } else if (error.code === 'auth/expired-action-code') {
      throw new Error('This link has expired. Please request a new one');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('The email address is invalid');
    } else if (error.code === 'auth/credential-already-in-use') {
      throw new Error('This email is already associated with another account');
    } else {
      throw new Error('Failed to complete sign-in. Please try requesting a new link');
    }
  }
}

/**
 * Checks if there's a pending magic link flow
 * Useful for showing UI hints or continuing incomplete flows
 */
export function hasPendingMagicLink(): boolean {
  return getStoredEmail() !== null;
}

/**
 * Cancels a pending magic link flow
 * Clears stored email data
 */
export function cancelMagicLink(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY_TIMESTAMP);
}

/**
 * Gets user-friendly status information about the magic link flow
 * Useful for displaying progress or debugging
 */
export function getMagicLinkStatus(): {
  hasPending: boolean;
  email: string | null;
  isCallback: boolean;
  timeRemaining?: number;
} {
  const hasPending = hasPendingMagicLink();
  const email = getStoredEmail();
  const isCallback = isMagicLinkCallback();
  
  let timeRemaining: number | undefined;
  if (hasPending && typeof window !== 'undefined') {
    const timestamp = localStorage.getItem(STORAGE_KEY_TIMESTAMP);
    if (timestamp) {
      const elapsed = Date.now() - parseInt(timestamp, 10);
      timeRemaining = Math.max(0, LINK_EXPIRY_MS - elapsed);
    }
  }
  
  return {
    hasPending,
    email,
    isCallback,
    timeRemaining
  };
}

/**
 * Validates email format
 * More comprehensive than simple includes('@') check
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}