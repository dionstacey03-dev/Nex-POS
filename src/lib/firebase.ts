import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, Auth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export const isFirebaseConfigured = Boolean(
  firebaseConfig?.projectId &&
    firebaseConfig?.apiKey &&
    firebaseConfig.projectId !== 'remixed-project-id'
);

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  authInstance = getAuth(app);
}

export const db = dbInstance;
export const auth = authInstance;

export async function testFirestoreConnection(): Promise<boolean> {
  if (!db) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    // The connection probe intentionally reads a path that may be denied by
    // the default-deny Firestore rules. PERMISSION_DENIED still proves that
    // the client reached Firestore; transport/configuration failures do not.
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';

    if (code === 'permission-denied') return true;

    console.error('Firestore connection check failed:', code || 'unknown error');
    return false;
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : 'unknown';

  // Do not write user email addresses, auth identifiers, or raw backend
  // payloads to browser logs. Keep enough context to diagnose rule failures.
  console.error('Firestore operation failed:', {
    code,
    operationType,
    path,
  });

  const message =
    code === 'permission-denied'
      ? 'You do not have permission to perform this action.'
      : code === 'unavailable' || code === 'deadline-exceeded'
        ? 'The database is temporarily unavailable. Check your connection and try again.'
        : 'The database operation failed. Please try again or contact your administrator.';
  throw new Error(message);
}

export async function signInWithGooglePopup() {
  if (!auth) {
    throw new Error('Firebase Authentication is not configured.');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export async function signOutFirebase() {
  if (!auth) return;
  await signOut(auth);
}
