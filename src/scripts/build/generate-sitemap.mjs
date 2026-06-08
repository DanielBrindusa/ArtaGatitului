import path from 'node:path';
import { ROOT, SITE_CONFIG, SITE_URL } from './config.mjs';
import { escapeHtml, writeTextFile } from './html-utils.mjs';

function publicUrl(baseUrl, filePath) {
  const clean = filePath
    .replace(/\\/g, '/')
    .replace(/(^|\/)index\.html$/, '$1')
    .replace(/^\/+/, '');
  return new URL(clean, `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

const SITEMAP_SPLIT_THRESHOLD = 45000;
const NOINDEX_STATIC_ROUTES = new Set([
  SITE_CONFIG.routes.recipeBuilder,
  SITE_CONFIG.routes.offline,
]);

function isCanonicalSitemapRoute(route) {
  if (route.kind === 'recipe' || route.kind === 'category') return true;
  if (route.kind !== 'static') return false;
  return !NOINDEX_STATIC_ROUTES.has(route.filePath.replace(/\\/g, '/'));
}

function sitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}
</urlset>
`;
}

function robotsTxt(siteUrl) {
  return `User-agent: *
Allow: /

Sitemap: ${publicUrl(siteUrl, 'sitemap.xml')}
`;
}

export async function generateSitemap(routePlan, siteUrl = SITE_URL) {
  // Keep this centralized so it can grow into sitemap-index.xml and split sitemaps
  // when the route count approaches SITEMAP_SPLIT_THRESHOLD.
  const canonicalRoutes = routePlan.routes.filter(isCanonicalSitemapRoute);
  if (canonicalRoutes.length > SITEMAP_SPLIT_THRESHOLD) {
    throw new Error('Sitemap route count exceeds the single-file threshold. Split sitemap generation should be enabled before continuing.');
  }

  const urls = canonicalRoutes
    .filter((route) => route.filePath.endsWith('index.html') || route.filePath.endsWith('.html'))
    .map((route) => publicUrl(siteUrl, route.filePath));

  await writeTextFile(path.join(ROOT, 'sitemap.xml'), sitemapXml(Array.from(new Set(urls))));
  await writeTextFile(path.join(ROOT, 'robots.txt'), robotsTxt(siteUrl));
  return { generated: true, count: urls.length };
}
