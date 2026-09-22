export const AUTH_STATUSES = Object.freeze({
  initializing: 'initializing',
  unauthenticated: 'unauthenticated',
  authenticating: 'authenticating',
  unauthorized: 'authenticated-but-unauthorized',
  editor: 'authenticated-editor',
  error: 'authentication-error',
  configurationError: 'configuration-error',
});

export function parseApprovedEditorUids(value) {
  return [...new Set(String(value ?? '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean))];
}

export function authStateForUser(user, approvedEditorUids) {
  if (!user) return { status: AUTH_STATUSES.unauthenticated };

  const normalizedUser = {
    uid: user.uid,
    email: user.email ?? null,
  };

  if (approvedEditorUids.includes(user.uid)) {
    return { status: AUTH_STATUSES.editor, user: normalizedUser };
  }

  return { status: AUTH_STATUSES.unauthorized, user: normalizedUser };
}

export function canAccessEditor(authState) {
  return authState.status === AUTH_STATUSES.editor;
}

export function resolveAppSurface(route, authState) {
  if (route === 'view') return 'view';
  return canAccessEditor(authState) ? route : 'auth';
}
