import { generateDataAssets } from './generate-data-assets.mjs';
import { generatePages } from './generate-pages.mjs';
import { generateServiceWorker } from './generate-service-worker.mjs';
import { generateSitemap } from './generate-sitemap.mjs';
import { loadContent } from './content-loader.mjs';
import { buildRoutePlan, validateRoutePlan } from './routes.mjs';

export async function runBuild(renderers) {
  const content = await loadContent();
  const routePlan = validateRoutePlan(buildRoutePlan(content));

  await generateDataAssets(content, renderers);
  await generateServiceWorker(content, renderers);
  await generatePages(content, renderers);
  const sitemapResult = await generateSitemap(routePlan);

  const sitemapNote = sitemapResult.generated
    ? ` Sitemap routes: ${sitemapResult.count}.`
    : ` Sitemap skipped: ${sitemapResult.reason}`;

  console.log(
    `Generated ${content.recipes.length} recipes, ${content.categories.length} categories, `
    + `${Object.keys(content.aliases || {}).length} aliases, and ${routePlan.routes.length} validated routes.${sitemapNote}`,
  );
}
