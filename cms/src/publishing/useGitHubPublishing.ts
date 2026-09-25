import { useCallback, useEffect, useRef, useState } from 'react';
import type { DraftPublicationMetadata, RecipeDraft } from '../drafts/draftModel.mjs';
import type { PublicationAuditInput } from '../drafts/DraftService';
import { isRecipeDraft, validateDraftForPublish } from '../drafts/draftModel.mjs';
import type { DraftListItem } from '../drafts/useDraftWorkspace';
import { validateWebsiteImage } from '../editor/imageValidation.mjs';
import { loadDraftImage } from '../editor/localImageStore';
import {
  analyzeRecipeDelete,
  beginGitHubDeviceFlow,
  blobToBase64,
  cancelGitHubDeviceFlow,
  disconnectGitHub,
  getGitHubConnectionStatus,
  listPublishedRecipes,
  loadPublishedRecipe,
  openGitHubActionsPage,
  openGitHubDevicePage,
  pollGitHubDeviceFlow,
  prepareRecipeDelete,
  prepareRecipePublish,
  publishRecipe,
  type DeleteAnalysis,
  type DeviceFlowStart,
  type GitHubConnectionStatus,
  type PublishedRecipe,
  type PublishedRecipeSummary,
  type PublishResult,
  type PublishReview,
} from './githubClient';
import { pollRecipeDeployment, type DeploymentStatus } from './deploymentStatus.mjs';
import { buildRecipePublicationSource, publicationMetadataFromResult } from './publicationModel.mjs';
import {
  draftMatchesPublishedRecipe,
  imageActionForDraft,
  publishedDraftId,
  semanticRecipeChanges,
  sourceIdentityFromDraft,
  type SemanticChange,
} from './publishedRecipeModel.mjs';

type FlushResult = 'saved' | 'offline' | 'conflict' | 'error';
export type PublishingStage = 'idle' | 'validating' | 'preparing' | 'publishing' | 'published';
export type PublishedRecipeState = 'published' | 'draft' | 'remoteChanged';

interface Options {
  draft: RecipeDraft | null;
  drafts: DraftListItem[];
  uid: string;
  deviceId: string;
  flush: () => Promise<FlushResult>;
  markPublished: (metadata: DraftPublicationMetadata) => Promise<RecipeDraft>;
  markPublishedDeleted: (published: PublishedRecipe, metadata: DraftPublicationMetadata) => Promise<RecipeDraft>;
  openPublishedRecipe: (published: PublishedRecipe) => Promise<void>;
  recordPublicationAudit: (input: Omit<PublicationAuditInput, 'editorUid'>) => Promise<void>;
  updatePublicationDeployment: (commitSha: string, status: PublicationAuditInput['deploymentStatus']) => Promise<void>;
}

export interface DeleteRequest {
  published: PublishedRecipe;
  analysis: DeleteAnalysis;
  confirmation: string;
  deleteUniqueImage: boolean;
}

function messageFromError(error: unknown) {
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  return 'GitHub publishing could not complete.';
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export function useGitHubPublishing({
  draft,
  drafts,
  uid,
  deviceId,
  flush,
  markPublished,
  markPublishedDeleted,
  openPublishedRecipe,
  recordPublicationAudit,
  updatePublicationDeployment,
}: Options) {
  const [connection, setConnection] = useState<GitHubConnectionStatus | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const connectionStarting = useRef(false);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowStart | null>(null);
  const [waitingLabel, setWaitingLabel] = useState('Waiting for authorization...');
  const [review, setReview] = useState<PublishReview | null>(null);
  const [reviewChanges, setReviewChanges] = useState<SemanticChange[]>([]);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [metadataRecorded, setMetadataRecorded] = useState(true);
  const [stage, setStage] = useState<PublishingStage>('idle');
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>('committed');
  const [error, setError] = useState<string | null>(null);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [publishedRecipes, setPublishedRecipes] = useState<PublishedRecipeSummary[]>([]);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PublishedRecipe | null>(null);
  const pollingGeneration = useRef(0);
  const busy = stage === 'validating' || stage === 'preparing' || stage === 'publishing';

  const refreshConnection = useCallback(async () => {
    try {
      setConnection(await getGitHubConnectionStatus());
    } catch (statusError) {
      setConnection(null);
      setError(messageFromError(statusError));
    }
  }, []);

  const refreshPublishedRecipes = useCallback(async () => {
    setRecipesLoading(true);
    setError(null);
    try {
      setPublishedRecipes(await listPublishedRecipes());
    } catch (listError) {
      setError(messageFromError(listError));
    } finally {
      setRecipesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshConnection();
    return () => {
      pollingGeneration.current += 1;
    };
  }, [refreshConnection]);

  useEffect(() => {
    setReview(null);
    setReviewChanges([]);
    setPendingDelete(null);
  }, [draft?.id]);

  useEffect(() => {
    if (!result) return undefined;
    let active = true;
    void pollRecipeDeployment({
      slug: result.operation === 'delete' ? null : result.recipeSlug,
      commitSha: result.commitSha,
      shouldContinue: () => active,
      onStatus: (status) => setDeploymentStatus(status),
    });
    return () => {
      active = false;
    };
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
        if (pollingGeneration.current !== generation) return;
        if (polled.state === 'pending' || polled.state === 'slowDown') {
          waitSeconds = polled.retryAfterSeconds ?? waitSeconds;
          setWaitingLabel(polled.state === 'slowDown'
            ? `GitHub asked us to slow down. Checking again in ${waitSeconds} seconds...`
            : 'Waiting for authorization...');
          continue;
        }
        if (polled.state === 'connected' && polled.connection) {
          setConnection(polled.connection);
          setDeviceFlow(null);
          setWaitingLabel('Authorization complete.');
          return;
        }
        setDeviceFlow(null);
        setError(polled.message ?? 'GitHub authorization did not complete.');
        return;
      } catch (pollError) {
        if (pollingGeneration.current !== generation) return;
        setDeviceFlow(null);
        setError(messageFromError(pollError));
        return;
      }
    }
  }, []);

  const startConnection = useCallback(async () => {
    if (connectionStarting.current) return;
    connectionStarting.current = true;
    setConnecting(true);
    const generation = ++pollingGeneration.current;
    setConnectionOpen(true);
    setError(null);
    setWaitingLabel('Waiting for authorization...');
    try {
      const flow = await beginGitHubDeviceFlow();
      if (pollingGeneration.current !== generation) return;
      setDeviceFlow(flow);
      void pollUntilComplete(generation, flow.intervalSeconds);
    } catch (connectError) {
      if (pollingGeneration.current === generation) setError(messageFromError(connectError));
    } finally {
      connectionStarting.current = false;
      setConnecting(false);
    }
  }, [pollUntilComplete]);

  const closeConnection = useCallback(() => {
    pollingGeneration.current += 1;
    setDeviceFlow(null);
    setConnectionOpen(false);
    void cancelGitHubDeviceFlow().catch(() => undefined);
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await disconnectGitHub();
      setDeviceFlow(null);
      setConnection(await getGitHubConnectionStatus());
    } catch (disconnectError) {
      setError(messageFromError(disconnectError));
    }
  }, []);

  const prepare = useCallback(async () => {
    if (!draft || busy) return;
    setError(null);
    setResult(null);
    setMetadataRecorded(true);
    setStage('validating');
    const readiness = validateDraftForPublish(draft);
    if (!readiness.valid) {
      setError(readiness.errors.join(' '));
      setStage('idle');
      return;
    }
    if (!connection?.repositoryVerified) {
      setConnectionOpen(true);
      setError(connection?.message ?? 'Connect GitHub and verify repository access before publishing.');
      setStage('idle');
      return;
    }
    const changes = semanticRecipeChanges(draft);
    if (draft.sourceLink && changes.length === 0) {
      setError('This draft already matches the published recipe. Make a change before publishing.');
      setStage('idle');
      return;
    }
    if (await flush() !== 'saved') {
      setError('The draft must finish saving before publication can begin.');
      setStage('idle');
      return;
    }

    try {
      const imageAction = imageActionForDraft(draft);
      let image: { bytesBase64: string; mimeType: string } | null = null;
      const attachment = draft.data.attachments[0];
      if (imageAction === 'replace') {
        if (!attachment?.localAttachmentId) {
          throw new Error('Select the replacement image on this device before publishing.');
        }
        const blob = await loadDraftImage(uid, draft.id, attachment.localAttachmentId);
        if (!blob) {
          const location = attachment.sourceDeviceId !== deviceId ? 'another device' : 'this device';
          throw new Error(`This image was selected on ${location} and is not available locally. Select it again on this device.`);
        }
        const file = new File([blob], attachment.fileName, { type: attachment.mimeType ?? blob.type });
        const validation = await validateWebsiteImage(file);
        if (!validation.valid || !validation.metadata) throw new Error(validation.errors.join(' '));
        image = {
          bytesBase64: await blobToBase64(file),
          mimeType: validation.metadata.mimeType,
        };
      }

      setStage('preparing');
      const recipe = buildRecipePublicationSource(draft);
      const nextReview = await prepareRecipePublish({
        sourceDraftId: draft.id,
        slug: draft.slug,
        title: draft.title,
        recipeJson: JSON.stringify(recipe),
        image,
        imageAction,
        source: sourceIdentityFromDraft(draft),
      });
      setReviewChanges(changes);
      setReview(nextReview);
      setStage('idle');
    } catch (prepareError) {
      setError(messageFromError(prepareError));
      setStage('idle');
    }
  }, [busy, connection, deviceId, draft, flush, uid]);

  const openRecipes = useCallback(() => {
    setRecipesOpen(true);
    if (connection?.repositoryVerified) void refreshPublishedRecipes();
  }, [connection?.repositoryVerified, refreshPublishedRecipes]);

  const editPublished = useCallback(async (summary: PublishedRecipeSummary) => {
    if (busy) return;
    setStage('preparing');
    setError(null);
    try {
      const published = await loadPublishedRecipe(summary.slug);
      await openPublishedRecipe(published);
      setRecipesOpen(false);
    } catch (openError) {
      setError(messageFromError(openError));
    } finally {
      setStage('idle');
    }
  }, [busy, openPublishedRecipe]);

  const requestDelete = useCallback(async (summary: PublishedRecipeSummary) => {
    if (busy) return;
    setStage('preparing');
    setError(null);
    try {
      const published = await loadPublishedRecipe(summary.slug);
      const analysis = await analyzeRecipeDelete({
        path: published.path,
        slug: published.slug,
        commitSha: published.commitSha,
        blobSha: published.blobSha,
      });
      setDeleteRequest({ published, analysis, confirmation: '', deleteUniqueImage: false });
      setRecipesOpen(false);
    } catch (deleteError) {
      setError(messageFromError(deleteError));
    } finally {
      setStage('idle');
    }
  }, [busy]);

  const reviewDelete = useCallback(async () => {
    if (!deleteRequest || busy) return;
    const { analysis, published, confirmation, deleteUniqueImage } = deleteRequest;
    if (confirmation !== analysis.title) {
      setError('Type the exact published recipe title to confirm deletion.');
      return;
    }
    setStage('preparing');
    setError(null);
    try {
      const nextReview = await prepareRecipeDelete({
        sourceDraftId: publishedDraftId(published.slug),
        path: analysis.path,
        slug: analysis.slug,
        commitSha: analysis.commitSha,
        blobSha: analysis.blobSha,
        title: analysis.title,
        confirmation,
        deleteUniqueImage,
      });
      setPendingDelete(published);
      setReviewChanges([{ kind: 'delete', label: 'Published recipe will be deleted' }]);
      setReview(nextReview);
      setDeleteRequest(null);
    } catch (deleteError) {
      setError(messageFromError(deleteError));
    } finally {
      setStage('idle');
    }
  }, [busy, deleteRequest]);

  const confirm = useCallback(async () => {
    if (!review || busy) return;
    setError(null);
    setStage('publishing');
    try {
      const published = await publishRecipe(review.planId);
      const metadata = publicationMetadataFromResult(published);
      await recordPublicationAudit({
        operation: published.operation,
        contentType: 'recipe',
        contentId: published.recipeSlug,
        draftId: published.sourceDraftId,
        previousCommitSha: review.baseCommitSha,
        newCommitSha: published.commitSha,
        deploymentStatus: 'building',
      }).catch(() => undefined);
      setDeploymentStatus('building');
      setResult(published);
      setReview(null);
      try {
        if (published.operation === 'delete') {
          if (!pendingDelete) throw new Error('The deleted recipe recovery source is unavailable.');
          await markPublishedDeleted(pendingDelete, metadata);
        } else {
          await markPublished(metadata);
        }
        setMetadataRecorded(true);
      } catch {
        setMetadataRecorded(false);
      }
      setPendingDelete(null);
      setStage('published');
      void refreshPublishedRecipes();
    } catch (publishError) {
      setError(messageFromError(publishError));
      setReview(null);
      setPendingDelete(null);
      setStage('idle');
    }
  }, [busy, markPublished, markPublishedDeleted, pendingDelete, recordPublicationAudit, refreshPublishedRecipes, review]);

  const closeReview = useCallback(() => {
    if (!busy) {
      setReview(null);
      setReviewChanges([]);
      setPendingDelete(null);
    }
  }, [busy]);

  const closeResult = useCallback(() => {
    setResult(null);
    setDeploymentStatus('committed');
    setStage('idle');
  }, []);

  const openActionsPage = useCallback(async () => {
    try {
      await openGitHubActionsPage();
    } catch (openError) {
      setError(messageFromError(openError));
    }
  }, []);

  const recipeState = useCallback((summary: PublishedRecipeSummary): PublishedRecipeState => {
    const record = drafts.find(({ draft: candidate }) => isRecipeDraft(candidate) && draftMatchesPublishedRecipe(candidate, summary));
    if (!record) return 'published';
    if (!isRecipeDraft(record.draft)) return 'published';
    if (record.draft.sourceLink && record.draft.sourceLink.blobSha !== summary.blobSha) return 'remoteChanged';
    return record.draft.status === 'published' ? 'published' : 'draft';
  }, [drafts]);

  return {
    connection,
    connectionOpen,
    connecting,
    deviceFlow,
    waitingLabel,
    review,
    reviewChanges,
    result,
    metadataRecorded,
    deploymentStatus,
    stage,
    busy,
    error,
    recipesOpen,
    recipesLoading,
    publishedRecipes,
    deleteRequest,
    setError,
    openConnection: () => setConnectionOpen(true),
    startConnection,
    closeConnection,
    openDevicePage: openGitHubDevicePage,
    openActionsPage,
    disconnect,
    refreshConnection,
    openRecipes,
    closeRecipes: () => setRecipesOpen(false),
    refreshPublishedRecipes,
    editPublished,
    requestDelete,
    recipeState,
    updateDeleteRequest: (update: Partial<Pick<DeleteRequest, 'confirmation' | 'deleteUniqueImage'>>) => {
      setDeleteRequest((current) => current ? { ...current, ...update } : null);
    },
    closeDeleteRequest: () => setDeleteRequest(null),
    reviewDelete,
    prepare,
    confirm,
    closeReview,
    closeResult,
  };
}

export type GitHubPublishingController = ReturnType<typeof useGitHubPublishing>;
