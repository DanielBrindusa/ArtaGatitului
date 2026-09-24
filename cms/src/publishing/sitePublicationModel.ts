import { SITE_SOURCE_PATHS, sameStructuredValue } from '../../../src/shared/index.mjs';
import type { SiteBundle, SiteDraft, SiteSourceBaseline } from '../drafts/draftModel.mjs';
import type { SiteConfigurationSnapshot, SiteSourceSnapshot } from './githubClient';

const SITE_PATH_KEYS: Record<string, keyof Omit<SiteBundle, 'recipes' | 'pages'>> = {
  'src/content/site/templates.json': 'templates',
  'src/content/site/global-blocks.json': 'globalBlocks',
  'src/content/site/navigation.json': 'navigation',
  'src/content/site/settings.json': 'settings',
  'src/content/site/theme.json': 'theme',
  'src/content/categories.json': 'categories',
  'src/data/tag-groups.json': 'tagGroups',
};

function parseSource(source: SiteSourceSnapshot) {
  try {
    return JSON.parse(source.sourceJson) as Record<string, unknown> | Array<Record<string, unknown>>;
  } catch {
    throw new Error(`${source.path} did not contain valid JSON.`);
  }
}

export function siteBundleFromSnapshot(snapshot: SiteConfigurationSnapshot): SiteBundle {
  const values = new Map(snapshot.sources.map((source) => [source.path, parseSource(source)]));
  const missing = SITE_SOURCE_PATHS.filter((path) => !values.has(path));
  if (missing.length) throw new Error(`GitHub did not return: ${missing.join(', ')}.`);
  const recipes = snapshot.sources
    .filter((source) => source.path.startsWith('src/content/recipes/'))
    .map((source) => parseSource(source));
  const pages = snapshot.sources
    .filter((source) => source.path.startsWith('src/content/pages/'))
    .map((source) => parseSource(source));
  return {
    templates: values.get('src/content/site/templates.json') as SiteBundle['templates'],
    globalBlocks: values.get('src/content/site/global-blocks.json') as SiteBundle['globalBlocks'],
    navigation: values.get('src/content/site/navigation.json') as SiteBundle['navigation'],
    settings: values.get('src/content/site/settings.json') as SiteBundle['settings'],
    theme: values.get('src/content/site/theme.json') as SiteBundle['theme'],
    categories: values.get('src/content/categories.json') as SiteBundle['categories'],
    tagGroups: values.get('src/data/tag-groups.json') as SiteBundle['tagGroups'],
    recipes: recipes as SiteBundle['recipes'],
    pages: pages as unknown as SiteBundle['pages'],
  };
}

export function siteBaselinesFromSnapshot(snapshot: SiteConfigurationSnapshot): SiteSourceBaseline[] {
  return snapshot.sources.map(({ path, blobSha, sourceJson }) => ({ path, blobSha, sourceJson }));
}

function currentValueForPath(draft: SiteDraft, path: string): unknown {
  const key = SITE_PATH_KEYS[path];
  if (key) return draft.data.site[key];
  const recipeSlug = path.match(/^src\/content\/recipes\/(.+)\.json$/)?.[1];
  if (recipeSlug) return draft.data.site.recipes.find((recipe) => recipe.slug === recipeSlug);
  const pageSlug = path.match(/^src\/content\/pages\/(.+)\.json$/)?.[1];
  if (pageSlug) return draft.data.site.pages.find((page) => page.slug === pageSlug);
  return undefined;
}

export function sitePublishFiles(draft: SiteDraft): SiteSourceSnapshot[] {
  return draft.data.sources.map((source) => {
    if (!source.blobSha) throw new Error('Reload the GitHub site baseline before publishing.');
    const value = currentValueForPath(draft, source.path);
    if (value === undefined) throw new Error(`${source.path} is missing from the site draft.`);
    return { path: source.path, blobSha: source.blobSha, sourceJson: `${JSON.stringify(value, null, 2)}\n` };
  });
}

export function siteChangedPaths(draft: SiteDraft) {
  return draft.data.sources.flatMap((source) => {
    let before: unknown;
    try { before = JSON.parse(source.sourceJson); } catch { return [source.path]; }
    return sameStructuredValue(before, currentValueForPath(draft, source.path)) ? [] : [source.path];
  });
}
