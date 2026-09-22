import {
  Eye,
  Globe2,
  LockKeyhole,
  LogOut,
  PencilLine,
  Settings,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import brandIcon from '../../../icon.png';
import type { AppRoute } from '../app/useAppRoute';
import type { AuthState } from '../auth/authState.mjs';

interface AppTopBarProps {
  route: AppRoute;
  authState: AuthState;
  onNavigate: (route: AppRoute) => void;
  onSignOut: () => void;
}

const navigation = [
  { route: 'view', label: 'View', Icon: Eye },
  { route: 'edit', label: 'Edit', Icon: PencilLine },
  { route: 'settings', label: 'Settings', Icon: Settings },
] as const;

export function AppTopBar({ route, authState, onNavigate, onSignOut }: AppTopBarProps) {
  const editorAuthenticated = authState.status === 'authenticated-editor';
  const statusLabel = route === 'view'
    ? 'Public View Mode'
    : editorAuthenticated
      ? authState.user.email ?? 'Approved editor'
      : authState.status === 'initializing'
        ? 'Checking editor session'
        : 'Editor sign-in required';

  return (
    <header className="app-topbar">
      <div className="brand-lockup">
        <img src={brandIcon} alt="" />
        <div>
          <strong>Arta Gătitului</strong>
          <span>{route === 'view' ? 'Site public' : 'Application shell'}</span>
        </div>
      </div>

      <nav className="mode-tabs" aria-label="Application areas">
        {navigation.map(({ route: target, label, Icon }) => (
          <a
            key={target}
            href={`#${target}`}
            className={route === target ? 'active' : undefined}
            aria-current={route === target ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(target);
            }}
          >
            <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <div className="topbar-actions">
        <span className="save-state">
          {route === 'view' ? (
            <Globe2 aria-hidden="true" size={16} />
          ) : editorAuthenticated ? (
            <ShieldCheck aria-hidden="true" size={16} />
          ) : (
            <LockKeyhole aria-hidden="true" size={16} />
          )}
          {statusLabel}
        </span>
        {route !== 'view' && (
          <button
            className="icon-command"
            type="button"
            title="Open View Mode"
            aria-label="Open View Mode"
            onClick={() => onNavigate('view')}
          >
            <Eye aria-hidden="true" size={18} />
          </button>
        )}
        {editorAuthenticated && (
          <button
            className="icon-command"
            type="button"
            title="Sign out"
            aria-label="Sign out"
            onClick={onSignOut}
          >
            <LogOut aria-hidden="true" size={18} />
          </button>
        )}
        {route !== 'view' && editorAuthenticated && (
            <button className="publish-button" type="button" disabled title="Publishing is not available">
              <UploadCloud aria-hidden="true" size={17} />
              <span>Publish</span>
            </button>
        )}
      </div>
    </header>
  );
}
