import { useState } from 'react';
import { Check, CircleAlert, Copy, ExternalLink, GitFork, LoaderCircle, LogOut, X } from 'lucide-react';
import type { DeviceFlowStart, GitHubConnectionStatus } from './githubClient';

interface ConnectionController {
  connection: GitHubConnectionStatus | null;
  connectionOpen: boolean;
  connecting: boolean;
  deviceFlow: DeviceFlowStart | null;
  waitingLabel: string;
  error: string | null;
  startConnection: () => Promise<void>;
  closeConnection: () => void;
  openDevicePage: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function GitHubConnectionDialog({ publishing }: { publishing: ConnectionController }) {
  if (!publishing.connectionOpen) return null;
  return <ConnectionDialog publishing={publishing} />;
}

function ConnectionDialog({ publishing }: { publishing: ConnectionController }) {
  const [opening, setOpening] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const { connection, deviceFlow } = publishing;

  async function openBrowser() {
    if (opening) return;
    setOpening(true);
    setActionError('');
    try {
      await publishing.openDevicePage();
      setNotice('GitHub opened in your browser. Return here after authorizing the app.');
    } catch (error) {
      setActionError(typeof error === 'string' ? error : 'Could not open the browser. Try Open GitHub again.');
    } finally { setOpening(false); }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(deviceFlow!.userCode);
      setCopied(true);
    } catch {
      setNotice('Select the code above to copy it, then open GitHub.');
    }
  }

  async function disconnect() {
    try { await publishing.disconnect(); } catch (error) {
      setActionError(typeof error === 'string' ? error : 'Could not disconnect GitHub. Please try again.');
    }
  }

  return <div className="draft-dialog-backdrop" role="presentation">
    <div className="draft-dialog github-dialog" role="dialog" aria-modal="true" aria-labelledby="github-connection-title" aria-busy={publishing.connecting}>
      <button className="dialog-close" type="button" aria-label="Close GitHub connection" title="Close" onClick={publishing.closeConnection}><X size={20} /></button>
      <GitFork aria-hidden="true" size={24} />
      <h2 id="github-connection-title">GitHub publishing</h2>
      {connection?.repositoryVerified ? <>
        <div className="github-verified" role="status"><Check size={18} />Connected and verified</div>
        <dl className="publish-summary"><div><dt>Repository</dt><dd>{connection.repository}</dd></div><div><dt>Branch</dt><dd>{connection.branch}</dd></div></dl>
        <button className="secondary-command" type="button" onClick={() => void disconnect()}><LogOut size={18} />Disconnect GitHub</button>
      </> : deviceFlow ? <>
        <p>Copy this code, open GitHub, and return here after approving access.</p>
        <div className="github-device-code"><label htmlFor="github-device-code">Authorization code</label><input id="github-device-code" readOnly value={deviceFlow.userCode} onFocus={(event) => event.currentTarget.select()} /></div>
        {Number.isFinite(Date.parse(deviceFlow.expiresAt)) && <p>Code valid until <time dateTime={deviceFlow.expiresAt}>{new Date(deviceFlow.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>.</p>}
        <div className="draft-dialog-actions">
          <button className="secondary-command" type="button" onClick={() => void copyCode()}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? 'Code copied' : 'Copy code'}</button>
          <button className="primary-command" type="button" disabled={opening} onClick={() => void openBrowser()}>{opening ? <LoaderCircle className="draft-spinner" size={18} /> : <ExternalLink size={18} />}{opening ? 'Opening GitHub...' : 'Open GitHub'}</button>
        </div>
        <div className="github-waiting" role="status"><LoaderCircle className="draft-spinner" size={18} /><span>{publishing.waitingLabel}</span></div>
      </> : <>
        <p>{connection?.message ?? 'Checking GitHub connection...'}</p>
        {connection?.available && connection.configured && !connection.connected ? <button className="primary-command github-open-button" type="button" disabled={publishing.connecting} onClick={() => void publishing.startConnection()}>
          {publishing.connecting ? <LoaderCircle className="draft-spinner" size={18} /> : <GitFork size={18} />}{publishing.connecting ? 'Requesting authorization code...' : 'Connect GitHub'}
        </button> : <button className="secondary-command" type="button" onClick={() => void publishing.refreshConnection()}>Check connection again</button>}
        {connection?.connected && <button className="secondary-command" type="button" onClick={() => void disconnect()}>Clear local authorization</button>}
      </>}
      {notice && <p role="status">{notice}</p>}
      {(actionError || publishing.error) && <div className="publish-error" role="alert"><CircleAlert size={18} /><span>{actionError || publishing.error}</span></div>}
    </div>
  </div>;
}
