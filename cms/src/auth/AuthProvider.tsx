import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AUTH_STATUSES,
  authStateForUser,
  type AuthState,
} from './authState.mjs';
import { normalizeAuthFailure } from './authErrors';
import { createFirebaseAuthGateway, type AuthGateway } from './firebaseAuthGateway';
import { readFirebaseAuthConfiguration } from './firebaseConfig';

interface AuthContextValue {
  state: AuthState;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<boolean>;
  dismissError(): void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: AUTH_STATUSES.initializing });
  const gatewayRef = useRef<AuthGateway | undefined>(undefined);
  const approvedEditorUidsRef = useRef<string[]>([]);

  useEffect(() => {
    const result = readFirebaseAuthConfiguration();
    if (result.status === 'missing') {
      setState({
        status: AUTH_STATUSES.configurationError,
        message: 'Editor access is not configured on this installation.',
      });
      return undefined;
    }

    let active = true;
    let gateway: AuthGateway;
    try {
      gateway = createFirebaseAuthGateway(result.configuration.firebase);
    } catch (error) {
      const failure = normalizeAuthFailure(error);
      setState({
        status: AUTH_STATUSES.configurationError,
        message: failure.kind === 'configuration'
          ? failure.message
          : 'Editor access could not be initialized on this installation.',
      });
      return undefined;
    }

    gatewayRef.current = gateway;
    approvedEditorUidsRef.current = result.configuration.approvedEditorUids;

    const unsubscribe = gateway.observe(
      (user) => {
        if (active) setState(authStateForUser(user, approvedEditorUidsRef.current));
      },
      (error) => {
        if (!active) return;
        const failure = normalizeAuthFailure(error);
        setState({ status: AUTH_STATUSES.error, ...failure });
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const gateway = gatewayRef.current;
    if (!gateway) {
      setState({
        status: AUTH_STATUSES.configurationError,
        message: 'Editor access is not configured on this installation.',
      });
      return;
    }

    setState({ status: AUTH_STATUSES.authenticating });
    try {
      const user = await gateway.signIn(email, password);
      setState(authStateForUser(user, approvedEditorUidsRef.current));
    } catch (error) {
      const failure = normalizeAuthFailure(error);
      setState({ status: AUTH_STATUSES.error, ...failure });
    }
  }, []);

  const signOut = useCallback(async () => {
    const gateway = gatewayRef.current;
    setState({ status: AUTH_STATUSES.initializing });

    if (!gateway) {
      setState({ status: AUTH_STATUSES.unauthenticated });
      return true;
    }

    try {
      await gateway.signOut();
      setState({ status: AUTH_STATUSES.unauthenticated });
      return true;
    } catch (error) {
      const failure = normalizeAuthFailure(error);
      setState({ status: AUTH_STATUSES.error, ...failure });
      return false;
    }
  }, []);

  const dismissError = useCallback(() => {
    setState((current) => current.status === AUTH_STATUSES.error
      ? { status: AUTH_STATUSES.unauthenticated }
      : current);
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signOut, dismissError }),
    [dismissError, signIn, signOut, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
