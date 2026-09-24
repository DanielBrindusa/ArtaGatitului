import { LockKeyhole, LogOut, MonitorSmartphone, PackageCheck, UserRoundCheck } from 'lucide-react';
import { APP_IDENTIFIER, APP_VERSION } from '../app/release';

const settingsRows = [
  {
    Icon: PackageCheck,
    title: 'Release version',
    value: APP_VERSION,
  },
  {
    Icon: PackageCheck,
    title: 'Application identity',
    value: APP_IDENTIFIER,
  },
  {
    Icon: LockKeyhole,
    title: 'Native permissions',
    value: 'Scoped local CMS commands only',
  },
  {
    Icon: MonitorSmartphone,
    title: 'Targets',
    value: 'Windows desktop and Android',
  },
] as const;

interface SettingsModeProps {
  userEmail: string | null;
  onSignOut: () => void;
}

export function SettingsMode({ userEmail, onSignOut }: SettingsModeProps) {
  return (
    <main className="workspace settings-workspace">
      <div className="workspace-heading">
        <div>
          <span className="workspace-kicker">Application</span>
          <h1>Settings</h1>
        </div>
        <button className="secondary-command" type="button" onClick={onSignOut}>
          <LogOut aria-hidden="true" size={17} />
          Sign out
        </button>
      </div>
      <section className="settings-panel" aria-label="Application settings summary">
        <div className="settings-row">
          <UserRoundCheck aria-hidden="true" size={20} />
          <div>
            <strong>Editor account</strong>
            <span>{userEmail ?? 'Approved Firebase user'}</span>
          </div>
          <span className="settings-placeholder">Authenticated</span>
        </div>
        {settingsRows.map(({ Icon, title, value }) => (
          <div className="settings-row" key={title}>
            <Icon aria-hidden="true" size={20} />
            <div>
              <strong>{title}</strong>
              <span>{value}</span>
            </div>
            <span className="settings-placeholder">Configured</span>
          </div>
        ))}
      </section>
    </main>
  );
}
