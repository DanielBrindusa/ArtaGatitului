export const EDITOR_HISTORY_LIMIT: 50;
export const EDITOR_HISTORY_BATCH_MS: 800;

export interface EditorHistory<T> {
  past: T[];
  present: T;
  future: T[];
  limit: number;
  batchWindowMs: number;
  lastAction: { coalesceKey: string | null; timestamp: number } | null;
}

export function mutationCoalesceKey<T>(before: T, after: T): string | null;
export function createEditorHistory<T>(initial: T, options?: { limit?: number; batchWindowMs?: number }): EditorHistory<T>;
export function synchronizeEditorPresent<T>(history: EditorHistory<T>, present: T): EditorHistory<T>;
export function applyEditorMutation<T>(history: EditorHistory<T>, nextValue: T, options?: { timestamp?: number; coalesceKey?: string | null }): EditorHistory<T>;
export function undoEditorMutation<T>(history: EditorHistory<T>): { history: EditorHistory<T>; value: T | null };
export function redoEditorMutation<T>(history: EditorHistory<T>): { history: EditorHistory<T>; value: T | null };
