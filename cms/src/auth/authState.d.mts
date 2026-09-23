export interface AuthUser {
  uid: string;
  email: string | null;
}

export type AuthFailureKind =
  | 'credentials'
  | 'disabled'
  | 'network'
  | 'rate-limit'
  | 'configuration'
  | 'unknown';

export type AuthState =
  | { status: 'initializing' }
  | { status: 'unauthenticated' }
  | { status: 'authenticating' }
  | { status: 'authenticated-but-unauthorized'; user: AuthUser }
  | { status: 'authenticated-editor'; user: AuthUser }
  | { status: 'authentication-error'; kind: AuthFailureKind; message: string }
  | { status: 'configuration-error'; message: string };

export const AUTH_STATUSES: Readonly<{
  initializing: 'initializing';
  unauthenticated: 'unauthenticated';
  authenticating: 'authenticating';
  unauthorized: 'authenticated-but-unauthorized';
  editor: 'authenticated-editor';
  error: 'authentication-error';
  configurationError: 'configuration-error';
}>;

export function parseApprovedEditorUids(value: string | undefined | null): string[];
export function authStateForUser(user: AuthUser | null, approvedEditorUids: readonly string[]): AuthState;
export function canAccessEditor(authState: AuthState): boolean;
export function resolveAppSurface(
  route: 'view' | 'edit' | 'settings',
  authState: AuthState,
): 'view' | 'edit' | 'settings' | 'auth';
