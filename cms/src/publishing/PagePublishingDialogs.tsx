import { GitHubConnectionDialog } from './GitHubConnectionDialog';
import { useMemo, useState } from 'react';
import {
  Check,
  CircleAlert,
  ExternalLink,
  FileText,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { GitHubPagePublishingController } from './useGitHubPagePublishing';

function Close({ onClick }: { onClick: () => void }) {
  return <button className="dialog-close" type="button" title="Close" aria-label="Close" onClick={onClick}><X size={17} /></button>;
}

export function PagePublishingDialogs({ publishing }: { publishing: GitHubPagePublishingController }) {
  const [query, setQuery] = useState('');
  const pages = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? publishing.publishedPages.filter((page) => `${page.title} ${page.slug} ${page.pageType}`.toLocaleLowerCase().includes(normalized)) : publishing.publishedPages;
  }, [publishing.publishedPages, query]);
  const blockingDependencies = publishing.deleteRequest?.analysis.dependencies.filter((item) => !item.autoRemovable) ?? [];
  const deleting = publishing.review?.operation === 'delete';

  return <>
    {publishing.pagesOpen && <div className="draft-dialog-backdrop"><div className="draft-dialog published-recipes-dialog" role="dialog" aria-modal="true" aria-labelledby="published-pages-title"><Close onClick={publishing.closePages} /><FileText size={24} /><h2 id="published-pages-title">Pages</h2><div className="published-recipe-tools"><label><Search size={15} /><span className="sr-only">Search pages</span><input type="search" value={query} placeholder="Search title, slug, or type" onChange={(event) => setQuery(event.target.value)} /></label><button className="icon-command" type="button" title="Refresh from GitHub" aria-label="Refresh from GitHub" onClick={() => void publishing.refreshPublishedPages()}><RefreshCw className={publishing.pagesLoading ? 'draft-spinner' : undefined} size={16} /></button></div>{publishing.pagesLoading && pages.length === 0 ? <div className="published-recipes-empty"><LoaderCircle className="draft-spinner" size={20} />Loading pages...</div> : <div className="published-recipe-list">{pages.map((page) => { const state = publishing.pageState(page); return <div className="published-recipe-row" key={page.path}><div><strong>{page.title}</strong><span>{page.pageType} · /{page.slug === 'home' ? '' : `${page.slug}/`}</span></div><span className={`published-state published-state-${state}`}>{state === 'remoteChanged' ? 'Remote changed' : state === 'draft' ? 'Draft' : 'Published'}</span><div className="published-recipe-actions"><button className="secondary-command" type="button" onClick={() => void publishing.editPublished(page)}><PencilLine size={15} />Edit</button><button className="icon-command danger-icon-command" type="button" title={page.pageType === 'home' ? 'Homepage cannot be deleted' : 'Delete page'} aria-label={`Delete ${page.title}`} disabled={page.pageType === 'home'} onClick={() => void publishing.requestDelete(page)}><Trash2 size={16} /></button></div></div>; })}</div>}{pages.length === 0 && !publishing.pagesLoading && <div className="published-recipes-empty">No published pages match this search.</div>}{publishing.error && <div className="publish-error"><CircleAlert size={16} />{publishing.error}</div>}</div></div>}

    <GitHubConnectionDialog publishing={publishing} />

    {publishing.deleteRequest && <div className="draft-dialog-backdrop"><div className="draft-dialog delete-published-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-page-title"><Close onClick={publishing.closeDeleteRequest} /><Trash2 size={24} /><h2 id="delete-page-title">Delete published page</h2><p>This removes <strong>{publishing.deleteRequest.analysis.title}</strong> in one reviewed commit. Homepage is protected.</p><div className="publish-review-section"><strong>Dependencies</strong><ul>{publishing.deleteRequest.analysis.dependencies.length ? publishing.deleteRequest.analysis.dependencies.map((dependency) => <li key={`${dependency.path}-${dependency.reason}`} className={dependency.autoRemovable ? undefined : 'dependency-blocking'}><CircleAlert size={14} /><span><code>{dependency.path}</code> · {dependency.reason}</span></li>) : <li><Check size={14} />No structured references found</li>}</ul></div><label className="typed-confirmation"><span>Type the exact title</span><strong>{publishing.deleteRequest.analysis.title}</strong><input value={publishing.deleteRequest.confirmation} onChange={(event) => publishing.updateDeleteRequest({ confirmation: event.target.value })} /></label>{blockingDependencies.length > 0 && <div className="publish-error"><CircleAlert size={16} />Remove blocking references before deletion.</div>}<div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={publishing.closeDeleteRequest}>Cancel</button><button className="danger-command" type="button" disabled={blockingDependencies.length > 0 || publishing.deleteRequest.confirmation !== publishing.deleteRequest.analysis.title} onClick={() => void publishing.reviewDelete()}><Trash2 size={16} />Review deletion</button></div></div></div>}

    {publishing.review && <div className="draft-dialog-backdrop"><div className="draft-dialog publish-review-dialog" role="dialog" aria-modal="true" aria-labelledby="page-review-title"><Close onClick={publishing.closeReview} />{deleting ? <Trash2 size={24} /> : <UploadCloud size={24} />}<h2 id="page-review-title">{deleting ? 'Review page deletion' : publishing.review.operation === 'update' ? 'Review page update' : 'Publish page'}</h2><dl className="publish-summary"><div><dt>Page</dt><dd>{publishing.review.recipeTitle}</dd></div><div><dt>Repository</dt><dd>{publishing.review.repository}</dd></div><div><dt>Branch</dt><dd>{publishing.review.branch}</dd></div></dl><div className="publish-review-section"><strong>Page changes</strong><ul>{publishing.reviewChanges.map((change) => <li key={`${change.kind}-${change.label}`}><Check size={14} />{change.label}</li>)}</ul></div><div className="publish-review-section"><strong>Repository files</strong><ul>{publishing.review.fileChanges.map((file) => <li key={`${file.operation}-${file.path}`}><span className={`file-operation file-operation-${file.operation}`}>{file.operation === 'add' ? '+' : file.operation === 'delete' ? '−' : '±'}</span><code>{file.path}</code></li>)}</ul></div><div className="publish-review-section"><strong>Validation</strong><ul>{publishing.review.checks.map((check) => <li key={check}><Check size={14} />{check}</li>)}</ul></div><div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={publishing.closeReview}>Cancel</button><button className={deleting ? 'danger-command' : 'primary-command'} type="button" onClick={() => void publishing.confirm()}>{publishing.stage === 'publishing' ? <LoaderCircle className="draft-spinner" size={16} /> : <UploadCloud size={16} />}{deleting ? 'Delete from production' : 'Publish'}</button></div></div></div>}

    {publishing.result && <div className="draft-dialog-backdrop"><div className="draft-dialog publish-success-dialog" role="dialog" aria-modal="true" aria-labelledby="page-published-title"><Close onClick={publishing.closeResult} /><Check size={24} /><h2 id="page-published-title">{publishing.result.operation === 'delete' ? 'Page deletion committed' : 'Page published to GitHub'}</h2><p>The source commit is ready for the website build.</p><dl className="publish-summary"><div><dt>Commit</dt><dd><code>{publishing.result.commitSha.slice(0, 12)}</code></dd></div><div><dt>Deployment</dt><dd>{publishing.deploymentStatus}</dd></div><div><dt>Draft</dt><dd>{publishing.metadataRecorded ? 'Recorded in Firestore' : 'Saved locally, awaiting Firestore'}</dd></div></dl><div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={() => void publishing.openActionsPage()}><ExternalLink size={16} />GitHub Actions</button><button className="primary-command" type="button" onClick={publishing.closeResult}>Done</button></div></div></div>}
  </>;
}
