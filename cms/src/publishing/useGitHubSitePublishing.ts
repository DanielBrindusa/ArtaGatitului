import { useCallback, useEffect, useRef, useState } from 'react';
import { validateDraftForPublish, type AnyDraft, type SiteDraft } from '../drafts/draftModel.mjs';
import type { PublicationAuditInput } from '../drafts/DraftService';
import { requiresHighRiskConfirmation } from '../history/historyModel.mjs';
import {
  beginGitHubDeviceFlow,
  cancelGitHubDeviceFlow,
  disconnectGitHub,
  getGitHubConnectionStatus,
  loadSiteConfiguration,
  openGitHubActionsPage,
  openGitHubDevicePage,
  pollGitHubDeviceFlow,
  prepareSitePublish,
  publishRecipe,
  type DeviceFlowStart,
  type GitHubConnectionStatus,
  type PrepareSitePublishInput,
  type PublishResult,
  type PublishReview,
  type SiteConfigurationSnapshot,
} from './githubClient';
import { siteBaselinesFromSnapshot, siteBundleFromSnapshot, siteChangedPaths, sitePublishFiles } from './sitePublicationModel';

type FlushResult = 'saved' | 'offline' | 'conflict' | 'error';
type Stage = 'idle' | 'loading' | 'validating' | 'preparing' | 'publishing' | 'published';

interface Options {
  draft: SiteDraft;
  flush: () => Promise<FlushResult>;
  updateDraft: (update: (draft: AnyDraft) => AnyDraft) => void;
  recordPublicationAudit: (input: Omit<PublicationAuditInput, 'editorUid'>) => Promise<void>;
}

function messageFromError(error: unknown) {
  if (typeof error === 'string') return error;
  return error instanceof Error && error.message ? error.message : 'GitHub site publishing could not complete.';
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export function useGitHubSitePublishing({ draft, flush, updateDraft, recordPublicationAudit }: Options) {
  const [connection, setConnection] = useState<GitHubConnectionStatus | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowStart | null>(null);
  const [waitingLabel, setWaitingLabel] = useState('Waiting for authorization...');
  const [review, setReview] = useState<PublishReview | null>(null);
  const [reviewArea, setReviewArea] = useState<PrepareSitePublishInput['area'] | null>(null);
  const [highRiskConfirmation, setHighRiskConfirmation] = useState('');
  const [result, setResult] = useState<PublishResult | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const pollingGeneration = useRef(0);
  const autoLoadAttempted = useRef(false);
  const busy = ['loading', 'validating', 'preparing', 'publishing'].includes(stage);
  const changedPaths = siteChangedPaths(draft);

  const refreshConnection = useCallback(async () => {
    try { setConnection(await getGitHubConnectionStatus()); } catch (statusError) { setError(messageFromError(statusError)); }
  }, []);

  const applySnapshot = useCallback((snapshot: SiteConfigurationSnapshot, published?: PublishResult) => {
    const site = siteBundleFromSnapshot(snapshot);
    const sources = siteBaselinesFromSnapshot(snapshot);
    updateDraft((current) => current.contentType !== 'site' ? current : {
      ...current,
      status: published ? 'published' : 'draft',
      data: { ...current.data, site, sources },
      ...(published ? {
        publishedCommitSha: published.commitSha,
        publishedRepository: published.repository,
        publishedBranch: published.branch,
        publishedSourceDraftId: published.sourceDraftId,
        publishedSlug: 'site-management',
        publishedAt: published.publishedAt,
      } : {}),
    });
  }, [updateDraft]);

  const reloadBaseline = useCallback(async () => {
    if (busy) return;
    setStage('loading');
    setError(null);
    try {
      applySnapshot(await loadSiteConfiguration());
      const outcome = await flush();
      if (outcome !== 'saved') throw new Error('The GitHub baseline was loaded, but the site draft has not synchronized yet.');
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setStage('idle');
    }
  }, [applySnapshot, busy, flush]);

  useEffect(() => {
    void refreshConnection();
    return () => { pollingGeneration.current += 1; };
  }, [refreshConnection]);

  useEffect(() => {
    if (!connection?.repositoryVerified || draft.data.sources.length || autoLoadAttempted.current) return;
    autoLoadAttempted.current = true;
    void reloadBaseline();
  }, [connection?.repositoryVerified, draft.data.sources.length, reloadBaseline]);

  const pollUntilComplete = useCallback(async (generation: number, initialDelaySeconds: number) => {
    let waitSeconds = initialDelaySeconds;
    while (pollingGeneration.current === generation) {
      await delay(Math.max(1, waitSeconds) * 1_000);
      if (pollingGeneration.current !== generation) return;
      try {
        const polled = await pollGitHubDeviceFlow();
        if (polled.state === 'pending' || polled.state === 'slowDown') {
          waitSeconds = polled.retryAfterSeconds ?? waitSeconds;
          setWaitingLabel(polled.state === 'slowDown' ? `Checking again in ${waitSeconds} seconds...` : 'Waiting for authorization...');
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

  const prepare = useCallback(async (area: PrepareSitePublishInput['area']) => {
    if (busy) return;
    setError(null);
    setResult(null);
    setStage('validating');
    const validation = validateDraftForPublish(draft);
    if (!validation.valid) { setError(validation.errors.join(' ')); setStage('idle'); return; }
    if (!changedPaths.length) { setError('This site draft already matches its GitHub baseline.'); setStage('idle'); return; }
    if (!connection?.repositoryVerified) { setConnectionOpen(true); setError(connection?.message ?? 'Connect GitHub before publishing.'); setStage('idle'); return; }
    if (await flush() !== 'saved') { setError('The site draft must finish synchronizing before publication.'); setStage('idle'); return; }
    try {
      setStage('preparing');
      setReview(await prepareSitePublish({ sourceDraftId: draft.id, area, files: sitePublishFiles(draft) }));
      setReviewArea(area);
      setHighRiskConfirmation('');
    } catch (prepareError) { setError(messageFromError(prepareError)); } finally { setStage('idle'); }
  }, [busy, changedPaths.length, connection, draft, flush]);

  const confirm = useCallback(async () => {
    if (!review || busy) return;
    if (reviewArea && requiresHighRiskConfirmation(reviewArea, review.fileChanges.length) && highRiskConfirmation !== 'PUBLISH') {
      setError('Type PUBLISH to confirm this global-impact change.');
      return;
    }
    setStage('publishing');
    setError(null);
    try {
      const published = await publishRecipe(review.planId);
      await recordPublicationAudit({
        operation: published.operation,
        contentType: 'site',
        contentId: 'site-management',
        draftId: published.sourceDraftId,
        previousCommitSha: review.baseCommitSha,
        newCommitSha: published.commitSha,
        deploymentStatus: 'building',
      }).catch(() => undefined);
      const snapshot = await loadSiteConfiguration();
      applySnapshot(snapshot, published);
      if (await flush() !== 'saved') throw new Error('The commit succeeded, but its Firestore metadata is still only in local recovery.');
      setResult(published);
      setReview(null);
      setStage('published');
    } catch (publishError) {
      setError(messageFromError(publishError));
      setReview(null);
      setStage('idle');
    }
  }, [applySnapshot, busy, flush, highRiskConfirmation, recordPublicationAudit, review, reviewArea]);

  const closeConnection = useCallback(() => {
    pollingGeneration.current += 1;
    setDeviceFlow(null);
    setConnectionOpen(false);
    void cancelGitHubDeviceFlow().catch(() => undefined);
  }, []);

  return {
    connection, connectionOpen, deviceFlow, waitingLabel,
    review: reviewArea && requiresHighRiskConfirmation(reviewArea, review?.fileChanges.length ?? 0) ? null : review,
    highRiskReview: reviewArea && requiresHighRiskConfirmation(reviewArea, review?.fileChanges.length ?? 0) ? review : null,
    reviewArea, highRiskConfirmation, setHighRiskConfirmation,
    result, stage, busy, error, changedPaths,
    setError,
    openConnection: () => setConnectionOpen(true),
    closeConnection,
    startConnection,
    openDevicePage: openGitHubDevicePage,
    openActionsPage: openGitHubActionsPage,
    disconnect: async () => { await disconnectGitHub(); await refreshConnection(); },
    reloadBaseline,
    prepare,
    confirm,
    closeReview: () => { if (!busy) { setReview(null); setReviewArea(null); setHighRiskConfirmation(''); } },
    closeResult: () => { setResult(null); setStage('idle'); },
  };
}

export type GitHubSitePublishingController = ReturnType<typeof useGitHubSitePublishing>;
