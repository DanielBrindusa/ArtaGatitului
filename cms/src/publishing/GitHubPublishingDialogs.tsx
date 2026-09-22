import {
  Check,
  CircleAlert,
  ExternalLink,
  GitBranch,
  GitFork,
  LoaderCircle,
  LogOut,
  UploadCloud,
  X,
} from 'lucide-react';
import type { GitHubPublishingController } from './useGitHubPublishing';

function DialogClose({ onClick }: { onClick: () => void }) {
  return <button className="dialog-close" type="button" title="Close" aria-label="Close" onClick={onClick}><X aria-hidden="true" size={17} /></button>;
}

export function GitHubPublishingDialogs({ publishing }: { publishing: GitHubPublishingController }) {
  const { connection } = publishing;
  return (
    <>
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

      {publishing.review && (
        <div className="draft-dialog-backdrop" role="presentation">
          <div className="draft-dialog publish-review-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-review-title">
            <DialogClose onClick={publishing.closeReview} />
            <UploadCloud aria-hidden="true" size={24} />
            <h2 id="publish-review-title">Publish recipe</h2>
            <dl className="publish-summary">
              <div><dt>Recipe</dt><dd>{publishing.review.recipeTitle}</dd></div>
              <div><dt>Repository</dt><dd>{publishing.review.repository}</dd></div>
              <div><dt>Branch</dt><dd>{publishing.review.branch}</dd></div>
              <div><dt>Base commit</dt><dd><code>{publishing.review.baseCommitSha.slice(0, 12)}</code></dd></div>
            </dl>
            <div className="publish-review-section"><strong>Files</strong><ul>{publishing.review.files.map((file) => <li key={file}><span>+</span><code>{file}</code></li>)}</ul></div>
            <div className="publish-review-section"><strong>Validation</strong><ul>{publishing.review.checks.map((check) => <li key={check}><Check aria-hidden="true" size={14} /><span>{check}</span></li>)}</ul></div>
            <p>This creates one Git commit. It does not mean the public website has deployed yet.</p>
            <div className="draft-dialog-actions"><button className="secondary-command" type="button" disabled={publishing.busy} onClick={publishing.closeReview}>Cancel</button><button className="primary-command" type="button" disabled={publishing.busy} onClick={() => void publishing.confirm()}>{publishing.stage === 'publishing' ? <LoaderCircle className="draft-spinner" aria-hidden="true" size={16} /> : <UploadCloud aria-hidden="true" size={16} />}Publish</button></div>
          </div>
        </div>
      )}

      {publishing.result && (
        <div className="draft-dialog-backdrop" role="presentation">
          <div className="draft-dialog publish-success-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-success-title">
            <DialogClose onClick={publishing.closeResult} />
            <Check aria-hidden="true" size={24} />
            <h2 id="publish-success-title">Committed to GitHub</h2>
            <p>The recipe was committed successfully. Deployment to the public website is a separate step.</p>
            <dl className="publish-summary">
              <div><dt>Commit</dt><dd><code>{publishing.result.commitSha.slice(0, 12)}</code></dd></div>
              <div><dt>Branch</dt><dd>{publishing.result.branch}</dd></div>
              <div><dt>Draft</dt><dd>{publishing.metadataRecorded ? 'Marked published in Firestore' : 'Publication metadata saved locally and awaiting Firestore sync'}</dd></div>
            </dl>
            <div className="github-verified"><GitBranch aria-hidden="true" size={16} /><span>One commit contains every listed source file.</span></div>
            <div className="draft-dialog-actions"><button className="primary-command" type="button" onClick={publishing.closeResult}>Done</button></div>
          </div>
        </div>
      )}
    </>
  );
}
