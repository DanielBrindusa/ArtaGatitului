import { Cloud, Copy, GitCompareArrows, HardDriveDownload, Redo2, Undo2 } from 'lucide-react';
import type { useDraftWorkspace } from '../drafts/useDraftWorkspace';
import { recoveryFieldDifferences } from '../drafts/localRecovery.mjs';

type Workspace = ReturnType<typeof useDraftWorkspace>;

function valueLabel(value: unknown) {
  if (typeof value === 'string') return value || 'Empty';
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === 'object') return `${Object.keys(value).length} fields`;
  return String(value ?? 'None');
}

export function UndoRedoControls({ workspace }: { workspace: Workspace }) {
  return <div className="editor-history-controls" aria-label="Edit history">
    <button className="icon-command" type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!workspace.canUndo} onClick={workspace.undo}><Undo2 size={17} /></button>
    <button className="icon-command" type="button" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!workspace.canRedo} onClick={workspace.redo}><Redo2 size={17} /></button>
  </div>;
}

export function LocalRecoveryDialog({ workspace }: { workspace: Workspace }) {
  const recovery = workspace.localRecovery;
  if (!recovery) return null;
  return <div className="draft-dialog-backdrop" role="presentation">
    <div className="draft-dialog recovery-dialog" role="alertdialog" aria-modal="true" aria-labelledby="local-recovery-title">
      <HardDriveDownload size={23} />
      <h2 id="local-recovery-title">A newer local recovery version was found.</h2>
      <p>The local copy was saved after the synchronized Firestore revision. Choose which version to continue with.</p>
      {recovery.differences.length > 0 && <div className="recovery-comparison">
        {recovery.differences.slice(0, 6).map((difference) => <div key={difference.path}>
          <strong>{difference.path}</strong>
          <span><b>Cloud</b>{valueLabel(difference.remote)}</span>
          <span><b>Local</b>{valueLabel(difference.local)}</span>
        </div>)}
      </div>}
      <div className="draft-dialog-actions recovery-actions">
        <button className="secondary-command" type="button" onClick={workspace.useRecoveryCloudVersion}><Cloud size={16} />Use cloud version</button>
        <button className="secondary-command" type="button" onClick={workspace.saveRecoveryAsCopy}><Copy size={16} />Save local as copy</button>
        <button className="primary-command" type="button" onClick={workspace.recoverLocalVersion}><HardDriveDownload size={16} />Recover local version</button>
      </div>
    </div>
  </div>;
}

export function ConflictResolutionDialog({ workspace }: { workspace: Workspace }) {
  const conflict = workspace.conflict;
  if (!conflict) return null;
  const differences = conflict.remoteDraft
    ? recoveryFieldDifferences(conflict.localDraft, conflict.remoteDraft)
    : [];
  return <div className="draft-dialog-backdrop" role="presentation">
    <div className="draft-dialog recovery-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sync-conflict-title">
      <GitCompareArrows size={23} />
      <h2 id="sync-conflict-title">This draft changed on another device</h2>
      <p>No version was selected automatically. Compare the cloud fields with your local recovery copy, then choose a safe resolution.</p>
      {differences.length > 0 && <div className="recovery-comparison">
        {differences.slice(0, 8).map((difference) => <div key={difference.path}>
          <strong>{difference.path}</strong>
          <span><b>Cloud</b>{valueLabel(difference.remote)}</span>
          <span><b>Mine</b>{valueLabel(difference.local)}</span>
        </div>)}
      </div>}
      {!conflict.remoteDraft && <div className="publish-error">The cloud draft was deleted. Your local recovery copy remains intact.</div>}
      <div className="draft-dialog-actions recovery-actions">
        <button className="secondary-command" type="button" onClick={workspace.useCloudVersion}><Cloud size={16} />Use cloud version</button>
        <button className="primary-command" type="button" onClick={workspace.saveConflictAsCopy}><Copy size={16} />Keep mine as copy</button>
      </div>
      <p className="conflict-manual-note">To combine individual fields, keep your version as a copy, then manually apply the cloud values shown above.</p>
    </div>
  </div>;
}
