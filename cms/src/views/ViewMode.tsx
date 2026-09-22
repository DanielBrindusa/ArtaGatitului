import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { useState } from 'react';
import {
  SharedRecipePreview,
  type PreviewViewport,
} from '../components/SharedRecipePreview';

const viewportOptions = [
  { value: 'desktop', label: 'Desktop', Icon: Monitor },
  { value: 'tablet', label: 'Tablet', Icon: Tablet },
  { value: 'mobile', label: 'Mobile', Icon: Smartphone },
] as const;

export function ViewMode() {
  const [viewport, setViewport] = useState<PreviewViewport>('desktop');

  return (
    <main className="workspace view-workspace">
      <div className="workspace-heading">
        <div>
          <span className="workspace-kicker">View shell</span>
          <h1>Arta Gătitului — View Mode</h1>
        </div>
        <div className="viewport-control" role="group" aria-label="Preview viewport">
          {viewportOptions.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              className={viewport === value ? 'active' : undefined}
              aria-pressed={viewport === value}
              title={label}
              onClick={() => setViewport(value)}
            >
              <Icon aria-hidden="true" size={17} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="preview-surface" aria-label="Shared renderer preview">
        <div className="preview-statusbar">
          <div>
            <span className="status-dot" aria-hidden="true" />
            Local shared preview
          </div>
          <span>Public website integration: Milestone 4</span>
        </div>
        <SharedRecipePreview viewport={viewport} />
      </section>
    </main>
  );
}
