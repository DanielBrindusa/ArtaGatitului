import { useCallback, useEffect, useRef, useState } from 'react';
import { SYSTEM_PAGE_ROUTES, validatePageSlug } from '../../../src/shared/index.mjs';
import type { DraftPublicationMetadata, PageDraft } from '../drafts/draftModel.mjs';
import type { PublicationAuditInput } from '../drafts/DraftService';
import { draftToPageSource, isPageDraft, validateDraftForPublish } from '../drafts/draftModel.mjs';
import type { DraftListItem } from '../drafts/useDraftWorkspace';
import { publishedCategories, publishedRecipeCatalog } from '../editor/contentCatalog';
import { validateDraftImage } from '../editor/imageValidation.mjs';
import { loadDraftImage } from '../editor/localImageStore';
import { deploymentStatusLabel, pollPageDeployment, type DeploymentStatus } from './deploymentStatus.mjs';
import {
  analyzePageDelete,
  beginGitHubDeviceFlow,
  blobToBase64,
  cancelGitHubDeviceFlow,
  disconnectGitHub,
  getGitHubConnectionStatus,
  listPublishedPages,
  loadPublishedPage,
  openGitHubActionsPage,
  openGitHubDevicePage,
  pollGitHubDeviceFlow,
  preparePageDelete,
  preparePagePublish,
  publishRecipe,
  type DeviceFlowStart,
  type GitHubConnectionStatus,
  type PageDeleteAnalysis,
  type PublishedPage,
  type PublishedPageSummary,
  type PublishResult,
  type PublishReview,
} from './githubClient';
import { pagePublicationMetadataFromResult } from './publicationModel.mjs';
import {
  draftMatchesPublishedPage,
  pageSourceIdentityFromDraft,
  publishedPageDraftId,
  semanticPageChanges,
} from './publishedPageModel.mjs';

type FlushResult = 'saved' | 'offline' | 'conflict' | 'error';
type Stage = 'idle' | 'validating' | 'preparing' | 'publishing' | 'published';
export type PublishedPageState = 'published' | 'draft' | 'remoteChanged';

interface Options {
  draft: PageDraft;
  drafts: DraftListItem[];
  uid: string;
  deviceId: string;
  flush: () => Promise<FlushResult>;
  markPublished: (metadata: DraftPublicationMetadata) => Promise<PageDraft>;
  markPublishedDeleted: (published: PublishedPage, metadata: DraftPublicationMetadata) => Promise<PageDraft>;
  openPublishedPage: (published: PublishedPage) => Promise<void>;
  recordPublicationAudit: (input: Omit<PublicationAuditInput, 'editorUid'>) => Promise<void>;
  updatePublicationDeployment: (commitSha: string, status: PublicationAuditInput['deploymentStatus']) => Promise<void>;
}

export interface PageDeleteRequest {
  published: PublishedPage;
  analysis: PageDeleteAnalysis;
  confirmation: string;
}

function messageFromError(error: unknown) {
  if (typeof error === 'string') return error;
  return error instanceof Error && error.message ? error.message : 'GitHub page publishing could not complete.';
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export function useGitHubPagePublishing(options: Options) {
  const { draft, drafts, uid, deviceId, flush, markPublished, markPublishedDeleted, openPublishedPage, recordPublicationAudit, updatePublicationDeployment } = options;
  const [connection, setConnection] = useState<GitHubConnectionStatus | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowStart | null>(null);
  const [waitingLabel, setWaitingLabel] = useState('Waiting for authorization...');
  const [pagesOpen, setPagesOpen] = useState(false);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [publishedPages, setPublishedPages] = useState<PublishedPageSummary[]>([]);
  const [deleteRequest, setDeleteRequest] = useState<PageDeleteRequest | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PublishedPage | null>(null);
  const [review, setReview] = useState<PublishReview | null>(null);
  const [reviewChanges, setReviewChanges] = useState<Array<{ kind: string; label: string }>>([]);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [metadataRecorded, setMetadataRecorded] = useState(true);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>('committed');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const pollingGeneration = useRef(0);
  const busy = stage === 'validating' || stage === 'preparing' || stage === 'publishing';

  const refreshConnection = useCallback(async () => {
    try { setConnection(await getGitHubConnectionStatus()); } catch (statusError) { setError(messageFromError(statusError)); }
  }, []);

  const refreshPublishedPages = useCallback(async () => {
    setPagesLoading(true);
    setError(null);
    try { setPublishedPages(await listPublishedPages()); } catch (listError) { setError(messageFromError(listError)); } finally { setPagesLoading(false); }
  }, []);

  useEffect(() => { void refreshConnection(); return () => { pollingGeneration.current += 1; }; }, [refreshConnection]);
  useEffect(() => { setReview(null); setPendingDelete(null); }, [draft.id]);
  useEffect(() => {
    if (!result) return undefined;
    let active = true;
    void pollPageDeployment({ slug: result.recipeSlug, commitSha: result.commitSha, shouldContinue: () => active, onStatus: setDeploymentStatus });
    return () => { active = false; };
  }, [result]);
  useEffect(() => {
    if (!result) return;
    const status = deploymentStatus === 'deployed' ? 'live' : deploymentStatus === 'unknown' ? 'unknown' : deploymentStatus;
    void updatePublicationDeployment(result.commitSha, status).catch(() => undefined);
  }, [deploymentStatus, result, updatePublicationDeployment]);

  const pollUntilComplete = useCallback(async (generation: number, initialDelaySeconds: number) => {
    let waitSeconds = initialDelaySeconds;
    while (pollingGeneration.current === generation) {
      await delay(Math.max(1, waitSeconds) * 1_000);
      if (pollingGeneration.current !== generation) return;
      try {
        const polled = await pollGitHubDeviceFlow();
        if (polled.state === 'pending' || polled.state === 'slowDown') {
          waitSeconds = polled.retryAfterSeconds ?? waitSeconds;
          setWaitingLabel(polled.state === 'slowDown' ? `GitHub asked us to slow down. Checking again in ${waitSeconds} seconds...` : 'Waiting for authorization...');
          continue;
        }
        if (polled.state === 'connected' && polled.connection) {
          setConnection(polled.connection);
          setDeviceFlow(null);
          return;
        }
        setDeviceFlow(null);
        setError(polled.message ?? 'GitHub authorization did not complete.');
        return;
      } catch (pollError) {
        setDeviceFlow(null);
        setError(messageFromError(pollError));
        return;
      }
    }
  }, []);

  const startConnection = useCallback(async () => {
    setConnectionOpen(true);
    setError(null);
    try {
      const flow = await beginGitHubDeviceFlow();
      setDeviceFlow(flow);
      const generation = pollingGeneration.current + 1;
      pollingGeneration.current = generation;
      void pollUntilComplete(generation, flow.intervalSeconds);
    } catch (connectError) { setError(messageFromError(connectError)); }
  }, [pollUntilComplete]);

  const closeConnection = useCallback(() => {
    pollingGeneration.current += 1;
    setDeviceFlow(null);
    setConnectionOpen(false);
    void cancelGitHubDeviceFlow().catch(() => undefined);
  }, []);

  const prepare = useCallback(async () => {
    if (busy) return;
    setError(null);
    setResult(null);
    setStage('validating');
    const readiness = validateDraftForPublish(draft, {
      recipeSlugs: publishedRecipeCatalog.map((recipe) => recipe.slug),
      categorySlugs: publishedCategories.map((category) => category.slug),
    });
    const route = validatePageSlug(draft.slug, {
      pageType: draft.data.page.pageType,
      recipeSlugs: publishedRecipeCatalog.map((recipe) => recipe.slug),
      categorySlugs: publishedCategories.map((category) => category.slug),
      pageSlugs: publishedPages.map((page) => page.slug),
      currentSlug: draft.sourceLink?.slug ?? null,
    });
    const errors = [...readiness.errors, ...route.errors];
    if (errors.length) { setError(errors.join(' ')); setStage('idle'); return; }
    if (!connection?.repositoryVerified) { setConnectionOpen(true); setError(connection?.message ?? 'Connect GitHub before publishing.'); setStage('idle'); return; }
    const changes = semanticPageChanges(draft);
    if (draft.sourceLink && changes.length === 0) { setError('This draft already matches the published page.'); setStage('idle'); return; }
    if (await flush() !== 'saved') { setError('The page draft must finish saving before publication.'); setStage('idle'); return; }
    try {
      const images = [];
      for (const attachment of draft.data.attachments.filter((item) => item.localAttachmentId)) {
        const blob = await loadDraftImage(uid, draft.id, attachment.localAttachmentId as string);
        if (!blob) {
          const location = attachment.sourceDeviceId !== deviceId ? 'another device' : 'this device';
          throw new Error(`The image for block ${attachment.id} was selected on ${location}. Select it again before publishing.`);
        }
        const file = new File([blob], attachment.fileName, { type: attachment.mimeType ?? blob.type });
        const validation = await validateDraftImage(file);
        if (!validation.valid || !validation.metadata) throw new Error(validation.errors.join(' '));
        images.push({ blockId: attachment.id, bytesBase64: await blobToBase64(file), mimeType: validation.metadata.mimeType });
      }
      const source = { ...draftToPageSource(draft), status: 'published' as const };
      setStage('preparing');
      const nextReview = await preparePagePublish({
        sourceDraftId: draft.id,
        slug: draft.slug,
        title: draft.title,
        pageJson: JSON.stringify(source),
        images,
        source: pageSourceIdentityFromDraft(draft),
        occupiedRoutes: [...SYSTEM_PAGE_ROUTES, ...publishedRecipeCatalog.map((recipe) => recipe.slug), ...publishedCategories.map((category) => category.slug)],
      });
      setReviewChanges(changes);
      setReview(nextReview);
    } catch (prepareError) { setError(messageFromError(prepareError)); } finally { setStage('idle'); }
  }, [busy, connection, deviceId, draft, flush, publishedPages, uid]);

  const openPages = useCallback(() => {
    setPagesOpen(true);
    if (connection?.repositoryVerified) void refreshPublishedPages();
  }, [connection?.repositoryVerified, refreshPublishedPages]);

  const editPublished = useCallback(async (summary: PublishedPageSummary) => {
    if (busy) return;
    setStage('preparing');
    setError(null);
    try { await openPublishedPage(await loadPublishedPage(summary.slug)); setPagesOpen(false); } catch (openError) { setError(messageFromError(openError)); } finally { setStage('idle'); }
  }, [busy, openPublishedPage]);

  const requestDelete = useCallback(async (summary: PublishedPageSummary) => {
    if (busy || summary.pageType === 'home') return;
    setStage('preparing');
    setError(null);
    try {
      const published = await loadPublishedPage(summary.slug);
      const analysis = await analyzePageDelete({ path: published.path, slug: published.slug, commitSha: published.commitSha, blobSha: published.blobSha });
      setDeleteRequest({ published, analysis, confirmation: '' });
      setPagesOpen(false);
    } catch (deleteError) { setError(messageFromError(deleteError)); } finally { setStage('idle'); }
  }, [busy]);

  const reviewDelete = useCallback(async () => {
    if (!deleteRequest || busy) return;
    const { published, analysis, confirmation } = deleteRequest;
    if (confirmation !== analysis.title) { setError('Type the exact page title to confirm deletion.'); return; }
    setStage('preparing');
    setError(null);
    try {
      const nextReview = await preparePageDelete({
        sourceDraftId: publishedPageDraftId(published.slug),
        path: analysis.path,
        slug: analysis.slug,
        commitSha: analysis.commitSha,
        blobSha: analysis.blobSha,
        title: analysis.title,
        confirmation,
      });
      setPendingDelete(published);
      setReviewChanges([{ kind: 'delete', label: 'Published page will be deleted' }]);
      setReview(nextReview);
      setDeleteRequest(null);
    } catch (deleteError) { setError(messageFromError(deleteError)); } finally { setStage('idle'); }
  }, [busy, deleteRequest]);

  const confirm = useCallback(async () => {
    if (!review || busy) return;
    setStage('publishing');
    setError(null);
    try {
      const published = await publishRecipe(review.planId);
      const metadata = pagePublicationMetadataFromResult(published);
      await recordPublicationAudit({
        operation: published.operation,
        contentType: 'page',
        contentId: published.recipeSlug,
        draftId: published.sourceDraftId,
        previousCommitSha: review.baseCommitSha,
        newCommitSha: published.commitSha,
        deploymentStatus: 'building',
      }).catch(() => undefined);
      setResult(published);
      setReview(null);
      setDeploymentStatus('building');
      try {
        if (published.operation === 'delete') {
          if (!pendingDelete) throw new Error('The deleted page recovery source is unavailable.');
          await markPublishedDeleted(pendingDelete, metadata);
        } else await markPublished(metadata);
        setMetadataRecorded(true);
      } catch { setMetadataRecorded(false); }
      setPendingDelete(null);
      setStage('published');
      void refreshPublishedPages();
    } catch (publishError) {
      setError(messageFromError(publishError));
      setReview(null);
      setPendingDelete(null);
      setStage('idle');
    }
  }, [busy, markPublished, markPublishedDeleted, pendingDelete, recordPublicationAudit, refreshPublishedPages, review]);

  const pageState = useCallback((summary: PublishedPageSummary): PublishedPageState => {
    const record = drafts.find(({ draft: candidate }) => isPageDraft(candidate) && draftMatchesPublishedPage(candidate, summary));
    if (!record || !isPageDraft(record.draft)) return 'published';
    if (record.draft.sourceLink && record.draft.sourceLink.blobSha !== summary.blobSha) return 'remoteChanged';
    return record.draft.status === 'published' ? 'published' : 'draft';
  }, [drafts]);

  return {
    connection, connectionOpen, deviceFlow, waitingLabel, pagesOpen, pagesLoading, publishedPages,
    deleteRequest, review, reviewChanges, result, metadataRecorded, deploymentStatus: deploymentStatusLabel(deploymentStatus), stage, busy, error,
    setError,
    openConnection: () => setConnectionOpen(true),
    startConnection,
    closeConnection,
    openDevicePage: openGitHubDevicePage,
    openActionsPage: openGitHubActionsPage,
    disconnect: async () => { await disconnectGitHub(); await refreshConnection(); },
    openPages,
    closePages: () => setPagesOpen(false),
    refreshPublishedPages,
    editPublished,
    requestDelete,
    updateDeleteRequest: (changes: Partial<Pick<PageDeleteRequest, 'confirmation'>>) => setDeleteRequest((current) => current ? { ...current, ...changes } : null),
    closeDeleteRequest: () => setDeleteRequest(null),
    reviewDelete,
    pageState,
    prepare,
    confirm,
    closeReview: () => { if (!busy) setReview(null); },
    closeResult: () => { setResult(null); setDeploymentStatus('committed'); setStage('idle'); },
  };
}

export type GitHubPagePublishingController = ReturnType<typeof useGitHubPagePublishing>;
