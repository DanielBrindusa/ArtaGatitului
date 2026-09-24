export const PUBLIC_SITE_URL = 'https://danielbrindusa.github.io/ArtaGatitului/';
export const GITHUB_ACTIONS_URL = 'https://github.com/DanielBrindusa/ArtaGatitului/actions';

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function publishedRecipeUrl(slug) {
  if (!SAFE_SLUG.test(slug ?? '')) throw new Error('Published recipe slug is invalid.');
  return new URL(`retete/${slug}/`, PUBLIC_SITE_URL).toString();
}

export function publishedPageUrl(slug) {
  if (!SAFE_SLUG.test(slug ?? '')) throw new Error('Published page slug is invalid.');
  return new URL(slug === 'home' ? '' : `${slug}/`, PUBLIC_SITE_URL).toString();
}

export function deploymentStatusForHttp(status) {
  if (status >= 200 && status < 400) return 'building';
  if (status === 404 || status >= 500) return 'building';
  if (status >= 400) return 'buildFailed';
  return 'unknown';
}

export async function deploymentStatusForResponse(response, commitSha) {
  const status = deploymentStatusForHttp(response.status);
  if (status === 'unknown' || response.status < 200 || response.status >= 400) return status;
  if (!/^[0-9a-f]{40}$/.test(commitSha ?? '')) return 'unknown';
  const html = await response.text();
  const marker = `<meta name="arta-build-version" content="${commitSha}">`;
  return html.includes(marker) ? 'deployed' : 'building';
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function pollRecipeDeployment({
  slug,
  commitSha,
  fetcher = globalThis.fetch,
  waitFor = wait,
  attempts = 36,
  intervalMs = 10_000,
  shouldContinue = () => true,
  onStatus = () => undefined,
}) {
  const url = new URL(slug ? publishedRecipeUrl(slug) : PUBLIC_SITE_URL);
  if (/^[0-9a-f]{40}$/.test(commitSha ?? '')) url.searchParams.set('deployment', commitSha);
  onStatus('building');

  for (let attempt = 0; attempt < attempts && shouldContinue(); attempt += 1) {
    try {
      const response = await fetcher(url.toString(), { cache: 'no-store', redirect: 'follow' });
      const status = await deploymentStatusForResponse(response, commitSha);
      if (status === 'deployed' || status === 'buildFailed' || status === 'unknown') {
        if (shouldContinue()) onStatus(status);
        return status;
      }
    } catch {
      // A transient network failure does not prove the deployment failed.
    }
    if (attempt < attempts - 1 && shouldContinue()) await waitFor(intervalMs);
  }

  if (shouldContinue()) onStatus('buildFailed');
  return 'buildFailed';
}

export function deploymentStatusLabel(status) {
  return ({ committed: 'Committed', building: 'Building', deployed: 'Live', buildFailed: 'Build failed', unknown: 'Status unknown' })[status] ?? 'Status unknown';
}

export async function pollPageDeployment(options) {
  const { slug, ...rest } = options;
  const pageUrl = publishedPageUrl(slug);
  return pollRecipeDeployment({
    ...rest,
    slug: null,
    fetcher: async (probeUrl, init) => {
      const target = new URL(pageUrl);
      const deployment = new URL(probeUrl).searchParams.get('deployment');
      if (deployment) target.searchParams.set('deployment', deployment);
      return (rest.fetcher ?? globalThis.fetch)(target.toString(), init);
    },
  });
}
