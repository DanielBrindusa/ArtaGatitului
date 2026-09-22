import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Copy,
  FileText,
  HardDrive,
  ImageOff,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type { RecipeDraft } from '../drafts/draftModel.mjs';
import { useDraftWorkspace, type DraftSaveState } from '../drafts/useDraftWorkspace';

function lines(value: string) {
  return value.split(/\r?\n/);
}

function nonNegativeInteger(value: string) {
  if (value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function formatModified(value: string | null) {
  if (!value) return 'Local draft';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Local draft';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function SaveIcon({ state }: { state: DraftSaveState }) {
  if (state === 'saving' || state === 'loading') return <LoaderCircle className="draft-spinner" aria-hidden="true" size={16} />;
  if (state === 'offline') return <CloudOff aria-hidden="true" size={16} />;
  if (state === 'conflict' || state === 'error') return <AlertTriangle aria-hidden="true" size={16} />;
  if (state === 'local') return <HardDrive aria-hidden="true" size={16} />;
  return <Check aria-hidden="true" size={16} />;
}

function updateRecipe(
  draft: RecipeDraft,
  recipeChange: Partial<RecipeDraft['data']['recipe']>,
  draftChange: Partial<Pick<RecipeDraft, 'title' | 'slug' | 'status'>> = {},
) {
  return {
    ...draft,
    ...draftChange,
    data: {
      ...draft.data,
      recipe: { ...draft.data.recipe, ...recipeChange },
    },
  };
}

export function EditMode({ uid }: { uid: string }) {
  const workspace = useDraftWorkspace(uid);
  const draft = workspace.activeDraft;

  return (
    <main className="workspace edit-workspace">
      <aside className="draft-sidebar" aria-labelledby="draft-list-title">
        <div className="draft-sidebar-heading">
          <div>
            <span className="workspace-kicker">Workspace</span>
            <h1 id="draft-list-title">Drafts</h1>
          </div>
          <button className="icon-command" type="button" title="New draft" aria-label="New draft" onClick={() => void workspace.newDraft()}>
            <Plus aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="draft-list">
          {workspace.drafts.length === 0 && (
            <div className="draft-list-empty">
              <FileText aria-hidden="true" size={22} />
              <strong>No drafts yet</strong>
              <span>Create a recipe draft to begin.</span>
            </div>
          )}
          {workspace.drafts.map((record) => (
            <div className={`draft-list-row${draft?.id === record.draft.id ? ' active' : ''}`} key={record.draft.id}>
              <button className="draft-open" type="button" onClick={() => void workspace.selectDraft(record.draft.id)}>
                <span>{record.draft.title || 'Untitled recipe'}</span>
                <small>
                  {record.hasConflict ? 'Conflict' : record.dirty ? 'Local changes' : `Revision ${record.draft.revision}`}
                  {' / '}
                  {formatModified(record.dirty ? record.backedUpAt : record.draft.updatedAt)}
                </small>
              </button>
              <div className="draft-row-actions">
                <button type="button" title="Duplicate draft" aria-label={`Duplicate ${record.draft.title}`} onClick={() => void workspace.duplicateDraft(record.draft.id)}>
                  <Copy aria-hidden="true" size={15} />
                </button>
                <button type="button" title="Delete draft" aria-label={`Delete ${record.draft.title}`} onClick={() => workspace.requestDelete(record.draft)}>
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="draft-editor" aria-labelledby="draft-editor-title">
        <header className="draft-editor-toolbar">
          <div>
            <span className="workspace-kicker">Recipe draft</span>
            <h2 id="draft-editor-title">{draft?.title || 'Select a draft'}</h2>
          </div>
          <span className={`draft-save-state draft-save-${workspace.saveState}`} aria-live="polite">
            <SaveIcon state={workspace.saveState} />
            {workspace.saveLabel}
          </span>
        </header>

        {workspace.errorMessage && (
          <div className="draft-error" role="status">
            <AlertTriangle aria-hidden="true" size={17} />
            <span>{workspace.errorMessage}</span>
            <button type="button" title="Dismiss" aria-label="Dismiss sync message" onClick={workspace.dismissError}>
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        )}

        {!draft ? (
          <div className="draft-editor-empty">
            <FileText aria-hidden="true" size={28} />
            <h2>Your recipe drafts live here</h2>
            <p>Draft content is recovered locally and synchronized through Firestore after sign-in.</p>
            <button className="primary-command" type="button" onClick={() => void workspace.newDraft()}>
              <Plus aria-hidden="true" size={17} />
              New draft
            </button>
          </div>
        ) : (
          <form className="draft-form" onSubmit={(event) => event.preventDefault()} onBlur={() => void workspace.flush()}>
            <div className="draft-form-grid">
              <label className="field-wide">
                <span>Title</span>
                <input
                  maxLength={200}
                  value={draft.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    workspace.updateDraft((current) => updateRecipe(current, { title, name: title }, { title }));
                  }}
                />
              </label>
              <label>
                <span>Slug</span>
                <input
                  maxLength={160}
                  value={draft.slug}
                  spellCheck={false}
                  onChange={(event) => {
                    const slug = event.target.value;
                    workspace.updateDraft((current) => updateRecipe(current, { slug }, { slug }));
                  }}
                />
              </label>
              <label>
                <span>Draft status</span>
                <select
                  value={draft.status}
                  onChange={(event) => {
                    const status = event.target.value as RecipeDraft['status'];
                    workspace.updateDraft((current) => updateRecipe(
                      current,
                      { status: status === 'published' ? 'published' : 'draft' },
                      { status },
                    ));
                  }}
                >
                  <option value="draft">Draft</option>
                  <option value="ready">Ready</option>
                  <option value="published" disabled>Published (set during publishing)</option>
                </select>
              </label>
              <label className="field-wide">
                <span>Description</span>
                <textarea rows={3} value={draft.data.recipe.description} onChange={(event) => workspace.updateDraft((current) => updateRecipe(current, { description: event.target.value }))} />
              </label>
              <label>
                <span>Category</span>
                <input value={draft.data.recipe.category} onChange={(event) => workspace.updateDraft((current) => updateRecipe(current, { category: event.target.value }))} />
              </label>
              <label>
                <span>Tags</span>
                <input
                  value={(draft.data.recipe.tags.general ?? []).join(', ')}
                  placeholder="quick, family"
                  onChange={(event) => workspace.updateDraft((current) => updateRecipe(current, {
                    tags: {
                      ...current.data.recipe.tags,
                      general: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                    },
                  }))}
                />
              </label>
              <label>
                <span>Ingredients, one per line</span>
                <textarea rows={8} value={draft.data.recipe.ingredients.join('\n')} onChange={(event) => workspace.updateDraft((current) => updateRecipe(current, { ingredients: lines(event.target.value) }))} />
              </label>
              <label>
                <span>Instructions, one per line</span>
                <textarea rows={8} value={draft.data.recipe.steps.join('\n')} onChange={(event) => {
                  const steps = lines(event.target.value);
                  workspace.updateDraft((current) => updateRecipe(current, { steps, preparation: steps }));
                }} />
              </label>
              <label>
                <span>Before starting</span>
                <textarea rows={5} value={draft.data.recipe.beforeStart.join('\n')} onChange={(event) => workspace.updateDraft((current) => updateRecipe(current, { beforeStart: lines(event.target.value) }))} />
              </label>
              <label>
                <span>Equipment</span>
                <textarea rows={5} value={draft.data.recipe.equipment.join('\n')} onChange={(event) => workspace.updateDraft((current) => updateRecipe(current, { equipment: lines(event.target.value) }))} />
              </label>
              <div className="draft-number-fields field-wide">
                <label>
                  <span>Prep minutes</span>
                  <input type="number" min="0" value={draft.data.recipe.prepTimeMinutes ?? ''} onChange={(event) => workspace.updateDraft((current) => updateRecipe(current, { prepTimeMinutes: nonNegativeInteger(event.target.value) }))} />
                </label>
                <label>
                  <span>Cook minutes</span>
                  <input type="number" min="0" value={draft.data.recipe.cookTimeMinutes ?? ''} onChange={(event) => workspace.updateDraft((current) => updateRecipe(current, { cookTimeMinutes: nonNegativeInteger(event.target.value) }))} />
                </label>
                <label>
                  <span>Servings</span>
                  <input value={draft.data.recipe.servings ?? ''} onChange={(event) => workspace.updateDraft((current) => updateRecipe(current, { servings: event.target.value || null }))} />
                </label>
              </div>
            </div>
          </form>
        )}
      </section>

      <aside className="draft-details" aria-labelledby="draft-details-title">
        <div className="panel-heading">
          <div>
            <span className="workspace-kicker">Details</span>
            <h2 id="draft-details-title">Synchronization</h2>
          </div>
          <Cloud aria-hidden="true" size={18} />
        </div>

        <dl className="draft-metadata">
          <div><dt>Revision</dt><dd>{draft?.revision ?? '-'}</dd></div>
          <div><dt>Schema</dt><dd>{draft ? `v${draft.schemaVersion}` : '-'}</dd></div>
          <div><dt>Updated</dt><dd>{draft ? formatModified(draft.updatedAt) : '-'}</dd></div>
          <div><dt>Layout blocks</dt><dd>{draft?.layout.blocks.length ?? '-'}</dd></div>
        </dl>

        <div className="draft-detail-section">
          <span className="detail-label">Preview preference</span>
          <div className="viewport-control draft-viewport-control" aria-label="Preview breakpoint">
            {(['desktop', 'tablet', 'mobile'] as const).map((breakpoint) => (
              <button key={breakpoint} type="button" className={workspace.previewBreakpoint === breakpoint ? 'active' : undefined} onClick={() => workspace.setPreviewBreakpoint(breakpoint)}>
                {breakpoint}
              </button>
            ))}
          </div>
        </div>

        <div className="draft-detail-section attachment-status">
          <ImageOff aria-hidden="true" size={18} />
          <div>
            <strong>Image metadata only</strong>
            <span>{draft?.data.attachments.length ?? 0} linked attachment records. Image bytes stay on their source device until GitHub publishing is added.</span>
          </div>
        </div>
      </aside>

      {workspace.deleteCandidate && (
        <div className="draft-dialog-backdrop" role="presentation">
          <div className="draft-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-draft-title">
            <Trash2 aria-hidden="true" size={22} />
            <h2 id="delete-draft-title">Delete this draft?</h2>
            <p>"{workspace.deleteCandidate.title || 'Untitled recipe'}" will be removed from Firestore and this device. Published GitHub content is not affected.</p>
            <div className="draft-dialog-actions">
              <button className="secondary-command" type="button" onClick={workspace.cancelDelete}>Cancel</button>
              <button className="danger-command" type="button" onClick={() => void workspace.confirmDelete()}>
                <Trash2 aria-hidden="true" size={16} />
                Delete draft
              </button>
            </div>
          </div>
        </div>
      )}

      {workspace.conflict && (
        <div className="draft-dialog-backdrop" role="presentation">
          <div className="draft-dialog" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title">
            <RefreshCw aria-hidden="true" size={22} />
            <h2 id="conflict-title">This draft changed on another device</h2>
            <p>Your local edits are still in the recovery copy. Choose the cloud version, or preserve your edits as a new draft.</p>
            <div className="draft-dialog-actions conflict-actions">
              <button className="secondary-command" type="button" onClick={workspace.useCloudVersion}>
                <Cloud aria-hidden="true" size={16} />
                Use cloud version
              </button>
              <button className="primary-command" type="button" onClick={workspace.saveConflictAsCopy}>
                <Copy aria-hidden="true" size={16} />
                Save mine as copy
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
