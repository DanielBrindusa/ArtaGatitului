// Legacy-only importer. Normal builds read src/content and do not need site-audit files.
console.warn('Legacy GoDaddy import: this is not part of npm run build.');
console.warn('Use extract-godaddy-site.mjs only when you intentionally want to refresh old audit files.');

await import('../../../extract-godaddy-site.mjs');
