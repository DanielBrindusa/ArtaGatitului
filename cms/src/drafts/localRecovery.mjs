function time(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function shouldOfferLocalRecovery(local, remote) {
  if (!local?.dirty || !remote || local.draft.id !== remote.id) return false;
  if (local.baseRevision !== remote.revision) return false;
  return time(local.backedUpAt) > time(remote.updatedAt);
}

export function recoveryFieldDifferences(localDraft, remoteDraft) {
  const fields = localDraft.contentType === 'site'
    ? ['title', 'status', 'data.site']
    : ['title', 'slug', 'status', localDraft.contentType === 'page' ? 'data.page' : 'data.recipe', 'layout'];
  const read = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);
  return fields.flatMap((path) => {
    const local = read(localDraft, path);
    const remote = read(remoteDraft, path);
    if (JSON.stringify(local) === JSON.stringify(remote)) return [];
    return [{ path, local, remote }];
  });
}
