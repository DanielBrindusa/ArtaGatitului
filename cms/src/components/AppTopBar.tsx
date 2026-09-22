import {
  CheckCircle2,
  Eye,
  PencilLine,
  Settings,
  UploadCloud,
} from 'lucide-react';
import brandIcon from '../../../icon.png';
import type { AppRoute } from '../app/useAppRoute';

interface AppTopBarProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

const navigation = [
  { route: 'view', label: 'View', Icon: Eye },
  { route: 'edit', label: 'Edit', Icon: PencilLine },
  { route: 'settings', label: 'Settings', Icon: Settings },
] as const;

export function AppTopBar({ route, onNavigate }: AppTopBarProps) {
  return (
    <header className="app-topbar">
      <div className="brand-lockup">
        <img src={brandIcon} alt="" />
        <div>
          <strong>Arta Gătitului</strong>
          <span>Application shell</span>
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
          <CheckCircle2 aria-hidden="true" size={16} />
          Development mode
        </span>
        <button
          className="icon-command"
          type="button"
          title="Open View Mode"
          aria-label="Open View Mode"
          onClick={() => onNavigate('view')}
        >
          <Eye aria-hidden="true" size={18} />
        </button>
        <button className="publish-button" type="button" disabled title="Publishing is not available">
          <UploadCloud aria-hidden="true" size={17} />
          <span>Publish</span>
        </button>
      </div>
    </header>
  );
}
