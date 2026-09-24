import fs from 'node:fs/promises';
import path from 'node:path';
import { generateDataAssets } from './generate-data-assets.mjs';
import { generatePages } from './generate-pages.mjs';
import { generateServiceWorker } from './generate-service-worker.mjs';
import { generateSitemap } from './generate-sitemap.mjs';
import { loadContent } from './content-loader.mjs';
import { buildRoutePlan, validateRoutePlan } from './routes.mjs';
import { OUTPUT_ROOT, ROOT } from './config.mjs';

async function prepareOutputDirectory() {
  const resolvedRoot = path.resolve(ROOT);
  const resolvedOutput = path.resolve(OUTPUT_ROOT);
  if (!resolvedOutput.startsWith(`${resolvedRoot}${path.sep}`) || resolvedOutput === resolvedRoot) {
    throw new Error(`Static output must remain inside the repository: ${resolvedOutput}`);
  }
  await fs.rm(resolvedOutput, { recursive: true, force: true });
  await fs.mkdir(resolvedOutput, { recursive: true });
}

export async function runBuild(renderers) {
  await prepareOutputDirectory();
  const content = await loadContent();
  renderers.configureSiteSources?.(content.site);
  const routePlan = validateRoutePlan(buildRoutePlan(content));

  await generateDataAssets(content, renderers);
  await generateServiceWorker(content, renderers);
  await generatePages(content, renderers);
  const sitemapResult = await generateSitemap(routePlan);

  const sitemapNote = sitemapResult.generated
    ? ` Sitemap routes: ${sitemapResult.count}.`
    : ` Sitemap skipped: ${sitemapResult.reason}`;

  console.log(
    `Generated ${content.recipes.length} recipes, ${content.categories.length} categories, ${content.pages.length} pages, `
    + `${Object.keys(content.aliases || {}).length} aliases, and ${routePlan.routes.length} validated routes.${sitemapNote}`,
  );
}
