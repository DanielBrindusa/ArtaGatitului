import {
  AlertTriangle,
  ArchiveRestore,
  Check,
  ChevronDown,
  Copy,
  Eye,
  FilePlus2,
  FileText,
  GitFork,
  HardDrive,
  Layers3,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BLOCK_TYPES, type BlockType, type ContentBlock } from '../../../src/shared/index.mjs';
import brandIcon from '../../../icon.png';
import type { AppRoute } from '../app/useAppRoute';
import { SharedPagePreview } from '../components/SharedPagePreview';
import { isPageDraft, type AnyDraft, type PageDraft } from '../drafts/draftModel.mjs';
import { useDraftWorkspace, type DraftSaveState } from '../drafts/useDraftWorkspace';
import { PageBlockInspector } from '../editor/PageBlockInspector';
import { PageBlockLibrary } from '../editor/PageBlockLibrary';
import { createBlockId } from '../editor/editorModel.mjs';
import { validateDraftImage } from '../editor/imageValidation.mjs';
import { loadDraftImage, removeDraftImage, storeDraftImage } from '../editor/localImageStore';
import {
  canNestBlock,
  findPageBlock,
  insertPageBlock,
  movePageBlock,
  removePageBlock,
  updatePageBlock,
} from '../editor/pageEditorModel.mjs';
import { VisualPageCanvas } from '../editor/VisualPageCanvas';
import { PagePublishingDialogs } from '../publishing/PagePublishingDialogs';
import { useGitHubPagePublishing } from '../publishing/useGitHubPagePublishing';

type Workspace = ReturnType<typeof useDraftWorkspace>;
type EditorMode = 'edit' | 'preview';
type MobileSheet = 'blocks' | 'inspector' | null;

function SaveIcon({ state }: { state: DraftSaveState }) {
  if (state === 'saving' || state === 'loading') return <LoaderCircle className="draft-spinner" size={16} />;
  if (state === 'offline') return <HardDrive size={16} />;
  if (state === 'conflict' || state === 'error') return <AlertTriangle size={16} />;
  return <Check size={16} />;
}

function parentIndex(blocks: ContentBlock[], parentId: string | null = null, map = new Map<string, string | null>()) {
  blocks.forEach((block) => {
    map.set(block.id, parentId);
    if (Array.isArray(block.data.blocks)) parentIndex(block.data.blocks, block.id, map);
  });
  return map;
}

function allBlocks(blocks: ContentBlock[]) {
  const output: ContentBlock[] = [];
  const visit = (items: ContentBlock[]) => items.forEach((block) => { output.push(block); if (Array.isArray(block.data.blocks)) visit(block.data.blocks); });
  visit(blocks);
  return output;
}

function containsBlock(block: ContentBlock, id: string): boolean {
  return block.id === id || (block.data.blocks ?? []).some((child) => containsBlock(child, id));
}

export function PageEditor({
  uid,
  email,
  onNavigate,
  onSignOut,
  workspace,
  draft,
}: {
  uid: string;
  email: string | null;
  onNavigate: (route: AppRoute) => void;
  onSignOut: () => void;
  workspace: Workspace;
  draft: PageDraft;
}) {
  const [mode, setMode] = useState<EditorMode>('edit');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(draft.layout.blocks[0]?.id ?? null);
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [localImageUrls, setLocalImageUrls] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [discardPublishedArmed, setDiscardPublishedArmed] = useState(false);
  const updatePageDraft = useCallback((update: (value: PageDraft) => PageDraft) => {
    workspace.updateDraft((current: AnyDraft) => isPageDraft(current) ? update(current) : current);
  }, [workspace]);
  const publishing = useGitHubPagePublishing({
    draft,
    drafts: workspace.drafts,
    uid,
    deviceId: workspace.deviceId,
    flush: workspace.flush,
    markPublished: workspace.markPagePublished,
    markPublishedDeleted: workspace.markPagePublishedDeleted,
    openPublishedPage: workspace.openPublishedPage,
  });
  const viewport = workspace.previewBreakpoint;
  const blocks = useMemo(() => allBlocks(draft.layout.blocks), [draft.layout.blocks]);
  const selectedBlock = useMemo(() => selectedBlockId ? findPageBlock(draft.layout.blocks, selectedBlockId) : null, [draft.layout.blocks, selectedBlockId]);
  const parents = useMemo(() => parentIndex(draft.layout.blocks), [draft.layout.blocks]);

  useEffect(() => {
    if (!selectedBlock) setSelectedBlockId(draft.layout.blocks[0]?.id ?? null);
  }, [draft.layout.blocks, selectedBlock]);
  useEffect(() => { setDiscardPublishedArmed(false); }, [workspace.publishedPageDraftChoice]);
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    void Promise.all(draft.data.attachments.filter((item) => item.localAttachmentId).map(async (attachment) => {
      const blob = await loadDraftImage(uid, draft.id, attachment.localAttachmentId as string);
      if (!blob || cancelled) return null;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return [attachment.id, url] as const;
    })).then((entries) => {
      if (!cancelled) setLocalImageUrls(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>));
    }).catch(() => { if (!cancelled) setLocalError('Some local page images could not be loaded.'); });
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [draft.data.attachments, draft.id, uid]);

  const moveTargets = useMemo(() => {
    if (!selectedBlock) return [];
    const targets: Array<{ id: string | null; label: string }> = [];
    if (selectedBlock.type === BLOCK_TYPES.SECTION) targets.push({ id: null, label: 'Page root' });
    blocks.forEach((candidate) => {
      if (candidate.id !== selectedBlock.id && !containsBlock(selectedBlock, candidate.id) && canNestBlock(candidate.type, selectedBlock.type)) {
        targets.push({ id: candidate.id, label: `${candidate.type.replace(/-/g, ' ')} · ${candidate.id}` });
      }
    });
    return targets;
  }, [blocks, selectedBlock]);

  function addBlock(type: BlockType) {
    const id = createBlockId(type);
    let parentId: string | null = null;
    if (type !== BLOCK_TYPES.SECTION) {
      const selected = selectedBlock;
      if (selected && canNestBlock(selected.type, type)) parentId = selected.id;
      else if (selected) {
        const selectedParentId = parents.get(selected.id) ?? null;
        const selectedParent = selectedParentId ? findPageBlock(draft.layout.blocks, selectedParentId) : null;
        if (selectedParent && canNestBlock(selectedParent.type, type)) parentId = selectedParent.id;
      }
      if (!parentId) parentId = blocks.find((block) => canNestBlock(block.type, type))?.id ?? null;
      if (!parentId) { setLocalError('Select a section or compatible layout block before adding this block.'); return; }
    }
    updatePageDraft((current) => insertPageBlock(current, parentId, type, Number.MAX_SAFE_INTEGER, { id }));
    setSelectedBlockId(id);
    setMobileSheet(null);
  }

  async function pickImage(file: File) {
    if (!selectedBlock || selectedBlock.type !== BLOCK_TYPES.IMAGE) return;
    setLocalError(null);
    const validation = await validateDraftImage(file);
    if (!validation.valid || !validation.metadata) { setLocalError(validation.errors.join(' ')); return; }
    const attachmentId = selectedBlock.id;
    try {
      await storeDraftImage(uid, draft.id, attachmentId, file);
      updatePageDraft((current) => {
        const existing = current.data.attachments.find((item) => item.id === attachmentId);
        const attachments = current.data.attachments.filter((item) => item.id !== attachmentId);
        attachments.push({ id: attachmentId, fileName: file.name.replace(/[\\/]/g, '-').slice(0, 255) || 'page-image', alt: String(selectedBlock.data.alt ?? current.title), localAttachmentId: attachmentId, sourceDeviceId: workspace.deviceId, repositoryPath: existing?.repositoryPath ?? null, mimeType: validation.metadata?.mimeType as 'image/jpeg' | 'image/png' | 'image/webp', byteSize: validation.metadata?.byteSize ?? null, width: validation.metadata?.width ?? null, height: validation.metadata?.height ?? null });
        const next = { ...current, data: { ...current.data, attachments } };
        return updatePageBlock(next, attachmentId, (block: ContentBlock) => ({ ...block, data: { ...block.data, attachmentId, alt: block.data.alt || current.title } }));
      });
    } catch { setLocalError('The image passed validation, but its local working copy could not be stored.'); }
  }

  async function removeImage() {
    if (!selectedBlock) return;
    const attachment = draft.data.attachments.find((item) => item.id === selectedBlock.id);
    if (attachment?.localAttachmentId) await removeDraftImage(uid, draft.id, attachment.localAttachmentId).catch(() => undefined);
    updatePageDraft((current) => {
      const existing = current.data.attachments.find((item) => item.id === selectedBlock.id);
      const attachments = existing?.repositoryPath ? current.data.attachments.map((item) => item.id === selectedBlock.id ? { ...item, localAttachmentId: null, sourceDeviceId: null } : item) : current.data.attachments.filter((item) => item.id !== selectedBlock.id);
      const next = { ...current, data: { ...current.data, attachments } };
      return updatePageBlock(next, selectedBlock.id, (block: ContentBlock) => ({ ...block, data: { ...block.data, src: existing?.repositoryPath ?? './icon.png', attachmentId: undefined } }));
    });
  }

  const statusMessage = localError ?? publishing.error ?? workspace.errorMessage;
  const viewportOptions = [{ value: 'desktop' as const, label: 'Desktop', Icon: Monitor }, { value: 'tablet' as const, label: 'Tablet', Icon: Tablet }, { value: 'mobile' as const, label: 'Mobile', Icon: Smartphone }];

  return <main className="visual-editor-workspace page-editor-workspace">
    <header className="editor-topbar">
      <div className="editor-brand"><img src={brandIcon} alt="" /><div><strong>Arta Gătitului</strong><span>Page CMS</span></div></div>
      <div className="draft-switcher"><label htmlFor="active-page-draft">Draft</label><div><select id="active-page-draft" value={draft.id} onChange={(event) => void workspace.selectDraft(event.target.value)}>{workspace.drafts.map((record) => <option key={record.draft.id} value={record.draft.id}>{record.draft.contentType === 'page' ? 'Page' : 'Recipe'} · {record.draft.title || 'Untitled'}</option>)}</select><ChevronDown size={15} /></div></div>
      <span className={`draft-save-state draft-save-${workspace.saveState}`}><SaveIcon state={workspace.saveState} />{workspace.saveLabel}</span>
      <div className="editor-topbar-center"><div className="editor-segments"><button type="button" className={mode === 'edit' ? 'active' : undefined} onClick={() => setMode('edit')}><PencilLine size={15} /><span>Edit</span></button><button type="button" className={mode === 'preview' ? 'active' : undefined} onClick={() => setMode('preview')}><Eye size={15} /><span>Preview</span></button></div><div className="editor-segments viewport-segments">{viewportOptions.map(({ value, label, Icon }) => <button key={value} type="button" title={label} className={viewport === value ? 'active' : undefined} onClick={() => workspace.setPreviewBreakpoint(value)}><Icon size={15} /><span>{label}</span></button>)}</div></div>
      <div className="editor-topbar-actions"><button className="new-recipe-button" type="button" onClick={() => setTemplateOpen(true)}><FilePlus2 size={16} /><span>New page</span></button><button className="secondary-command published-recipes-command" type="button" onClick={publishing.openPages}><Layers3 size={16} /><span>Pages</span></button><button className="icon-command" type="button" title="Duplicate draft" onClick={() => void workspace.duplicateDraft(draft.id)}><Copy size={16} /></button><button className="icon-command" type="button" title="Delete draft" onClick={() => workspace.requestDelete(draft)}><Trash2 size={16} /></button><button className="icon-command" type="button" title="Open public View Mode" onClick={() => onNavigate('view')}><Eye size={17} /></button><details className="account-menu"><summary title="Editor account"><Settings2 size={17} /></summary><div><strong>{email ?? 'Approved editor'}</strong><button type="button" onClick={onSignOut}><LogOut size={15} />Sign out</button></div></details><button className={`github-connection-button${publishing.connection?.repositoryVerified ? ' connected' : ''}`} type="button" onClick={publishing.openConnection}><GitFork size={16} /><span>{publishing.connection?.repositoryVerified ? 'GitHub ready' : 'Connect GitHub'}</span></button><button className="publish-button" type="button" disabled={draft.status === 'published' || draft.status === 'publishedDeleted' || !publishing.connection?.repositoryVerified || publishing.busy} onClick={() => void publishing.prepare()}>{publishing.busy ? <LoaderCircle className="draft-spinner" size={16} /> : <UploadCloud size={16} />}<span>{draft.status === 'published' ? 'Published' : draft.sourceLink ? 'Publish update' : 'Publish'}</span></button></div>
    </header>

    {statusMessage && <div className="editor-notice"><AlertTriangle size={16} /><span>{statusMessage}</span><button type="button" title="Dismiss" onClick={() => { setLocalError(null); publishing.setError(null); workspace.dismissError(); }}><X size={15} /></button></div>}

    {draft.status === 'publishedDeleted' ? <section className="editor-empty-state"><ArchiveRestore size={30} /><h1>Published page deleted</h1><p>Create a new unlinked page draft to reuse this content.</p><button className="primary-command" type="button" onClick={() => void workspace.recreateDeletedDraft()}><Plus size={17} />Create as new page</button></section> : mode === 'preview' ? <section className="editor-preview-only"><SharedPagePreview viewport={viewport} draft={draft} localImageUrls={localImageUrls} compact /></section> : <div className="visual-editor-body"><aside className={`visual-side-panel block-library-panel${mobileSheet === 'blocks' ? ' mobile-open' : ''}`}><button className="mobile-sheet-close" type="button" onClick={() => setMobileSheet(null)}><X size={18} /></button><PageBlockLibrary onAdd={addBlock} /></aside><section className="visual-editor-canvas"><VisualPageCanvas draft={draft} viewport={viewport} selectedBlockId={selectedBlockId} localImageUrls={localImageUrls} onSelectBlock={setSelectedBlockId} updateDraft={updatePageDraft} /></section><aside className={`visual-side-panel inspector-panel${mobileSheet === 'inspector' ? ' mobile-open' : ''}`}><button className="mobile-sheet-close" type="button" onClick={() => setMobileSheet(null)}><X size={18} /></button><PageBlockInspector draft={draft} block={selectedBlock} viewport={viewport} moveTargets={moveTargets} updateDraft={updatePageDraft} onMove={(parentId) => { if (selectedBlock) updatePageDraft((current) => movePageBlock(current, selectedBlock.id, parentId, Number.MAX_SAFE_INTEGER)); }} onRemove={() => { if (selectedBlock) updatePageDraft((current) => removePageBlock(current, selectedBlock.id)); }} onPickImage={(file) => void pickImage(file)} onRemoveImage={() => void removeImage()} /></aside><div className="mobile-editor-actions"><button type="button" title="Add block" onClick={() => setMobileSheet('blocks')}><Plus size={21} /></button><button type="button" title="Block properties" onClick={() => setMobileSheet('inspector')}><SlidersHorizontal size={20} /></button></div>{mobileSheet && <button className="mobile-sheet-backdrop" type="button" aria-label="Close panel" onClick={() => setMobileSheet(null)} />}</div>}

    {templateOpen && <div className="draft-dialog-backdrop"><div className="draft-dialog" role="dialog" aria-modal="true" aria-labelledby="new-page-title"><FilePlus2 size={23} /><h2 id="new-page-title">New page</h2><p>Choose a simple starting structure. You can add and rearrange blocks afterward.</p><div className="page-template-options"><button type="button" onClick={() => { setTemplateOpen(false); void workspace.newPageDraft('standard'); }}><FileText size={20} /><strong>Standard Page</strong><span>Title and structured rich text</span></button><button type="button" onClick={() => { setTemplateOpen(false); void workspace.newPageDraft('landing'); }}><Layers3 size={20} /><strong>Landing Page</strong><span>Hero-led composition</span></button></div><div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={() => setTemplateOpen(false)}>Cancel</button></div></div></div>}
    {workspace.deleteCandidate && <div className="draft-dialog-backdrop"><div className="draft-dialog" role="alertdialog" aria-modal="true"><Trash2 size={22} /><h2>Delete this draft?</h2><p>“{workspace.deleteCandidate.title || 'Untitled page'}” will be removed from Firestore and this device. Published GitHub content is not affected.</p><div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={workspace.cancelDelete}>Cancel</button><button className="danger-command" type="button" onClick={() => void workspace.confirmDelete()}><Trash2 size={16} />Delete draft</button></div></div></div>}
    {workspace.conflict && <div className="draft-dialog-backdrop"><div className="draft-dialog" role="alertdialog" aria-modal="true"><RefreshCw size={22} /><h2>This draft changed on another device</h2><p>Your local edits remain in the recovery copy.</p><div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={workspace.useCloudVersion}>Use cloud version</button><button className="primary-command" type="button" onClick={workspace.saveConflictAsCopy}><Copy size={16} />Save mine as copy</button></div></div></div>}
    {workspace.publishedPageDraftChoice && <div className="draft-dialog-backdrop"><div className="draft-dialog" role="alertdialog" aria-modal="true"><FileText size={22} /><h2>An edit draft already exists</h2><p>Continue the Firestore draft for “{workspace.publishedPageDraftChoice.published.title}”, or discard it and reload GitHub.</p>{discardPublishedArmed && <div className="publish-error"><AlertTriangle size={16} />Click discard again to confirm.</div>}<div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={workspace.cancelPublishedPageDraftChoice}>Cancel</button><button className="secondary-command" type="button" onClick={workspace.continuePublishedPageDraft}>Continue draft</button><button className="danger-command" type="button" onClick={() => { if (!discardPublishedArmed) setDiscardPublishedArmed(true); else void workspace.discardPublishedPageDraft().catch((error: unknown) => setLocalError(error instanceof Error ? error.message : 'The draft could not be discarded.')); }}><Trash2 size={16} />{discardPublishedArmed ? 'Confirm discard' : 'Discard draft'}</button></div></div></div>}
    <PagePublishingDialogs publishing={publishing} />
  </main>;
}
