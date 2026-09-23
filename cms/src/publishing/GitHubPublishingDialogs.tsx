import { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CircleAlert,
  ExternalLink,
  GitBranch,
  GitFork,
  LoaderCircle,
  LogOut,
  PencilLine,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { GitHubPublishingController } from './useGitHubPublishing';

function DialogClose({ onClick }: { onClick: () => void }) {
  return <button className="dialog-close" type="button" title="Close" aria-label="Close" onClick={onClick}><X aria-hidden="true" size={17} /></button>;
}

function PublishedRecipesDialog({ publishing }: { publishing: GitHubPublishingController }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return publishing.publishedRecipes;
    return publishing.publishedRecipes.filter((recipe) => (
      `${recipe.title} ${recipe.slug} ${recipe.category}`.toLocaleLowerCase().includes(normalized)
    ));
  }, [publishing.publishedRecipes, query]);

  return (
    <div className="draft-dialog-backdrop" role="presentation">
      <div className="draft-dialog published-recipes-dialog" role="dialog" aria-modal="true" aria-labelledby="published-recipes-title">
        <DialogClose onClick={publishing.closeRecipes} />
        <BookOpen aria-hidden="true" size={24} />
        <h2 id="published-recipes-title">Published recipes</h2>
        <div className="published-recipe-tools">
          <label><Search aria-hidden="true" size={15} /><span className="sr-only">Search published recipes</span><input type="search" value={query} placeholder="Search title, slug, or category" onChange={(event) => setQuery(event.target.value)} /></label>
          <button className="icon-command" type="button" title="Refresh from GitHub" aria-label="Refresh from GitHub" disabled={publishing.recipesLoading} onClick={() => void publishing.refreshPublishedRecipes()}><RefreshCw className={publishing.recipesLoading ? 'draft-spinner' : undefined} aria-hidden="true" size={16} /></button>
        </div>
        {!publishing.connection?.repositoryVerified ? (
          <div className="github-setup-note"><CircleAlert aria-hidden="true" size={16} /><span>Connect GitHub before loading production recipes.</span></div>
        ) : publishing.recipesLoading && publishing.publishedRecipes.length === 0 ? (
          <div className="published-recipes-empty"><LoaderCircle className="draft-spinner" aria-hidden="true" size={20} /><span>Loading recipes from GitHub...</span></div>
        ) : filtered.length === 0 ? (
          <div className="published-recipes-empty"><span>No published recipes match this search.</span></div>
        ) : (
          <div className="published-recipe-list">
            {filtered.map((recipe) => {
              const state = publishing.recipeState(recipe);
              return (
                <div className="published-recipe-row" key={recipe.path}>
                  <div><strong>{recipe.title}</strong><span>{recipe.category} · {recipe.slug}</span></div>
                  <span className={`published-state published-state-${state}`}>{state === 'remoteChanged' ? 'Remote changed' : state === 'draft' ? 'Draft' : 'Published'}</span>
                  <div className="published-recipe-actions">
                    <button className="secondary-command" type="button" disabled={publishing.busy} onClick={() => void publishing.editPublished(recipe)}><PencilLine aria-hidden="true" size={15} />Edit</button>
                    <button className="icon-command danger-icon-command" type="button" title="Delete published recipe" aria-label={`Delete ${recipe.title}`} disabled={publishing.busy} onClick={() => void publishing.requestDelete(recipe)}><Trash2 aria-hidden="true" size={16} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {publishing.error && <div className="publish-error" role="alert"><CircleAlert aria-hidden="true" size={16} /><span>{publishing.error}</span></div>}
      </div>
    </div>
  );
}

export function GitHubPublishingDialogs({ publishing }: { publishing: GitHubPublishingController }) {
  const { connection } = publishing;
  const deleting = publishing.review?.operation === 'delete';
  const deploymentCopy = {
    committed: {
      title: publishing.result?.operation === 'delete' ? 'Deleted from GitHub' : 'Published to GitHub',
      message: 'The source commit is ready for the website build.',
      label: 'Committed',
    },
    building: {
      title: publishing.result?.operation === 'delete' ? 'Deletion committed' : 'Published to GitHub',
      message: 'GitHub Actions is validating and rebuilding the website.',
      label: 'Building website...',
    },
    deployed: {
      title: publishing.result?.operation === 'delete' ? 'Recipe removed' : 'Website deployed',
      message: publishing.result?.operation === 'delete'
        ? 'The rebuilt public website no longer includes this recipe.'
        : 'The generated recipe is now available on the public website.',
      label: 'Deployed',
    },
    unknown: {
      title: 'Deployment not confirmed',
      message: 'The commit succeeded, but the website did not expose that build during this check. Inspect the GitHub Actions run before retrying.',
      label: 'Unknown',
    },
  }[publishing.deploymentStatus];
  const blockingDependencies = publishing.deleteRequest?.analysis.dependencies.filter((item) => !item.autoRemovable) ?? [];

  return (
    <>
      {publishing.recipesOpen && <PublishedRecipesDialog publishing={publishing} />}

      {publishing.connectionOpen && (
        <div className="draft-dialog-backdrop" role="presentation">
          <div className="draft-dialog github-dialog" role="dialog" aria-modal="true" aria-labelledby="github-connection-title">
            <DialogClose onClick={publishing.closeConnection} />
            <GitFork aria-hidden="true" size={24} />
            <h2 id="github-connection-title">GitHub publishing</h2>
            {connection?.repositoryVerified ? (
              <>
                <div className="github-verified"><Check aria-hidden="true" size={16} /><span>Connected and verified</span></div>
                <dl className="publish-summary">
                  <div><dt>Repository</dt><dd>{connection.repository}</dd></div>
                  <div><dt>Branch</dt><dd>{connection.branch}</dd></div>
                </dl>
                <p>Disconnecting removes credentials from this device. Revoking authorization or uninstalling the GitHub App is done in GitHub settings.</p>
                <div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={() => void publishing.disconnect()}><LogOut aria-hidden="true" size={16} />Disconnect GitHub</button></div>
              </>
            ) : publishing.deviceFlow ? (
              <>
                <p>Enter this code on GitHub. The authorization page opens in your system browser.</p>
                <div className="github-device-code"><span>Code</span><strong>{publishing.deviceFlow.userCode}</strong></div>
                <button className="primary-command github-open-button" type="button" onClick={() => void publishing.openDevicePage()}><ExternalLink aria-hidden="true" size={16} />Open GitHub</button>
                <div className="github-waiting" role="status"><LoaderCircle className="draft-spinner" aria-hidden="true" size={16} /><span>{publishing.waitingLabel}</span></div>
              </>
            ) : (
              <>
                <p>{connection?.message ?? 'Authorize the repository-scoped GitHub App on this device.'}</p>
                {connection?.available && connection.configured ? (
                  <button className="primary-command github-open-button" type="button" onClick={() => void publishing.startConnection()}><GitFork aria-hidden="true" size={16} />Connect GitHub</button>
                ) : (
                  <div className="github-setup-note"><CircleAlert aria-hidden="true" size={16} /><span>Complete the GitHub App setup in <strong>docs/github-app-setup.md</strong>, then use the installed app.</span></div>
                )}
                {connection?.connected && !connection.repositoryVerified && <button className="secondary-command" type="button" onClick={() => void publishing.disconnect()}>Clear local authorization</button>}
              </>
            )}
            {publishing.error && <div className="publish-error" role="alert"><CircleAlert aria-hidden="true" size={16} /><span>{publishing.error}</span></div>}
          </div>
        </div>
      )}

      {publishing.deleteRequest && (
        <div className="draft-dialog-backdrop" role="presentation">
          <div className="draft-dialog delete-published-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-published-title">
            <DialogClose onClick={publishing.closeDeleteRequest} />
            <Trash2 aria-hidden="true" size={24} />
            <h2 id="delete-published-title">Delete published recipe</h2>
            <p>This removes <strong>{publishing.deleteRequest.analysis.title}</strong> from production in one reviewed commit. Its Firestore edit record becomes a deleted draft and cannot silently republish.</p>
            <div className="publish-review-section"><strong>Dependencies</strong><ul>{publishing.deleteRequest.analysis.dependencies.length === 0 ? <li><Check aria-hidden="true" size={14} /><span>No structured references found</span></li> : publishing.deleteRequest.analysis.dependencies.map((dependency) => <li key={`${dependency.path}-${dependency.reason}`} className={dependency.autoRemovable ? undefined : 'dependency-blocking'}><CircleAlert aria-hidden="true" size={14} /><span><code>{dependency.path}</code> · {dependency.reason}{dependency.autoRemovable ? ' (automatic)' : ' (blocks deletion)'}</span></li>)}</ul></div>
            {publishing.deleteRequest.analysis.imagePath && (
              <label className="delete-image-option"><input type="checkbox" checked={publishing.deleteRequest.deleteUniqueImage} disabled={!publishing.deleteRequest.analysis.imageUnique} onChange={(event) => publishing.updateDeleteRequest({ deleteUniqueImage: event.target.checked })} /><span>{publishing.deleteRequest.analysis.imageUnique ? 'Also delete the uniquely referenced repository image' : 'Repository image is shared or cannot be safely deleted'}</span></label>
            )}
            <label className="typed-confirmation"><span>Type the exact title to continue</span><strong>{publishing.deleteRequest.analysis.title}</strong><input value={publishing.deleteRequest.confirmation} autoComplete="off" onChange={(event) => publishing.updateDeleteRequest({ confirmation: event.target.value })} /></label>
            {blockingDependencies.length > 0 && <div className="publish-error"><CircleAlert aria-hidden="true" size={16} /><span>Remove the blocking references in GitHub before deleting this recipe.</span></div>}
            {publishing.error && <div className="publish-error" role="alert"><CircleAlert aria-hidden="true" size={16} /><span>{publishing.error}</span></div>}
            <div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={publishing.closeDeleteRequest}>Cancel</button><button className="danger-command" type="button" disabled={publishing.busy || blockingDependencies.length > 0 || publishing.deleteRequest.confirmation !== publishing.deleteRequest.analysis.title} onClick={() => void publishing.reviewDelete()}>{publishing.busy ? <LoaderCircle className="draft-spinner" aria-hidden="true" size={16} /> : <Trash2 aria-hidden="true" size={16} />}Review deletion</button></div>
          </div>
        </div>
      )}

      {publishing.review && (
        <div className="draft-dialog-backdrop" role="presentation">
          <div className="draft-dialog publish-review-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-review-title">
            <DialogClose onClick={publishing.closeReview} />
            {deleting ? <Trash2 aria-hidden="true" size={24} /> : <UploadCloud aria-hidden="true" size={24} />}
            <h2 id="publish-review-title">{deleting ? 'Review production deletion' : publishing.review.operation === 'update' ? 'Review recipe update' : 'Publish recipe'}</h2>
            <dl className="publish-summary">
              <div><dt>Recipe</dt><dd>{publishing.review.recipeTitle}</dd></div>
              <div><dt>Repository</dt><dd>{publishing.review.repository}</dd></div>
              <div><dt>Branch</dt><dd>{publishing.review.branch}</dd></div>
              <div><dt>Base commit</dt><dd><code>{publishing.review.baseCommitSha.slice(0, 12)}</code></dd></div>
            </dl>
            <div className="publish-review-section"><strong>Recipe changes</strong><ul>{publishing.reviewChanges.map((change) => <li key={`${change.kind}-${change.label}`}><Check aria-hidden="true" size={14} /><span>{change.label}</span></li>)}</ul></div>
            <div className="publish-review-section"><strong>Repository files</strong><ul>{publishing.review.fileChanges.map((file) => <li key={`${file.operation}-${file.path}`}><span className={`file-operation file-operation-${file.operation}`}>{file.operation === 'add' ? '+' : file.operation === 'delete' ? '−' : '±'}</span><code>{file.path}</code></li>)}</ul></div>
            <div className="publish-review-section"><strong>Validation</strong><ul>{publishing.review.checks.map((check) => <li key={check}><Check aria-hidden="true" size={14} /><span>{check}</span></li>)}</ul></div>
            <p>This creates one Git commit. The public website changes only after the build succeeds.</p>
            <div className="draft-dialog-actions"><button className="secondary-command" type="button" disabled={publishing.busy} onClick={publishing.closeReview}>Cancel</button><button className={deleting ? 'danger-command' : 'primary-command'} type="button" disabled={publishing.busy} onClick={() => void publishing.confirm()}>{publishing.stage === 'publishing' ? <LoaderCircle className="draft-spinner" aria-hidden="true" size={16} /> : deleting ? <Trash2 aria-hidden="true" size={16} /> : <UploadCloud aria-hidden="true" size={16} />}{deleting ? 'Delete from production' : publishing.review.operation === 'update' ? 'Publish update' : 'Publish'}</button></div>
          </div>
        </div>
      )}

      {publishing.result && (
        <div className="draft-dialog-backdrop" role="presentation">
          <div className="draft-dialog publish-success-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-success-title">
            <DialogClose onClick={publishing.closeResult} />
            {publishing.deploymentStatus === 'building' ? <LoaderCircle className="draft-spinner" aria-hidden="true" size={24} /> : publishing.deploymentStatus === 'unknown' ? <CircleAlert aria-hidden="true" size={24} /> : <Check aria-hidden="true" size={24} />}
            <h2 id="publish-success-title">{deploymentCopy.title}</h2>
            <p>{deploymentCopy.message}</p>
            <dl className="publish-summary">
              <div><dt>Commit</dt><dd><code>{publishing.result.commitSha.slice(0, 12)}</code></dd></div>
              <div><dt>Branch</dt><dd>{publishing.result.branch}</dd></div>
              <div><dt>Deployment</dt><dd>{deploymentCopy.label}</dd></div>
              <div><dt>Draft</dt><dd>{publishing.metadataRecorded ? (publishing.result.operation === 'delete' ? 'Marked deleted in Firestore' : 'Marked published in Firestore') : 'Commit recorded locally and awaiting Firestore sync'}</dd></div>
            </dl>
            <div className="github-verified"><GitBranch aria-hidden="true" size={16} /><span>One commit contains every listed source change.</span></div>
            {publishing.error && <div className="publish-error" role="alert"><CircleAlert aria-hidden="true" size={16} /><span>{publishing.error}</span></div>}
            <div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={() => void publishing.openActionsPage()}><ExternalLink aria-hidden="true" size={16} />GitHub Actions</button><button className="primary-command" type="button" onClick={publishing.closeResult}>Done</button></div>
          </div>
        </div>
      )}
    </>
  );
}
