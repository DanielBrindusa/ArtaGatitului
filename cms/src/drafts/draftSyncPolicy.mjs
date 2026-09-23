export function shouldConflictOnMissingRemote(record) {
  if (!record?.dirty) return false;
  return record.baseRevision > 0 || record.draft?.revision > 0;
}
