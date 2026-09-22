import { LockKeyhole, MonitorSmartphone, PackageCheck } from 'lucide-react';

const settingsRows = [
  {
    Icon: PackageCheck,
    title: 'Application identity',
    value: 'ro.danielbrindusa.artagatitului',
  },
  {
    Icon: LockKeyhole,
    title: 'Native permissions',
    value: 'No privileged commands enabled',
  },
  {
    Icon: MonitorSmartphone,
    title: 'Targets',
    value: 'Windows and Android foundation',
  },
] as const;

export function SettingsMode() {
  return (
    <main className="workspace settings-workspace">
      <div className="workspace-heading">
        <div>
          <span className="workspace-kicker">Application</span>
          <h1>Settings</h1>
        </div>
      </div>
      <section className="settings-panel" aria-label="Application settings summary">
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
