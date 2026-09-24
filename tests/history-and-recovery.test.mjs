import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  applyEditorMutation,
  createEditorHistory,
  EDITOR_HISTORY_LIMIT,
  redoEditorMutation,
  undoEditorMutation,
} from '../cms/src/history/editorHistory.mjs';
import { shouldOfferLocalRecovery } from '../cms/src/drafts/localRecovery.mjs';
import {
  requiresHighRiskConfirmation,
  sanitizePublicationAudit,
  semanticHistoryDiff,
} from '../cms/src/history/historyModel.mjs';
import { deploymentStatusForHttp, pollRecipeDeployment } from '../cms/src/publishing/deploymentStatus.mjs';

test('undo and redo restore a logical text edit', () => {
  let history = createEditorHistory({ title: 'Soup', blocks: [] });
  history = applyEditorMutation(history, { title: 'Soup a', blocks: [] }, { timestamp: 100 });
  history = applyEditorMutation(history, { title: 'Soup aromatic', blocks: [] }, { timestamp: 200 });
  assert.equal(history.past.length, 1, 'continuous typing should batch');
  const undone = undoEditorMutation(history);
  assert.equal(undone.value.title, 'Soup');
  const redone = redoEditorMutation(undone.history);
  assert.equal(redone.value.title, 'Soup aromatic');
});

test('reorder and block deletion are separate reversible actions', () => {
  const initial = { ingredients: ['salt', 'water', 'rice'], blocks: [{ id: 'hero' }, { id: 'steps' }] };
  let history = createEditorHistory(initial);
  history = applyEditorMutation(history, { ...initial, ingredients: ['water', 'salt', 'rice'] }, { timestamp: 100 });
  history = applyEditorMutation(history, { ingredients: ['water', 'salt', 'rice'], blocks: [{ id: 'hero' }] }, { timestamp: 200 });
  const undoDelete = undoEditorMutation(history);
  assert.deepEqual(undoDelete.value.blocks, initial.blocks);
  const undoReorder = undoEditorMutation(undoDelete.history);
  assert.deepEqual(undoReorder.value.ingredients, initial.ingredients);
});

test('editor history is bounded and clears redo after a new branch', () => {
  let history = createEditorHistory({ value: 0 });
  for (let value = 1; value <= EDITOR_HISTORY_LIMIT + 12; value += 1) {
    history = applyEditorMutation(history, { value, other: value % 2 }, { timestamp: value * 1000, coalesceKey: null });
  }
  assert.equal(history.past.length, EDITOR_HISTORY_LIMIT);
  const undone = undoEditorMutation(history);
  const branched = applyEditorMutation(undone.history, { value: 999, other: 0 }, { coalesceKey: null });
  assert.equal(branched.future.length, 0);
});

test('newer dirty local recovery is offered only over the synchronized base revision', () => {
  const remote = { id: 'draft-one', revision: 4, updatedAt: '2026-09-24T08:00:00.000Z' };
  const local = { draft: { ...remote, title: 'Local title' }, dirty: true, baseRevision: 4, backedUpAt: '2026-09-24T08:01:00.000Z' };
  assert.equal(shouldOfferLocalRecovery(local, remote), true);
  assert.equal(shouldOfferLocalRecovery({ ...local, baseRevision: 3 }, remote), false);
  assert.equal(shouldOfferLocalRecovery({ ...local, dirty: false }, remote), false);
});

test('historical comparison reports structured content changes', () => {
  const changes = semanticHistoryDiff(
    { title: 'Carbonara', ingredients: ['pasta', 'egg'], layout: { width: 'medium' } },
    { title: 'Pasta Carbonara', ingredients: ['pasta', 'egg', 'parmesan'], layout: { width: 'wide' } },
  );
  assert.match(changes.map((change) => `${change.label}: ${change.before} -> ${change.after}`).join('\n'), /Title/);
  assert.match(changes.map((change) => change.label).join('\n'), /Ingredients/);
  assert.match(changes.map((change) => change.label).join('\n'), /Layout/);
});

test('audit metadata is allowlisted and cannot retain secrets', () => {
  const audit = sanitizePublicationAudit({
    operation: 'restore', contentType: 'recipe', contentId: 'carbonara', draftId: 'draft-restore',
    editorUid: 'editor', previousCommitSha: 'a'.repeat(40), newCommitSha: 'b'.repeat(40),
    deploymentStatus: 'building', accessToken: 'secret', Authorization: 'Bearer secret', password: 'secret',
  });
  assert.deepEqual(Object.keys(audit).sort(), ['contentId', 'contentType', 'deploymentStatus', 'draftId', 'editorUid', 'newCommitSha', 'operation', 'previousCommitSha'].sort());
  assert.doesNotMatch(JSON.stringify(audit), /secret|Authorization|password|accessToken/);
});

test('global-impact changes require deliberate confirmation', () => {
  assert.equal(requiresHighRiskConfirmation('theme', 1), true);
  assert.equal(requiresHighRiskConfirmation('update', 8), true);
  assert.equal(requiresHighRiskConfirmation('update', 1), false);
});

test('deployment states distinguish source commit, build, live, and failure', async () => {
  assert.equal(deploymentStatusForHttp(202), 'building');
  assert.equal(deploymentStatusForHttp(403), 'unknown');
  const statuses = [];
  const result = await pollRecipeDeployment({
    slug: 'test', commitSha: 'a'.repeat(40), attempts: 1,
    fetcher: async () => ({ status: 404, text: async () => '' }),
    waitFor: async () => undefined,
    onStatus: (status) => statuses.push(status),
  });
  assert.equal(result, 'unknown');
  assert.deepEqual(statuses, ['building', 'unknown']);
});

test('native history and restore surface is high-level, allowlisted, and non-force', async () => {
  const [native, client, permission] = await Promise.all([
    readFile('src-tauri/src/github/mod.rs', 'utf8'),
    readFile('cms/src/publishing/githubClient.ts', 'utf8'),
    readFile('src-tauri/permissions/github-publishing.toml', 'utf8'),
  ]);
  assert.match(native, /github_list_cms_history/);
  assert.match(native, /github_prepare_content_restore/);
  assert.match(native, /restorable_source_path/);
  assert.match(native, /normalize_historical_source/);
  assert.match(native, /This slug now belongs to a different content item/);
  assert.match(native, /Historical asset \{asset\} is unavailable/);
  assert.match(native, /operation: "restore"\.to_string\(\)/);
  assert.match(native, /"force": false/);
  assert.doesNotMatch(native, /"force": true/);
  assert.match(client, /prepareContentRestore/);
  assert.doesNotMatch(client, /resetBranch|forcePush|genericCommit/);
  assert.match(permission, /github_list_cms_history/);
  assert.match(permission, /github_prepare_content_restore/);
});
