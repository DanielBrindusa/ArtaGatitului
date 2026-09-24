const LABELS = {
  title: 'Title', slug: 'Route', description: 'Description', ingredients: 'Ingredients',
  steps: 'Instructions', layout: 'Layout', image: 'Image', navigation: 'Navigation',
  theme: 'Theme', templates: 'Templates', globalBlocks: 'Global blocks', categories: 'Categories',
};

function labelFor(path) {
  const part = path.split('.').find((item) => LABELS[item]);
  return LABELS[part] ?? path.split('.').slice(-2).join(' / ');
}

function compact(value) {
  if (value === undefined) return 'missing';
  if (value === null) return 'none';
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? '' : 's'}`;
  return String(value);
}

export function semanticHistoryDiff(before, after, path = '', changes = [], limit = 80) {
  if (changes.length >= limit || Object.is(before, after)) return changes;
  if (before === null || after === null || typeof before !== 'object' || typeof after !== 'object') {
    changes.push({ path, label: labelFor(path), before: compact(before), after: compact(after) });
    return changes;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ path, label: labelFor(path), before: compact(before), after: compact(after) });
    }
    return changes;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    semanticHistoryDiff(before[key], after[key], path ? `${path}.${key}` : key, changes, limit);
    if (changes.length >= limit) break;
  }
  return changes;
}

export function historyFilterForPath(path) {
  if (/^src\/content\/recipes\//.test(path)) return 'recipe';
  if (/^src\/content\/pages\/home\.json$/.test(path)) return 'homepage';
  if (/^src\/content\/pages\//.test(path)) return 'page';
  if (path.endsWith('/templates.json')) return 'template';
  if (path.endsWith('/navigation.json')) return 'navigation';
  if (path.endsWith('/theme.json')) return 'theme';
  return 'site';
}

export function sanitizePublicationAudit(input) {
  const allowedOperations = new Set(['create', 'update', 'delete', 'restore']);
  const allowedTypes = new Set(['recipe', 'page', 'site']);
  const allowedStatuses = new Set(['committed', 'building', 'live', 'buildFailed', 'unknown']);
  if (!allowedOperations.has(input.operation) || !allowedTypes.has(input.contentType)) {
    throw new Error('Publication audit metadata is invalid.');
  }
  if (!/^[0-9a-f]{40}$/.test(input.newCommitSha ?? '')) throw new Error('Publication audit commit is invalid.');
  return {
    operation: input.operation,
    contentType: input.contentType,
    contentId: String(input.contentId ?? '').slice(0, 160),
    draftId: String(input.draftId ?? '').slice(0, 80),
    editorUid: String(input.editorUid ?? '').slice(0, 160),
    previousCommitSha: /^[0-9a-f]{40}$/.test(input.previousCommitSha ?? '') ? input.previousCommitSha : null,
    newCommitSha: input.newCommitSha,
    deploymentStatus: allowedStatuses.has(input.deploymentStatus) ? input.deploymentStatus : 'unknown',
  };
}

export function requiresHighRiskConfirmation(operation, impactCount = 0) {
  return ['delete-published', 'delete-page', 'delete-category', 'delete-global', 'theme-reset', 'site-restore', 'templates', 'global-blocks', 'navigation', 'taxonomies', 'theme'].includes(operation)
    || impactCount >= 5;
}
