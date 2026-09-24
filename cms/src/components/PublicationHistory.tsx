import { useMemo, useState } from 'react';
import {
  ArchiveRestore,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileClock,
  History,
  LoaderCircle,
  X,
} from 'lucide-react';
import { draftToPageSource, draftToRecipeSource, isPageDraft, isRecipeDraft } from '../drafts/draftModel.mjs';
import type { useDraftWorkspace } from '../drafts/useDraftWorkspace';
import {
  getCmsHistoryDetails,
  listCmsHistory,
  loadSiteConfiguration,
  loadHistoryContent,
  openGitHubActionsPage,
  prepareContentRestore,
  publishRecipe,
  type CmsHistoryDetails,
  type CmsHistoryEntry,
  type HistoricalContent,
  type PublishResult,
  type PublishReview,
} from '../publishing/githubClient';
import { pagePublicationMetadataFromResult, publicationMetadataFromResult } from '../publishing/publicationModel.mjs';
import { siteBaselinesFromSnapshot, siteBundleFromSnapshot } from '../publishing/sitePublicationModel';
import { semanticHistoryDiff } from '../history/historyModel.mjs';

type Workspace = ReturnType<typeof useDraftWorkspace>;
type Filter = 'all' | 'recipe' | 'page' | 'homepage' | 'template' | 'navigation' | 'theme' | 'site';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'recipe', label: 'Recipes' }, { id: 'page', label: 'Pages' },
  { id: 'homepage', label: 'Homepage' }, { id: 'template', label: 'Templates' },
  { id: 'navigation', label: 'Navigation' }, { id: 'theme', label: 'Theme' }, { id: 'site', label: 'Other site' },
];

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error || 'History could not be loaded.');
}

function parseJson(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function restorable(path: string) {
  return /^src\/content\/(recipes|pages)\/[a-z0-9-]+\.json$/.test(path)
    || ['src/content/site/templates.json', 'src/content/site/global-blocks.json', 'src/content/site/navigation.json', 'src/content/site/settings.json', 'src/content/site/theme.json', 'src/content/categories.json', 'src/data/tag-groups.json'].includes(path);
}

export function PublicationHistory({ workspace }: { workspace: Workspace }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<CmsHistoryEntry[]>([]);
  const [details, setDetails] = useState<CmsHistoryDetails | null>(null);
  const [content, setContent] = useState<HistoricalContent | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [review, setReview] = useState<PublishReview | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);

  const visibleEntries = useMemo(() => entries.filter((entry) => filter === 'all' || entry.contentType === filter || (filter === 'site' && !['recipe', 'page', 'homepage', 'template', 'navigation', 'theme'].includes(entry.contentType))), [entries, filter]);
  const historicalChanges = useMemo(() => content
    ? semanticHistoryDiff(parseJson(content.currentSourceJson), parseJson(content.sourceJson))
    : [], [content]);
  const draftChanges = useMemo(() => {
    if (!content || !workspace.activeDraft || !content.currentSourceJson) return [];
    try {
      if (isRecipeDraft(workspace.activeDraft) && content.path === `src/content/recipes/${workspace.activeDraft.slug}.json`) {
        return semanticHistoryDiff(parseJson(content.currentSourceJson), draftToRecipeSource(workspace.activeDraft));
      }
      if (isPageDraft(workspace.activeDraft) && content.path === `src/content/pages/${workspace.activeDraft.slug}.json`) {
        return semanticHistoryDiff(parseJson(content.currentSourceJson), draftToPageSource(workspace.activeDraft));
      }
    } catch { return []; }
    return [];
  }, [content, workspace.activeDraft]);

  async function show() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try { setEntries(await listCmsHistory()); } catch (historyError) { setError(errorMessage(historyError)); } finally { setLoading(false); }
  }

  async function selectEntry(entry: CmsHistoryEntry) {
    setLoading(true);
    setError(null);
    setContent(null);
    setReview(null);
    setConfirmation('');
    try { setDetails(await getCmsHistoryDetails(entry.commitSha)); } catch (detailError) { setError(errorMessage(detailError)); } finally { setLoading(false); }
  }

  async function selectFile(path: string) {
    if (!details || !restorable(path)) return;
    setLoading(true);
    setError(null);
    setReview(null);
    setConfirmation('');
    try { setContent(await loadHistoryContent(details.entry.commitSha, path)); } catch (contentError) { setError(errorMessage(contentError)); } finally { setLoading(false); }
  }

  async function prepareRestore() {
    if (!content || confirmation !== 'RESTORE') return;
    setLoading(true);
    setError(null);
    try {
      const draft = await workspace.createRestorationDraft(content);
      setReview(await prepareContentRestore({
        commitSha: content.commitSha,
        path: content.path,
        sourceDraftId: draft.id,
        sourceJson: content.sourceJson,
        confirmation: 'RESTORE',
      }));
    } catch (restoreError) { setError(errorMessage(restoreError)); } finally { setLoading(false); }
  }

  async function confirmRestore() {
    if (!review) return;
    setLoading(true);
    setError(null);
    try {
      const published = await publishRecipe(review.planId);
      await workspace.recordPublicationAudit({
        operation: 'restore',
        contentType: content?.contentType ?? 'site',
        contentId: published.recipeSlug,
        draftId: published.sourceDraftId,
        previousCommitSha: review.baseCommitSha,
        newCommitSha: published.commitSha,
        deploymentStatus: 'building',
      }).catch(() => undefined);
      if (content?.contentType === 'recipe') await workspace.markPublished(publicationMetadataFromResult(published));
      if (content?.contentType === 'page') await workspace.markPagePublished(pagePublicationMetadataFromResult(published));
      if (content?.contentType === 'site') {
        const snapshot = await loadSiteConfiguration();
        workspace.updateDraft((current) => current.contentType !== 'site' ? current : {
          ...current,
          status: 'published',
          data: {
            ...current.data,
            site: siteBundleFromSnapshot(snapshot),
            sources: siteBaselinesFromSnapshot(snapshot),
          },
          publishedCommitSha: published.commitSha,
          publishedRepository: published.repository,
          publishedBranch: published.branch,
          publishedSourceDraftId: published.sourceDraftId,
          publishedSlug: 'site-management',
          publishedAt: published.publishedAt,
        });
        if (await workspace.flush() !== 'saved') {
          throw new Error('The restoration commit succeeded, but its site draft metadata is still only in local recovery.');
        }
      }
      setResult(published);
      setReview(null);
      setEntries(await listCmsHistory());
    } catch (restoreError) { setError(errorMessage(restoreError)); } finally { setLoading(false); }
  }

  return <>
    <button className="icon-command" type="button" title="Publication history" aria-label="Publication history" onClick={() => void show()}><History size={17} /></button>
    {open && <div className="draft-dialog-backdrop"><div className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <header><div><FileClock size={22} /><div><h2 id="history-title">Publication history</h2><span>GitHub commits on main are authoritative</span></div></div><button className="dialog-close" type="button" title="Close" onClick={() => setOpen(false)}><X size={17} /></button></header>
      <div className="history-filters">{FILTERS.map((item) => <button key={item.id} className={filter === item.id ? 'active' : ''} type="button" onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
      <div className="history-layout">
        <aside className="history-list">{loading && !entries.length && <LoaderCircle className="draft-spinner" size={20} />}{visibleEntries.map((entry) => <button type="button" className={details?.entry.commitSha === entry.commitSha ? 'active' : ''} key={entry.commitSha} onClick={() => void selectEntry(entry)}><span>{entry.action} · {entry.contentType}</span><strong>{entry.message}</strong><small>{entry.authoredAt ? new Date(entry.authoredAt).toLocaleString() : entry.commitSha.slice(0, 12)}</small><ChevronRight size={15} /></button>)}</aside>
        <section className="history-detail">
          {!details && !loading && <div className="history-placeholder"><FileClock size={24} /><p>Select a CMS publication commit to inspect its files and restore supported content.</p></div>}
          {details && <><div className="history-entry-heading"><div><span>{details.entry.author} · {details.entry.authoredAt ? new Date(details.entry.authoredAt).toLocaleString() : 'Unknown date'}</span><h3>{details.entry.message}</h3><code>{details.entry.commitSha}</code></div></div><div className="history-files">{details.files.map((file) => <button type="button" disabled={!restorable(file.path)} key={file.path} onClick={() => void selectFile(file.path)}><span className={`file-operation file-operation-${file.operation === 'removed' ? 'delete' : file.operation === 'added' ? 'add' : 'modify'}`}>{file.operation}</span><code>{file.path}</code><small>+{file.additions} -{file.deletions}</small></button>)}</div></>}
          {content && <div className="history-compare"><h3>Structured comparison</h3><p>{content.currentSourceJson ? 'Selected version compared with current published content.' : 'This content is currently deleted and can be restored as a new commit.'}</p>{historicalChanges.length ? <ul>{historicalChanges.slice(0, 30).map((change) => <li key={change.path}><strong>{change.label}</strong><span>{change.before}</span><ChevronRight size={13} /><span>{change.after}</span></li>)}</ul> : <p>No semantic differences were found.</p>}{draftChanges.length > 0 && <><h4>Active draft vs published</h4><ul>{draftChanges.slice(0, 12).map((change) => <li key={`draft-${change.path}`}><strong>{change.label}</strong><span>{change.before}</span><ChevronRight size={13} /><span>{change.after}</span></li>)}</ul></>}{content.assetStatus.length > 0 && <div className="history-assets"><strong>Assets</strong>{content.assetStatus.map((status) => <span key={status}><Check size={13} />{status}</span>)}</div>}<label className="typed-confirmation"><span>Type RESTORE to create a restoration draft and review a new commit</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="secondary-command" type="button" disabled={confirmation !== 'RESTORE' || loading} onClick={() => void prepareRestore()}><ArchiveRestore size={16} />Prepare restoration</button></div>}
          {review && <div className="history-restore-review"><h3>Review restoration commit</h3><dl className="publish-summary"><div><dt>Repository</dt><dd>{review.repository}</dd></div><div><dt>Branch</dt><dd>{review.branch}</dd></div><div><dt>Previous commit</dt><dd><code>{review.baseCommitSha.slice(0, 12)}</code></dd></div></dl><ul>{review.fileChanges.map((file) => <li key={file.path}><strong>{file.operation}</strong><code>{file.path}</code></li>)}</ul><p>This creates a new commit. It never resets or force-updates Git history.</p><button className="primary-command" type="button" disabled={loading} onClick={() => void confirmRestore()}>{loading ? <LoaderCircle className="draft-spinner" size={16} /> : <ArchiveRestore size={16} />}Publish restoration</button></div>}
          {result && <div className="history-result"><Check size={24} /><h3>Restoration committed</h3><p>Commit <code>{result.commitSha.slice(0, 12)}</code> is now building. A successful source commit is not shown as Live until deployment verification succeeds.</p><button className="secondary-command" type="button" onClick={() => void openGitHubActionsPage()}><ExternalLink size={16} />GitHub Actions</button></div>}
          {error && <div className="publish-error"><CircleAlert size={16} /><span>{error}</span></div>}
        </section>
      </div>
    </div></div>}
  </>;
}
