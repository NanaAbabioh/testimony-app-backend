// Uses a service account JSON in env FIREBASE_SERVICE_ACCOUNT_JSON.
// Runtime is Node (not Edge).
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let app: App;
if (!getApps().length) {
  const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!);
  app = initializeApp({ credential: cert(svc) });
} else {
  app = getApps()[0]!;
}

export const db = getFirestore(app);
export const adminAuth = getAuth(app);