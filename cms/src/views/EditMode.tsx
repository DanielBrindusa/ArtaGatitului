import {
  AlertTriangle,
  ArchiveRestore,
  BookOpen,
  Check,
  ChevronDown,
  Cloud,
  CloudOff,
  Copy,
  Eye,
  FileText,
  GitFork,
  HardDrive,
  LoaderCircle,
  LogOut,
  Monitor,
  PencilLine,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { BlockType } from '../../../src/shared/index.mjs';
import brandIcon from '../../../icon.png';
import type { AppRoute } from '../app/useAppRoute';
import { SharedRecipePreview } from '../components/SharedRecipePreview';
import { type RecipeDraft } from '../drafts/draftModel.mjs';
import { useDraftWorkspace, type DraftSaveState } from '../drafts/useDraftWorkspace';
import { BlockInspector } from '../editor/BlockInspector';
import { BlockLibrary } from '../editor/BlockLibrary';
import { createBlockId, insertDraftBlock } from '../editor/editorModel.mjs';
import { validateDraftImage } from '../editor/imageValidation.mjs';
import { loadDraftImage, removeDraftImage, storeDraftImage } from '../editor/localImageStore';
import { GitHubPublishingDialogs } from '../publishing/GitHubPublishingDialogs';
import { useGitHubPublishing, type GitHubPublishingController } from '../publishing/useGitHubPublishing';
import {
  VisualRecipeCanvas,
  type EditorViewport,
  type LocalImageStatus,
} from '../editor/VisualRecipeCanvas';

type EditorMode = 'edit' | 'preview';
type MobileSheet = 'blocks' | 'inspector' | null;

function SaveIcon({ state }: { state: DraftSaveState }) {
  if (state === 'saving' || state === 'loading') return <LoaderCircle className="draft-spinner" aria-hidden="true" size={16} />;
  if (state === 'offline') return <CloudOff aria-hidden="true" size={16} />;
  if (state === 'conflict' || state === 'error') return <AlertTriangle aria-hidden="true" size={16} />;
  if (state === 'local') return <HardDrive aria-hidden="true" size={16} />;
  return <Check aria-hidden="true" size={16} />;
}

function EditorTopBar({
  draft,
  workspace,
  mode,
  setMode,
  viewport,
  setViewport,
  email,
  onNavigate,
  onSignOut,
  publishing,
}: {
  draft: RecipeDraft | null;
  workspace: ReturnType<typeof useDraftWorkspace>;
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;
  viewport: EditorViewport;
  setViewport: (viewport: EditorViewport) => void;
  email: string | null;
  onNavigate: (route: AppRoute) => void;
  onSignOut: () => void;
  publishing: GitHubPublishingController;
}) {
  const viewportOptions = [
    { value: 'desktop' as const, label: 'Desktop', Icon: Monitor },
    { value: 'tablet' as const, label: 'Tablet', Icon: Tablet },
    { value: 'mobile' as const, label: 'Mobile', Icon: Smartphone },
  ];
  return (
    <header className="editor-topbar">
      <div className="editor-brand">
        <img src={brandIcon} alt="" />
        <div><strong>Arta Gătitului</strong><span>Recipe CMS</span></div>
      </div>

      <div className="draft-switcher">
        <label htmlFor="active-draft">Draft</label>
        <div>
          <select id="active-draft" value={draft?.id ?? ''} onChange={(event) => void workspace.selectDraft(event.target.value)}>
            {!draft && <option value="">No draft selected</option>}
            {workspace.drafts.map((record) => <option key={record.draft.id} value={record.draft.id}>{record.draft.title || 'Untitled recipe'}</option>)}
          </select>
          <ChevronDown aria-hidden="true" size={15} />
        </div>
      </div>

      <span className={`draft-save-state draft-save-${workspace.saveState}`} aria-live="polite"><SaveIcon state={workspace.saveState} />{workspace.saveLabel}</span>
      {draft?.sourceLink && <span className={`active-publication-state publication-${draft.status}`}>{draft.status === 'publishedDeleted' ? 'Deleted' : draft.status === 'published' ? 'Published' : 'Draft changes'}</span>}

      <div className="editor-topbar-center">
        <div className="editor-segments" aria-label="Editor mode">
          <button type="button" className={mode === 'edit' ? 'active' : undefined} onClick={() => setMode('edit')}><PencilLine aria-hidden="true" size={15} /><span>Edit</span></button>
          <button type="button" className={mode === 'preview' ? 'active' : undefined} onClick={() => setMode('preview')}><Eye aria-hidden="true" size={15} /><span>Preview</span></button>
        </div>
        <div className="editor-segments viewport-segments" aria-label="Responsive preview">
          {viewportOptions.map(({ value, label, Icon }) => <button key={value} type="button" title={label} aria-label={label} className={viewport === value ? 'active' : undefined} onClick={() => setViewport(value)}><Icon aria-hidden="true" size={15} /><span>{label}</span></button>)}
        </div>
      </div>

      <div className="editor-topbar-actions">
        <button className="new-recipe-button" type="button" onClick={() => void workspace.newDraft()}><Plus aria-hidden="true" size={16} /><span>New recipe</span></button>
        <button className="secondary-command published-recipes-command" type="button" disabled={publishing.busy} onClick={publishing.openRecipes}><BookOpen aria-hidden="true" size={16} /><span>Recipes</span></button>
        {draft && <button className="icon-command desktop-draft-action" type="button" title="Duplicate draft" aria-label="Duplicate draft" onClick={() => void workspace.duplicateDraft(draft.id)}><Copy aria-hidden="true" size={16} /></button>}
        {draft && <button className="icon-command desktop-draft-action" type="button" title="Delete draft" aria-label="Delete draft" onClick={() => workspace.requestDelete(draft)}><Trash2 aria-hidden="true" size={16} /></button>}
        {draft && <details className="account-menu draft-actions-menu"><summary title="Draft actions" aria-label="Draft actions"><FileText aria-hidden="true" size={17} /></summary><div><button type="button" onClick={() => void workspace.duplicateDraft(draft.id)}><Copy aria-hidden="true" size={15} />Duplicate draft</button><button type="button" onClick={() => workspace.requestDelete(draft)}><Trash2 aria-hidden="true" size={15} />Delete draft</button></div></details>}
        <button className="icon-command public-view-command" type="button" title="Open public View Mode" aria-label="Open public View Mode" onClick={() => onNavigate('view')}><Eye aria-hidden="true" size={17} /></button>
        <details className="account-menu">
          <summary title="Editor account" aria-label="Editor account"><Settings2 aria-hidden="true" size={17} /></summary>
          <div><strong>{email ?? 'Approved editor'}</strong><button type="button" onClick={onSignOut}><LogOut aria-hidden="true" size={15} />Sign out</button></div>
        </details>
        <button className={`github-connection-button${publishing.connection?.repositoryVerified ? ' connected' : ''}`} type="button" title={publishing.connection?.repositoryVerified ? 'GitHub connected' : 'Connect GitHub'} onClick={publishing.openConnection}><GitFork aria-hidden="true" size={16} /><span>{publishing.connection?.repositoryVerified ? 'GitHub ready' : 'Connect GitHub'}</span></button>
        <button
          className="publish-button"
          type="button"
          disabled={!draft || draft.status === 'published' || draft.status === 'publishedDeleted' || !publishing.connection?.repositoryVerified || publishing.busy}
          title={draft?.status === 'publishedDeleted'
            ? 'Create this deleted draft as a new recipe before publishing'
            : draft?.status === 'published'
              ? 'This draft already matches the published recipe'
            : publishing.connection?.repositoryVerified
              ? 'Review and publish this recipe'
              : 'Connect and verify GitHub before publishing'}
          onClick={() => void publishing.prepare()}
        >
          {publishing.busy ? <LoaderCircle className="draft-spinner" aria-hidden="true" size={16} /> : <UploadCloud aria-hidden="true" size={16} />}
          <span>{publishing.stage === 'validating' ? 'Validating' : publishing.stage === 'preparing' ? 'Preparing' : publishing.stage === 'publishing' ? 'Publishing' : draft?.status === 'publishedDeleted' ? 'Deleted' : draft?.status === 'published' ? 'Published' : draft?.sourceLink ? 'Publish update' : 'Publish'}</span>
        </button>
      </div>
    </header>
  );
}

export function EditMode({
  uid,
  email,
  onNavigate,
  onSignOut,
}: {
  uid: string;
  email: string | null;
  onNavigate: (route: AppRoute) => void;
  onSignOut: () => void;
}) {
  const workspace = useDraftWorkspace(uid);
  const draft = workspace.activeDraft;
  const [mode, setMode] = useState<EditorMode>('edit');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [localImageStatus, setLocalImageStatus] = useState<LocalImageStatus>('none');
  const [imageError, setImageError] = useState<string | null>(null);
  const [discardPublishedArmed, setDiscardPublishedArmed] = useState(false);
  const publishing = useGitHubPublishing({
    draft,
    drafts: workspace.drafts,
    uid,
    deviceId: workspace.deviceId,
    flush: workspace.flush,
    markPublished: workspace.markPublished,
    markPublishedDeleted: workspace.markPublishedDeleted,
    openPublishedRecipe: workspace.openPublishedRecipe,
  });

  const viewport = workspace.previewBreakpoint;
  const selectedBlock = useMemo(
    () => draft?.layout.blocks.find((block) => block.id === selectedBlockId) ?? null,
    [draft, selectedBlockId],
  );

  useEffect(() => {
    if (!draft) {
      setSelectedBlockId(null);
      return;
    }
    if (!draft.layout.blocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(draft.layout.blocks[0]?.id ?? null);
    }
  }, [draft, selectedBlockId]);

  useEffect(() => {
    setDiscardPublishedArmed(false);
  }, [workspace.publishedDraftChoice]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLocalImageUrl(null);
    const attachment = draft?.data.attachments[0];
    if (!draft || !attachment?.localAttachmentId) {
      setLocalImageStatus('none');
      return undefined;
    }
    setLocalImageStatus('loading');
    void loadDraftImage(uid, draft.id, attachment.localAttachmentId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setLocalImageStatus(attachment.sourceDeviceId !== workspace.deviceId ? 'other-device' : 'missing-local');
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setLocalImageUrl(objectUrl);
        setLocalImageStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setLocalImageStatus(attachment.sourceDeviceId !== workspace.deviceId ? 'other-device' : 'missing-local');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [draft?.id, draft?.data.attachments, uid, workspace.deviceId]);

  async function handleImage(file: File) {
    if (!draft) return;
    setImageError(null);
    const validation = await validateDraftImage(file);
    if (!validation.valid || !validation.metadata) {
      setImageError(validation.errors.join(' '));
      return;
    }
    const existing = draft.data.attachments[0];
    const attachmentId = existing?.id ?? createBlockId('image');
    try {
      await storeDraftImage(uid, draft.id, attachmentId, file);
      workspace.updateDraft((current) => ({
        ...current,
        data: {
          ...current.data,
          attachments: [{
            id: attachmentId,
            fileName: file.name.replace(/[\\/]/g, '-').slice(0, 255) || 'recipe-image',
            alt: existing?.alt || current.title,
            localAttachmentId: attachmentId,
            sourceDeviceId: workspace.deviceId,
            repositoryPath: existing?.repositoryPath ?? null,
            mimeType: validation.metadata?.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
            byteSize: validation.metadata?.byteSize ?? null,
            width: validation.metadata?.width ?? null,
            height: validation.metadata?.height ?? null,
          }],
        },
      }));
    } catch {
      setImageError('The image passed validation, but its local working copy could not be stored.');
    }
  }

  async function handleRemoveImage() {
    if (!draft) return;
    const attachment = draft.data.attachments[0];
    if (attachment?.localAttachmentId) {
      await removeDraftImage(uid, draft.id, attachment.localAttachmentId).catch(() => undefined);
    }
    workspace.updateDraft((current) => ({
      ...current,
      data: { ...current.data, attachments: [] },
    }));
  }

  function addBlock(type: BlockType) {
    if (!draft) return;
    const id = createBlockId(type);
    workspace.updateDraft((current) => insertDraftBlock(current, type, current.layout.blocks.length, { id }));
    setSelectedBlockId(id);
    setMobileSheet(null);
  }

  return (
    <main className="visual-editor-workspace">
      <EditorTopBar draft={draft} workspace={workspace} mode={mode} setMode={setMode} viewport={viewport} setViewport={workspace.setPreviewBreakpoint} email={email} onNavigate={onNavigate} onSignOut={onSignOut} publishing={publishing} />

      {(workspace.errorMessage || imageError || publishing.error) && (
        <div className="editor-notice" role="status"><AlertTriangle aria-hidden="true" size={16} /><span>{imageError ?? publishing.error ?? workspace.errorMessage}</span><button type="button" title="Dismiss" aria-label="Dismiss message" onClick={() => { setImageError(null); publishing.setError(null); workspace.dismissError(); }}><X aria-hidden="true" size={15} /></button></div>
      )}

      {!draft ? (
        <section className="editor-empty-state"><FileText aria-hidden="true" size={30} /><h1>Create a visual recipe</h1><p>Start with the complete Arta Gătitului recipe layout and autosave it as a Firestore draft.</p><button className="primary-command" type="button" onClick={() => void workspace.newDraft()}><Plus aria-hidden="true" size={17} />New recipe</button></section>
      ) : draft.status === 'publishedDeleted' ? (
        <section className="editor-empty-state"><ArchiveRestore aria-hidden="true" size={30} /><h1>Published recipe deleted</h1><p>This recovery record cannot republish the deleted production recipe. Create a new unlinked draft to use its content again.</p><button className="primary-command" type="button" onClick={() => void workspace.recreateDeletedDraft()}><Plus aria-hidden="true" size={17} />Create as new recipe</button></section>
      ) : mode === 'preview' ? (
        <section className="editor-preview-only"><SharedRecipePreview viewport={viewport} draft={draft} localImageUrl={localImageUrl} compact /></section>
      ) : (
        <div className="visual-editor-body">
          <aside className={`visual-side-panel block-library-panel${mobileSheet === 'blocks' ? ' mobile-open' : ''}`}><button className="mobile-sheet-close" type="button" title="Close block library" aria-label="Close block library" onClick={() => setMobileSheet(null)}><X aria-hidden="true" size={18} /></button><BlockLibrary draft={draft} onAdd={addBlock} /></aside>
          <section className="visual-editor-canvas"><VisualRecipeCanvas draft={draft} viewport={viewport} selectedBlockId={selectedBlockId} localImageUrl={localImageUrl} localImageStatus={localImageStatus} onSelectBlock={setSelectedBlockId} updateDraft={workspace.updateDraft} onPickImage={(file) => void handleImage(file)} onRemoveImage={() => void handleRemoveImage()} /></section>
          <aside className={`visual-side-panel inspector-panel${mobileSheet === 'inspector' ? ' mobile-open' : ''}`}><button className="mobile-sheet-close" type="button" title="Close properties" aria-label="Close properties" onClick={() => setMobileSheet(null)}><X aria-hidden="true" size={18} /></button><BlockInspector draft={draft} block={selectedBlock} viewport={viewport} updateDraft={workspace.updateDraft} /></aside>
          <div className="mobile-editor-actions"><button type="button" title="Add block" aria-label="Add block" onClick={() => setMobileSheet('blocks')}><Plus aria-hidden="true" size={21} /></button><button type="button" title="Block properties" aria-label="Block properties" onClick={() => setMobileSheet('inspector')}><SlidersHorizontal aria-hidden="true" size={20} /></button></div>
          {mobileSheet && <button className="mobile-sheet-backdrop" type="button" aria-label="Close panel" onClick={() => setMobileSheet(null)} />}
        </div>
      )}

      {workspace.deleteCandidate && (
        <div className="draft-dialog-backdrop" role="presentation"><div className="draft-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-draft-title"><Trash2 aria-hidden="true" size={22} /><h2 id="delete-draft-title">Delete this draft?</h2><p>"{workspace.deleteCandidate.title || 'Untitled recipe'}" will be removed from Firestore and this device. Published GitHub content is not affected.</p><div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={workspace.cancelDelete}>Cancel</button><button className="danger-command" type="button" onClick={() => void workspace.confirmDelete()}><Trash2 aria-hidden="true" size={16} />Delete draft</button></div></div></div>
      )}

      {workspace.conflict && (
        <div className="draft-dialog-backdrop" role="presentation"><div className="draft-dialog" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title"><RefreshCw aria-hidden="true" size={22} /><h2 id="conflict-title">This draft changed on another device</h2><p>Your local edits are still in the recovery copy. Choose the cloud version, or preserve your edits as a new draft.</p><div className="draft-dialog-actions conflict-actions"><button className="secondary-command" type="button" onClick={workspace.useCloudVersion}><Cloud aria-hidden="true" size={16} />Use cloud version</button><button className="primary-command" type="button" onClick={workspace.saveConflictAsCopy}><Copy aria-hidden="true" size={16} />Save mine as copy</button></div></div></div>
      )}

      {workspace.publishedDraftChoice && (
        <div className="draft-dialog-backdrop" role="presentation"><div className="draft-dialog" role="alertdialog" aria-modal="true" aria-labelledby="published-draft-choice-title"><BookOpen aria-hidden="true" size={22} /><h2 id="published-draft-choice-title">An edit draft already exists</h2><p>Continue the existing Firestore draft for "{workspace.publishedDraftChoice.published.title}", or discard it and reload the current GitHub source.</p>{discardPublishedArmed && <div className="publish-error" role="alert"><AlertTriangle aria-hidden="true" size={16} /><span>This permanently deletes the existing edit draft and its local recovery copy. Click discard again to confirm.</span></div>}<div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={workspace.cancelPublishedDraftChoice}>Cancel</button><button className="secondary-command" type="button" onClick={workspace.continuePublishedDraft}><PencilLine aria-hidden="true" size={16} />Continue draft</button><button className="danger-command" type="button" onClick={() => { if (!discardPublishedArmed) { setDiscardPublishedArmed(true); return; } void workspace.discardPublishedDraft().catch((error: unknown) => setImageError(error instanceof Error ? error.message : 'The edit draft could not be discarded.')); }}><Trash2 aria-hidden="true" size={16} />{discardPublishedArmed ? 'Confirm discard' : 'Discard draft'}</button></div></div></div>
      )}

      <GitHubPublishingDialogs publishing={publishing} />
    </main>
  );
}
