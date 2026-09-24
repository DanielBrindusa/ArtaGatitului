export interface SemanticHistoryChange { path: string; label: string; before: string; after: string }
export function semanticHistoryDiff(before: unknown, after: unknown): SemanticHistoryChange[];
export function historyFilterForPath(path: string): 'recipe' | 'page' | 'homepage' | 'template' | 'navigation' | 'theme' | 'site';
export function sanitizePublicationAudit(input: Record<string, unknown>): {
  operation: 'create' | 'update' | 'delete' | 'restore'; contentType: 'recipe' | 'page' | 'site';
  contentId: string; draftId: string; editorUid: string; previousCommitSha: string | null;
  newCommitSha: string; deploymentStatus: 'committed' | 'building' | 'live' | 'buildFailed' | 'unknown';
};
export function requiresHighRiskConfirmation(operation: string, impactCount?: number): boolean;
