import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';

const FIREBASE_APP_NAME = 'arta-gatitului-editor';

export function getFirebaseApp(options: FirebaseOptions): FirebaseApp {
  const existingApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);
  return existingApp ?? initializeApp(options, FIREBASE_APP_NAME);
}
