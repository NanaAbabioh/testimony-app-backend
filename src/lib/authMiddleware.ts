// lib/authMiddleware.ts
import { NextRequest } from "next/server";
import { adminAuth } from "./firebaseAdmin";
import { DecodedIdToken } from "firebase-admin/auth";

export interface AuthenticatedRequest extends NextRequest {
  user?: DecodedIdToken;
}

/**
 * Verifies the Firebase ID token from the Authorization header
 * Returns the decoded token if valid, null otherwise
 */
export async function verifyIdToken(request: NextRequest): Promise<DecodedIdToken | null> {
  try {
    // Get the Authorization header
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[Auth Middleware] No valid Authorization header");
      return null;
    }
    
    // Extract the token
    const idToken = authHeader.substring(7); // Remove "Bearer " prefix
    
    if (!idToken) {
      console.log("[Auth Middleware] No token provided");
      return null;
    }
    
    // Verify the token with Firebase Admin
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    console.log("[Auth Middleware] Token verified for user:", decodedToken.uid);
    
    return decodedToken;
  } catch (error) {
    console.error("[Auth Middleware] Token verification failed:", error);
    return null;
  }
}

/**
 * Middleware wrapper that ensures the request is authenticated
 * Use this to protect API endpoints
 */
export function requireAuth(
  handler: (request: NextRequest, user: DecodedIdToken) => Promise<Response>
) {
  return async (request: NextRequest): Promise<Response> => {
    const decodedToken = await verifyIdToken(request);
    
    if (!decodedToken) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    
    return handler(request, decodedToken);
  };
}