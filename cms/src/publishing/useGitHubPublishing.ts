import { useCallback, useEffect, useRef, useState } from 'react';
import type { DraftPublicationMetadata, RecipeDraft } from '../drafts/draftModel.mjs';
import { validateDraftForPublish } from '../drafts/draftModel.mjs';
import { validateDraftImage } from '../editor/imageValidation.mjs';
import { loadDraftImage } from '../editor/localImageStore';
import {
  beginGitHubDeviceFlow,
  blobToBase64,
  cancelGitHubDeviceFlow,
  disconnectGitHub,
  getGitHubConnectionStatus,
  openGitHubActionsPage,
  openGitHubDevicePage,
  pollGitHubDeviceFlow,
  prepareRecipePublish,
  publishRecipe,
  type DeviceFlowStart,
  type GitHubConnectionStatus,
  type PublishResult,
  type PublishReview,
} from './githubClient';
import {
  pollRecipeDeployment,
  type DeploymentStatus,
} from './deploymentStatus.mjs';
import { buildRecipePublicationSource, publicationMetadataFromResult } from './publicationModel.mjs';

type FlushResult = 'saved' | 'offline' | 'conflict' | 'error';
export type PublishingStage = 'idle' | 'validating' | 'preparing' | 'publishing' | 'published';

interface Options {
  draft: RecipeDraft | null;
  uid: string;
  deviceId: string;
  flush: () => Promise<FlushResult>;
  markPublished: (metadata: DraftPublicationMetadata) => Promise<RecipeDraft>;
}

function messageFromError(error: unknown) {
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  return 'GitHub publishing could not complete.';
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export function useGitHubPublishing({ draft, uid, deviceId, flush, markPublished }: Options) {
  const [connection, setConnection] = useState<GitHubConnectionStatus | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowStart | null>(null);
  const [waitingLabel, setWaitingLabel] = useState('Waiting for authorization...');
  const [review, setReview] = useState<PublishReview | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [metadataRecorded, setMetadataRecorded] = useState(true);
  const [stage, setStage] = useState<PublishingStage>('idle');
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>('committed');
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    void refreshConnection();
    return () => {
      pollingGeneration.current += 1;
    };
  }, [refreshConnection]);

  useEffect(() => {
    setReview(null);
  }, [draft]);

  useEffect(() => {
    if (!result) return undefined;
    let active = true;
    void pollRecipeDeployment({
      slug: result.recipeSlug,
      commitSha: result.commitSha,
      shouldContinue: () => active,
      onStatus: (status) => setDeploymentStatus(status),
    });
    return () => {
      active = false;
    };
  }, [result]);

  const pollUntilComplete = useCallback(async (generation: number, initialDelaySeconds: number) => {
    let waitSeconds = initialDelaySeconds;
    while (pollingGeneration.current === generation) {
      await delay(Math.max(1, waitSeconds) * 1_000);
      if (pollingGeneration.current !== generation) return;
      try {
        const polled = await pollGitHubDeviceFlow();
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
        setDeviceFlow(null);
        setError(messageFromError(pollError));
        return;
      }
    }
  }, []);

  const startConnection = useCallback(async () => {
    setConnectionOpen(true);
    setError(null);
    setWaitingLabel('Waiting for authorization...');
    try {
      const flow = await beginGitHubDeviceFlow();
      setDeviceFlow(flow);
      const generation = pollingGeneration.current + 1;
      pollingGeneration.current = generation;
      void pollUntilComplete(generation, flow.intervalSeconds);
    } catch (connectError) {
      setError(messageFromError(connectError));
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
    if (await flush() !== 'saved') {
      setError('The draft must finish saving before publication can begin.');
      setStage('idle');
      return;
    }

    try {
      let image: { bytesBase64: string; mimeType: string } | null = null;
      const attachment = draft.data.attachments[0];
      if (attachment) {
        if (!attachment.localAttachmentId) {
          throw new Error('This image was selected on another device and is not available locally. Select the image on this device before publishing.');
        }
        const blob = await loadDraftImage(uid, draft.id, attachment.localAttachmentId);
        if (!blob) {
          const location = attachment.sourceDeviceId !== deviceId ? 'another device' : 'this device';
          throw new Error(`This image was selected on ${location} and is not available locally. Select the image on this device before publishing.`);
        }
        const file = new File([blob], attachment.fileName, {
          type: attachment.mimeType ?? blob.type,
        });
        const validation = await validateDraftImage(file);
        if (!validation.valid || !validation.metadata) {
          throw new Error(validation.errors.join(' '));
        }
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
      });
      setReview(nextReview);
      setStage('idle');
    } catch (prepareError) {
      setError(messageFromError(prepareError));
      setStage('idle');
    }
  }, [busy, connection, deviceId, draft, flush, uid]);

  const confirm = useCallback(async () => {
    if (!review || busy) return;
    setError(null);
    setStage('publishing');
    try {
      const published = await publishRecipe(review.planId);
      setDeploymentStatus('building');
      setResult(published);
      setReview(null);
      try {
        await markPublished(publicationMetadataFromResult(published));
        setMetadataRecorded(true);
      } catch {
        setMetadataRecorded(false);
      }
      setStage('published');
    } catch (publishError) {
      setError(messageFromError(publishError));
      setReview(null);
      setStage('idle');
    }
  }, [busy, markPublished, review]);

  const closeReview = useCallback(() => {
    if (!busy) setReview(null);
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

  return {
    connection,
    connectionOpen,
    deviceFlow,
    waitingLabel,
    review,
    result,
    metadataRecorded,
    deploymentStatus,
    stage,
    busy,
    error,
    setError,
    openConnection: () => setConnectionOpen(true),
    startConnection,
    closeConnection,
    openDevicePage: openGitHubDevicePage,
    openActionsPage,
    disconnect,
    refreshConnection,
    prepare,
    confirm,
    closeReview,
    closeResult,
  };
}

export type GitHubPublishingController = ReturnType<typeof useGitHubPublishing>;
