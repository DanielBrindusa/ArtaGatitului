export const EDITOR_HISTORY_LIMIT = 50;
export const EDITOR_HISTORY_BATCH_MS = 800;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collectChangedLeaves(before, after, path = '', changes = [], limit = 3) {
  if (changes.length >= limit || Object.is(before, after)) return changes;
  if (before === null || after === null || typeof before !== 'object' || typeof after !== 'object') {
    changes.push({ path, before, after });
    return changes;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    collectChangedLeaves(before[key], after[key], path ? `${path}.${key}` : key, changes, limit);
    if (changes.length >= limit) break;
  }
  return changes;
}

export function mutationCoalesceKey(before, after) {
  const changes = collectChangedLeaves(before, after);
  if (changes.length !== 1) return null;
  const change = changes[0];
  const primitive = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);
  if (!primitive(change.before) || !primitive(change.after)) return null;
  return `field:${change.path}`;
}

export function createEditorHistory(initial, options = {}) {
  return {
    past: [],
    present: clone(initial),
    future: [],
    limit: options.limit ?? EDITOR_HISTORY_LIMIT,
    batchWindowMs: options.batchWindowMs ?? EDITOR_HISTORY_BATCH_MS,
    lastAction: null,
  };
}
export function synchronizeEditorPresent(history, present) {
  if (same(history.present, present)) return history;
  return { ...history, present: clone(present), lastAction: null };
}

export function applyEditorMutation(history, nextValue, options = {}) {
  if (same(history.present, nextValue)) return history;
  const timestamp = options.timestamp ?? Date.now();
  const coalesceKey = options.coalesceKey ?? mutationCoalesceKey(history.present, nextValue);
  const canCoalesce = Boolean(
    coalesceKey
    && history.lastAction?.coalesceKey === coalesceKey
    && timestamp - history.lastAction.timestamp <= history.batchWindowMs,
  );
  const past = canCoalesce
    ? history.past
    : [...history.past, clone(history.present)].slice(-history.limit);
  return {
    ...history,
    past,
    present: clone(nextValue),
    future: [],
    lastAction: { coalesceKey, timestamp },
  };
}

export function undoEditorMutation(history) {
  if (!history.past.length) return { history, value: null };
  const value = history.past[history.past.length - 1];
  return {
    value: clone(value),
    history: {
      ...history,
      past: history.past.slice(0, -1),
      present: clone(value),
      future: [clone(history.present), ...history.future].slice(0, history.limit),
      lastAction: null,
    },
  };
}

export function redoEditorMutation(history) {
  if (!history.future.length) return { history, value: null };
  const value = history.future[0];
  return {
    value: clone(value),
    history: {
      ...history,
      past: [...history.past, clone(history.present)].slice(-history.limit),
      present: clone(value),
      future: history.future.slice(1),
      lastAction: null,
    },
  };
}
