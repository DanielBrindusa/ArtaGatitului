import { invoke, isTauri } from '@tauri-apps/api/core';

export interface GitHubConnectionStatus {
  available: boolean;
  configured: boolean;
  connected: boolean;
  repositoryVerified: boolean;
  repository: string;
  branch: string;
  tokenExpiresAt: string | null;
  message: string | null;
}

export interface DeviceFlowStart {
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  intervalSeconds: number;
}

export interface DeviceFlowPoll {
  state: 'pending' | 'slowDown' | 'connected' | 'expired' | 'denied';
  retryAfterSeconds: number | null;
  message: string | null;
  connection: GitHubConnectionStatus | null;
}

export interface PublishImageInput {
  bytesBase64: string;
  mimeType: string;
}

export interface PreparePublishInput {
  sourceDraftId: string;
  slug: string;
  title: string;
  recipeJson: string;
  image: PublishImageInput | null;
}

export interface PublishReview {
  planId: string;
  recipeTitle: string;
  recipeSlug: string;
  repository: string;
  branch: string;
  baseCommitSha: string;
  files: string[];
  checks: string[];
}

export interface PublishResult {
  commitSha: string;
  branch: 'main';
  repository: 'DanielBrindusa/ArtaGatitului';
  sourceDraftId: string;
  recipeSlug: string;
  imagePath: string | null;
  publishedAt: string;
  deploymentStatus: 'committed';
}

const browserStatus: GitHubConnectionStatus = {
  available: false,
  configured: false,
  connected: false,
  repositoryVerified: false,
  repository: 'DanielBrindusa/ArtaGatitului',
  branch: 'main',
  tokenExpiresAt: null,
  message: 'GitHub publishing is available only in the installed Windows or Android application.',
};

function requireNativeApp() {
  if (!isTauri()) throw new Error(browserStatus.message ?? 'The native GitHub service is unavailable.');
}

export async function getGitHubConnectionStatus() {
  if (!isTauri()) return browserStatus;
  return invoke<GitHubConnectionStatus>('github_get_connection_status');
}

export async function beginGitHubDeviceFlow() {
  requireNativeApp();
  return invoke<DeviceFlowStart>('github_begin_device_flow');
}

export async function pollGitHubDeviceFlow() {
  requireNativeApp();
  return invoke<DeviceFlowPoll>('github_poll_device_flow');
}

export async function cancelGitHubDeviceFlow() {
  if (!isTauri()) return;
  await invoke('github_cancel_device_flow');
}

export async function openGitHubDevicePage() {
  requireNativeApp();
  await invoke('github_open_device_page');
}

export async function disconnectGitHub() {
  requireNativeApp();
  await invoke('github_disconnect');
}

export async function prepareRecipePublish(input: PreparePublishInput) {
  requireNativeApp();
  return invoke<PublishReview>('github_prepare_recipe_publish', { input });
}

export async function publishRecipe(planId: string) {
  requireNativeApp();
  return invoke<PublishResult>('github_publish_recipe', { planId });
}

export async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return window.btoa(chunks.join(''));
}
