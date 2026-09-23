import type { FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth';
import type { AuthUser } from './authState.mjs';
import { getFirebaseApp } from '../firebase/firebaseClient';

export interface AuthGateway {
  observe(onUser: (user: AuthUser | null) => void, onError: (error: unknown) => void): () => void;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
}

let authInstance: Auth | undefined;

function firebaseAuth(options: FirebaseOptions) {
  if (authInstance) return authInstance;

  const app = getFirebaseApp(options);
  authInstance = initializeAuth(app, { persistence: browserLocalPersistence });
  return authInstance;
}

function normalizeUser(user: { uid: string; email: string | null }): AuthUser {
  return { uid: user.uid, email: user.email };
}

export function createFirebaseAuthGateway(options: FirebaseOptions): AuthGateway {
  const auth = firebaseAuth(options);

  return {
    observe(onUser, onError) {
      return onAuthStateChanged(
        auth,
        (user) => onUser(user ? normalizeUser(user) : null),
        onError,
      );
    },
    async signIn(email, password) {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      return normalizeUser(credential.user);
    },
    async signOut() {
      await firebaseSignOut(auth);
    },
  };
}
