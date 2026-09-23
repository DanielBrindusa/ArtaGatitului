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
  imageAction: 'retain' | 'replace' | 'remove';
  source: PublishedSourceIdentity | null;
}

export interface PublishedSourceIdentity {
  path: string;
  slug: string;
  commitSha: string;
  blobSha: string;
}

export interface PublishedRecipeSummary extends PublishedSourceIdentity {
  title: string;
  category: string;
  imagePath: string | null;
}

export interface PublishedRecipe extends PublishedRecipeSummary {
  sourceJson: string;
}

export interface PublishedPageSummary extends PublishedSourceIdentity {
  id: string;
  title: string;
  pageType: 'home' | 'standard' | 'landing';
}

export interface PublishedPage extends PublishedPageSummary {
  sourceJson: string;
}

export interface PublishPageImageInput extends PublishImageInput {
  blockId: string;
}

export interface PreparePagePublishInput {
  sourceDraftId: string;
  slug: string;
  title: string;
  pageJson: string;
  images: PublishPageImageInput[];
  source: PublishedSourceIdentity | null;
  occupiedRoutes: string[];
}

export interface PageDeleteAnalysis extends PublishedSourceIdentity {
  id: string;
  title: string;
  pageType: 'home' | 'standard' | 'landing';
  dependencies: RecipeDependency[];
}

export interface PreparePageDeleteInput extends PublishedSourceIdentity {
  sourceDraftId: string;
  title: string;
  confirmation: string;
}

export interface PublicationFileChange {
  operation: 'add' | 'modify' | 'delete';
  path: string;
}

export interface PublishReview {
  planId: string;
  recipeTitle: string;
  recipeSlug: string;
  repository: string;
  branch: string;
  baseCommitSha: string;
  operation: 'create' | 'update' | 'delete';
  fileChanges: PublicationFileChange[];
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
  operation: 'create' | 'update' | 'delete';
  recipePath: string | null;
  recipeBlobSha: string | null;
  recipeJson: string | null;
}

export interface RecipeDependency {
  path: string;
  reason: string;
  autoRemovable: boolean;
}

export interface DeleteAnalysis extends PublishedSourceIdentity {
  title: string;
  imagePath: string | null;
  imageUnique: boolean;
  dependencies: RecipeDependency[];
}

export interface PrepareDeleteInput extends PublishedSourceIdentity {
  sourceDraftId: string;
  title: string;
  confirmation: string;
  deleteUniqueImage: boolean;
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

export async function openGitHubActionsPage() {
  requireNativeApp();
  await invoke('github_open_actions_page');
}

export async function disconnectGitHub() {
  requireNativeApp();
  await invoke('github_disconnect');
}

export async function prepareRecipePublish(input: PreparePublishInput) {
  requireNativeApp();
  return invoke<PublishReview>('github_prepare_recipe_publish', { input });
}

export async function listPublishedRecipes() {
  requireNativeApp();
  return invoke<PublishedRecipeSummary[]>('github_list_published_recipes');
}

export async function loadPublishedRecipe(slug: string) {
  requireNativeApp();
  return invoke<PublishedRecipe>('github_load_published_recipe', { slug });
}

export async function listPublishedPages() {
  requireNativeApp();
  return invoke<PublishedPageSummary[]>('github_list_published_pages');
}

export async function loadPublishedPage(slug: string) {
  requireNativeApp();
  return invoke<PublishedPage>('github_load_published_page', { slug });
}

export async function preparePagePublish(input: PreparePagePublishInput) {
  requireNativeApp();
  return invoke<PublishReview>('github_prepare_page_publish', { input });
}

export async function analyzePageDelete(source: PublishedSourceIdentity) {
  requireNativeApp();
  return invoke<PageDeleteAnalysis>('github_analyze_page_delete', { source });
}

export async function preparePageDelete(input: PreparePageDeleteInput) {
  requireNativeApp();
  return invoke<PublishReview>('github_prepare_page_delete', { input });
}

export async function analyzeRecipeDelete(source: PublishedSourceIdentity) {
  requireNativeApp();
  return invoke<DeleteAnalysis>('github_analyze_recipe_delete', { source });
}

export async function prepareRecipeDelete(input: PrepareDeleteInput) {
  requireNativeApp();
  return invoke<PublishReview>('github_prepare_recipe_delete', { input });
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
