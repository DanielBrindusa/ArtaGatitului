export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function isSafeContentUrl(value, { allowHash = false } = {}) {
  const url = String(value || '').trim();
  if (!url) return false;
  if (/[\u0000-\u001f\u007f]/.test(url)) return false;
  if (allowHash && url.startsWith('#')) return true;
  if (/^(?:\/\/|\\\\)/.test(url)) return false;
  if (/^(?:https?:\/\/|\/(?!\/)|\.\.\/|\.\/)/i.test(url)) return true;
  const compact = url.replace(/\s+/g, '');
  return !/^[a-z][a-z0-9+.-]*:/i.test(compact);
}
