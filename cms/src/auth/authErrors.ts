import type { AuthFailureKind } from './authState.mjs';

export interface AuthFailure {
  kind: AuthFailureKind;
  message: string;
}

function errorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code : '';
}

export function normalizeAuthFailure(error: unknown): AuthFailure {
  switch (errorCode(error)) {
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
    case 'auth/missing-password':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return {
        kind: 'credentials',
        message: 'The email or password is incorrect.',
      };
    case 'auth/user-disabled':
      return {
        kind: 'disabled',
        message: 'This editor account has been disabled.',
      };
    case 'auth/network-request-failed':
      return {
        kind: 'network',
        message: 'Editor sign-in is temporarily unavailable. Check the connection and try again.',
      };
    case 'auth/too-many-requests':
      return {
        kind: 'rate-limit',
        message: 'Too many attempts were made. Wait before trying again.',
      };
    case 'auth/app-not-authorized':
    case 'auth/invalid-api-key':
    case 'auth/operation-not-allowed':
    case 'auth/unauthorized-domain':
      return {
        kind: 'configuration',
        message: 'Editor access is not configured correctly on this installation.',
      };
    default:
      return {
        kind: 'unknown',
        message: 'Editor sign-in could not be completed. Try again.',
      };
  }
}
