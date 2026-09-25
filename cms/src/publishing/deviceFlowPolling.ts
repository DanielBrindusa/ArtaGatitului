import type { DeviceFlowPoll, DeviceFlowStart } from './githubClient';
import { AuthorizationRequestTimeoutError } from './withRequestTimeout';

interface PollOptions {
  poll: () => Promise<DeviceFlowPoll>;
  isCurrent: () => boolean;
  onWaiting: (message: string) => void;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  isVisible?: () => boolean;
}

export async function waitForDeviceAuthorization(flow: DeviceFlowStart, options: PollOptions): Promise<DeviceFlowPoll | null> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const isVisible = options.isVisible ?? (() => document.visibilityState !== 'hidden');
  const expiresAt = Date.parse(flow.expiresAt);
  if (!Number.isFinite(expiresAt)) throw new Error('GitHub returned an invalid code expiration. Connect GitHub again.');
  let waitSeconds = Math.max(1, flow.intervalSeconds);

  while (options.isCurrent()) {
    await sleep(Math.min(waitSeconds * 1_000, Math.max(0, expiresAt - now())));
    // Android may suspend networking while the user approves access in their browser.
    while (options.isCurrent() && now() < expiresAt && !isVisible()) await sleep(1_000);
    if (!options.isCurrent()) return null;
    if (now() >= expiresAt) {
      return { state: 'expired', retryAfterSeconds: null, connection: null, message: 'The GitHub code expired. Connect GitHub again for a new code.' };
    }
    let result: DeviceFlowPoll;
    try {
      result = await options.poll();
    } catch (error) {
      if (!options.isCurrent()) return null;
      if (!(error instanceof AuthorizationRequestTimeoutError)) throw error;
      waitSeconds = Math.max(waitSeconds, Math.min(60, waitSeconds * 2));
      options.onWaiting('Connection interrupted. Keeping your code and checking again when you return.');
      continue;
    }
    if (!options.isCurrent()) return null;
    if (result.state !== 'pending' && result.state !== 'slowDown' && result.state !== 'retrying') return result;
    waitSeconds = Math.max(flow.intervalSeconds, result.retryAfterSeconds ?? waitSeconds, 1);
    options.onWaiting(result.message ?? (result.state === 'slowDown'
      ? `GitHub asked us to slow down. Checking again in ${waitSeconds} seconds...`
      : 'Waiting for approval in GitHub. Return here after authorizing the app.'));
  }
  return null;
}
