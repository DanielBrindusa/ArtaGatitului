import {
  AlertCircle,
  ArrowLeft,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import brandIcon from '../../../icon.png';
import { AUTH_STATUSES } from '../auth/authState.mjs';
import { useAuth } from '../auth/AuthProvider';

interface AuthGateProps {
  onReturnToView: () => void;
}

export function AuthGate({ onReturnToView }: AuthGateProps) {
  const { state, signIn, signOut, dismissError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedPassword = password;
    setPassword('');
    await signIn(email.trim(), submittedPassword);
  }

  async function handleDeniedSignOut() {
    if (await signOut()) onReturnToView();
  }

  if (state.status === AUTH_STATUSES.initializing) {
    return (
      <main className="workspace auth-workspace auth-status-workspace">
        <LoaderCircle className="auth-spinner" aria-hidden="true" size={28} />
        <h1>Checking editor access</h1>
        <p>View Mode remains available while the editor session is restored.</p>
        <button className="secondary-command" type="button" onClick={onReturnToView}>
          <ArrowLeft aria-hidden="true" size={17} />
          Return to View
        </button>
      </main>
    );
  }

  if (state.status === AUTH_STATUSES.unauthorized) {
    return (
      <main className="workspace auth-workspace auth-status-workspace">
        <LockKeyhole aria-hidden="true" size={30} />
        <h1>Editor access unavailable</h1>
        <p>This account is signed in but is not approved for editing.</p>
        <div className="auth-status-actions">
          <button className="primary-command" type="button" onClick={() => void handleDeniedSignOut()}>
            <LogOut aria-hidden="true" size={17} />
            Sign out
          </button>
          <button className="secondary-command" type="button" onClick={onReturnToView}>
            <ArrowLeft aria-hidden="true" size={17} />
            Return to View
          </button>
        </div>
      </main>
    );
  }

  if (
    state.status === AUTH_STATUSES.configurationError
    || (state.status === AUTH_STATUSES.error && state.kind === 'configuration')
  ) {
    return (
      <main className="workspace auth-workspace auth-status-workspace">
        <AlertCircle aria-hidden="true" size={30} />
        <h1>Editor access unavailable</h1>
        <p>{state.message}</p>
        <button className="secondary-command" type="button" onClick={onReturnToView}>
          <ArrowLeft aria-hidden="true" size={17} />
          Return to View
        </button>
      </main>
    );
  }

  const authenticating = state.status === AUTH_STATUSES.authenticating;
  const errorMessage = state.status === AUTH_STATUSES.error ? state.message : null;

  return (
    <main className="workspace auth-workspace">
      <section className="auth-introduction" aria-labelledby="auth-title">
        <img src={brandIcon} alt="" />
        <span className="workspace-kicker">Editor access</span>
        <h1 id="auth-title">Edit Arta Gătitului</h1>
        <p>Sign in with an approved editor account.</p>
      </section>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-form-heading">
          <KeyRound aria-hidden="true" size={21} />
          <h2>Sign in</h2>
        </div>

        {errorMessage && (
          <div className="auth-error" role="alert">
            <AlertCircle aria-hidden="true" size={17} />
            <span>{errorMessage}</span>
          </div>
        )}

        <label htmlFor="editor-email">Email</label>
        <input
          id="editor-email"
          type="email"
          value={email}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={authenticating}
          onChange={(event) => {
            if (errorMessage) dismissError();
            setEmail(event.target.value);
          }}
        />

        <label htmlFor="editor-password">Password</label>
        <input
          id="editor-password"
          type="password"
          value={password}
          autoComplete="current-password"
          required
          disabled={authenticating}
          onChange={(event) => {
            if (errorMessage) dismissError();
            setPassword(event.target.value);
          }}
        />

        <button className="primary-command auth-submit" type="submit" disabled={authenticating}>
          {authenticating ? (
            <LoaderCircle className="auth-spinner" aria-hidden="true" size={17} />
          ) : (
            <LogIn aria-hidden="true" size={17} />
          )}
          {authenticating ? 'Signing in...' : 'Sign in'}
        </button>

        <button className="auth-return" type="button" onClick={onReturnToView}>
          <ArrowLeft aria-hidden="true" size={16} />
          Return to public View
        </button>
      </form>
    </main>
  );
}
