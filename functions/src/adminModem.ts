import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getStorage, type Storage } from 'firebase-admin/storage';

/**
 * Initialise the Admin SDK once for the whole Cloud Functions runtime. When
 * running on Functions the SDK auto-discovers project, credentials, and the
 * default bucket via the Application Default Credentials provided by Google.
 */
export function ensureAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
  const databaseURL = process.env.FIREBASE_DATABASE_URL
    || (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined);

  return initializeApp(databaseURL ? { databaseURL } : undefined);
}

const app = ensureAdminApp();
export const adminAuth: Auth = getAuth(app);
export const adminDb: Firestore = getFirestore(app);
export const adminRtdb: Database = getDatabase(app);
export const adminStorage: Storage = getStorage(app);
