export type DeploymentStatus = 'committed' | 'building' | 'deployed' | 'unknown';

export const PUBLIC_SITE_URL: string;
export const GITHUB_ACTIONS_URL: string;
export function publishedRecipeUrl(slug: string): string;
export function deploymentStatusForHttp(status: number): Exclude<DeploymentStatus, 'committed'>;
export function deploymentStatusForResponse(
  response: Pick<Response, 'status' | 'text'>,
  commitSha?: string,
): Promise<Exclude<DeploymentStatus, 'committed'>>;
export function pollRecipeDeployment(options: {
  slug: string;
  commitSha?: string;
  fetcher?: typeof fetch;
  waitFor?: (milliseconds: number) => Promise<unknown>;
  attempts?: number;
  intervalMs?: number;
  shouldContinue?: () => boolean;
  onStatus?: (status: Exclude<DeploymentStatus, 'committed'>) => void;
}): Promise<Exclude<DeploymentStatus, 'committed'>>;
