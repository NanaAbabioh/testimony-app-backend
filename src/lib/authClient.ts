// lib/authClient.ts (client-side)
import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { clientAuth as auth } from "./firebase";

// Re-export auth for convenience
export { auth };

/**
 * Ensures the current user is authenticated anonymously.
 * If no user is signed in, creates an anonymous session.
 * Returns the authenticated user.
 */
export async function ensureGuest(): Promise<User> {
  // Check if user is already authenticated
  if (!auth.currentUser) {
    try {
      // Sign in anonymously
      const userCredential = await signInAnonymously(auth);
      console.log("[Auth] Anonymous user created:", userCredential.user.uid);
      return userCredential.user;
    } catch (error) {
      console.error("[Auth] Error signing in anonymously:", error);
      throw error;
    }
  }
  
  // Return existing user
  console.log("[Auth] Existing user found:", auth.currentUser.uid);
  return auth.currentUser;
}

/**
 * Gets the current user or waits for auth state to be determined.
 * Useful for initial app load when auth state is being restored.
 */
export async function getCurrentUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Gets the current user's ID token for authenticated API calls.
 * Returns null if no user is authenticated.
 */
export async function getUserIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error("[Auth] Error getting ID token:", error);
    return null;
  }
}

/**
 * Signs out the current user (useful for testing or user preference).
 * After sign out, the next ensureGuest() call will create a new anonymous session.
 */
export async function signOut(): Promise<void> {
  try {
    await auth.signOut();
    console.log("[Auth] User signed out");
  } catch (error) {
    console.error("[Auth] Error signing out:", error);
    throw error;
  }
}

/**
 * Subscribes to auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Checks if the current user is anonymous.
 */
export function isAnonymousUser(): boolean {
  return auth.currentUser?.isAnonymous ?? false;
}

/**
 * Gets the current user's UID or null if not authenticated.
 */
export function getCurrentUserId(): string | null {
  return auth.currentUser?.uid ?? null;
}