import type { FirebaseOptions } from 'firebase/app';
import { parseApprovedEditorUids } from './authState.mjs';

interface FirebaseAuthConfiguration {
  firebase: FirebaseOptions;
  approvedEditorUids: string[];
}

type FirebaseAuthConfigurationResult =
  | { status: 'ready'; configuration: FirebaseAuthConfiguration }
  | { status: 'missing' };

const PLACEHOLDER_PREFIX = 'replace-with-';

function configuredValue(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized && !normalized.startsWith(PLACEHOLDER_PREFIX) ? normalized : '';
}

export function readFirebaseAuthConfiguration(
  environment: Record<string, unknown> = import.meta.env,
): FirebaseAuthConfigurationResult {
  const apiKey = configuredValue(environment.VITE_FIREBASE_API_KEY);
  const authDomain = configuredValue(environment.VITE_FIREBASE_AUTH_DOMAIN);
  const projectId = configuredValue(environment.VITE_FIREBASE_PROJECT_ID);
  const appId = configuredValue(environment.VITE_FIREBASE_APP_ID);
  const messagingSenderId = configuredValue(environment.VITE_FIREBASE_MESSAGING_SENDER_ID);
  const approvedEditorUids = parseApprovedEditorUids(
    configuredValue(environment.VITE_FIREBASE_EDITOR_UIDS),
  );

  if (!apiKey || !authDomain || !projectId || !appId || !messagingSenderId || approvedEditorUids.length === 0) {
    return { status: 'missing' };
  }

  return {
    status: 'ready',
    configuration: {
      firebase: { apiKey, authDomain, projectId, appId, messagingSenderId },
      approvedEditorUids,
    },
  };
}
