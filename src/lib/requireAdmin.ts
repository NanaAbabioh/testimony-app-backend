import { verifyToken } from "../src/app/api/admin/auth/login/route";

export type AdminUser = { uid: string; email?: string | null };

export async function requireAdmin(authHeader?: string): Promise<AdminUser> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing auth token");
  const token = authHeader.slice("Bearer ".length);
  
  // Use our simple token verification
  const isValid = verifyToken(token);
  if (!isValid) throw new Error("Invalid or expired token");
  
  return { uid: "admin", email: "admin@alphahour.com" };
}