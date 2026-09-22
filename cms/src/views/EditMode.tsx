import {
  Columns3,
  Heading2,
  Image,
  ListChecks,
  MousePointer2,
  PanelRight,
  Text,
} from 'lucide-react';
import { SharedRecipePreview } from '../components/SharedRecipePreview';

const blockPlaceholders = [
  { label: 'Heading', Icon: Heading2 },
  { label: 'Text', Icon: Text },
  { label: 'Image', Icon: Image },
  { label: 'Section', Icon: Columns3 },
  { label: 'Ingredients', Icon: ListChecks },
] as const;

export function EditMode() {
  return (
    <main className="workspace edit-workspace">
      <aside className="editor-panel block-library" aria-labelledby="block-library-title">
        <div className="panel-heading">
          <div>
            <span className="workspace-kicker">Library</span>
            <h2 id="block-library-title">Blocks</h2>
          </div>
          <Columns3 aria-hidden="true" size={18} />
        </div>
        <div className="block-list">
          {blockPlaceholders.map(({ label, Icon }) => (
            <button key={label} type="button" disabled>
              <Icon aria-hidden="true" size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <p className="panel-note">Editor controls are reserved for Milestone 8.</p>
      </aside>

      <section className="editor-canvas" aria-labelledby="canvas-title">
        <div className="canvas-toolbar">
          <div>
            <span className="workspace-kicker">Canvas</span>
            <h1 id="canvas-title">Recipe preview</h1>
          </div>
          <span className="canvas-status">
            <MousePointer2 aria-hidden="true" size={15} />
            No selection
          </span>
        </div>
        <div className="canvas-stage">
          <SharedRecipePreview viewport="desktop" compact />
        </div>
      </section>

      <aside className="editor-panel inspector" aria-labelledby="inspector-title">
        <div className="panel-heading">
          <div>
            <span className="workspace-kicker">Inspector</span>
            <h2 id="inspector-title">Properties</h2>
          </div>
          <PanelRight aria-hidden="true" size={18} />
        </div>
        <div className="empty-inspector">
          <MousePointer2 aria-hidden="true" size={22} />
          <strong>Select a block</strong>
          <span>Block properties will appear here.</span>
        </div>
        <div className="property-skeleton" aria-hidden="true">
          <span />
          <div />
          <span />
          <div />
          <span />
          <div className="short" />
        </div>
      </aside>
    </main>
  );
}
