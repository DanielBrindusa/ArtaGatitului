import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  deploymentStatusForHttp,
  deploymentStatusForResponse,
  pollRecipeDeployment,
  publishedRecipeUrl,
} from '../cms/src/publishing/deploymentStatus.mjs';
import { SITE_CONFIG } from '../src/scripts/build/config.mjs';
import { buildDataIndexes } from '../src/scripts/build/generate-data-assets.mjs';
import { buildSitemapUrls } from '../src/scripts/build/generate-sitemap.mjs';
import { buildRoutePlan, validateRoutePlan } from '../src/scripts/build/routes.mjs';
import { validateContentEntries } from '../src/scripts/validation/content.mjs';

const repositoryRoot = new URL('../', import.meta.url);

async function read(relativePath) {
  return fs.readFile(new URL(relativePath, repositoryRoot), 'utf8');
}

function category() {
  return {
    id: 'fel-principal',
    slug: 'fel-principal',
    title: 'Fel principal',
    name: 'Fel principal',
    description: 'Mancaruri complete.',
    status: 'published',
  };
}

function recipe(overrides = {}) {
  return {
    id: 'reteta-ci',
    slug: 'reteta-ci',
    title: 'Reteta CI',
    name: 'Reteta CI',
    description: 'Fixture outside the production recipe directory.',
    category: 'Fel principal',
    ingredients: ['Apa', 'Sare'],
    steps: ['Fierbe apa.'],
    preparation: ['Fierbe apa.'],
    beforeStart: [],
    tags: { taste: ['Sarat'] },
    equipment: [],
    prepTimeMinutes: 2,
    cookTimeMinutes: 5,
    totalTimeMinutes: 7,
    servings: 1,
    image: null,
    sourceUrl: null,
    createdAt: null,
    updatedAt: null,
    status: 'published',
    closing: 'Pofta buna!',
    extras: [],
    ratingSummary: null,
    keywords: ['reteta'],
    ...overrides,
  };
}

const tagGroups = { taste: { label: 'Gust', options: ['Sarat'] } };

function homepage() {
  return {
    id: 'home',
    pageType: 'home',
    title: 'Arta Gatitului',
    slug: 'home',
    description: 'Retete testate.',
    socialImage: null,
    status: 'published',
    layout: { modelVersion: 1, blocks: [{ id: 'home-main', type: 'section', data: { blocks: [{ id: 'home-title', type: 'heading', data: { text: 'Arta Gatitului', level: 1 } }] } }] },
  };
}

test('valid source content feeds search, randomizer, categories, routes, and sitemap', async () => {
  const sourceRecipe = recipe();
  const result = await validateContentEntries({
    root: process.cwd(),
    categories: [category()],
    recipes: [{ fileName: 'reteta-ci.json', recipe: sourceRecipe }],
    pages: [{ fileName: 'home.json', page: homepage() }],
    tagGroups,
  });
  assert.deepEqual(result.issues, []);

  const content = {
    categories: [category()],
    recipes: [sourceRecipe],
    aliases: {},
    tagGroups,
    ingredientAliases: { aliases: [] },
    pages: [homepage()],
  };
  const indexes = buildDataIndexes(content);
  assert.equal(indexes['search-index.json'][0].slug, sourceRecipe.slug);
  assert.equal(indexes['recipe-index.json'][0].slug, sourceRecipe.slug);
  assert.equal(indexes['recipe-index.json'][0].category, category().name);
  assert.equal(indexes['categories.json'][0].slug, category().slug);

  const routePlan = validateRoutePlan(buildRoutePlan(content));
  assert.ok(routePlan.routes.some((route) => route.filePath === 'retete/reteta-ci/index.html'));
  assert.ok(routePlan.routes.some((route) => route.filePath === 'categorie/fel-principal/index.html'));
  assert.ok(buildSitemapUrls(routePlan).includes(`${SITE_CONFIG.siteUrl}retete/reteta-ci/`));

  const renamedPlan = validateRoutePlan(buildRoutePlan({
    ...content,
    aliases: { 'reteta-ci-veche': 'reteta-ci' },
  }));
  assert.ok(renamedPlan.routes.some((route) => route.filePath === 'retete/reteta-ci-veche/index.html'));
  assert.equal(
    buildSitemapUrls(renamedPlan).includes(`${SITE_CONFIG.siteUrl}retete/reteta-ci-veche/`),
    false,
  );
});

test('invalid recipes, duplicate slugs, and missing local assets fail validation', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arta-validation-'));
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(resolved, { recursive: true, force: true });
  });

  const result = await validateContentEntries({
    root,
    categories: [category()],
    recipes: [
      { fileName: 'first.json', recipe: recipe({ title: '', image: 'assets/images/missing.webp' }) },
      { fileName: 'second.json', recipe: recipe() },
    ],
    pages: [{ fileName: 'home.json', page: homepage() }],
    tagGroups,
  });

  assert.ok(result.issues.some((issue) => issue.includes('title is required')));
  assert.ok(result.issues.some((issue) => issue.includes('duplicate slug')));
  assert.ok(result.issues.some((issue) => issue.includes('image asset does not exist')));
});

test('production URLs retain the GitHub Pages project base path', () => {
  assert.equal(SITE_CONFIG.siteUrl, 'https://danielbrindusa.github.io/ArtaGatitului/');
  assert.equal(
    publishedRecipeUrl('reteta-ci'),
    'https://danielbrindusa.github.io/ArtaGatitului/retete/reteta-ci/',
  );
  assert.throws(() => publishedRecipeUrl('../unsafe'), /slug/);
});

test('deployment polling reports building, deployed, and failed without workflow-write permissions', async () => {
  const statuses = [];
  const commitSha = 'a'.repeat(40);
  const responses = [
    { status: 404, text: async () => '' },
    { status: 200, text: async () => `<meta name="arta-build-version" content="${commitSha}">` },
  ];
  const deployed = await pollRecipeDeployment({
    slug: 'reteta-ci',
    commitSha,
    attempts: 2,
    intervalMs: 0,
    waitFor: async () => undefined,
    fetcher: async () => responses.shift(),
    onStatus: (status) => statuses.push(status),
  });
  assert.equal(deployed, 'deployed');
  assert.deepEqual(statuses, ['building', 'deployed']);
  assert.equal(deploymentStatusForHttp(403), 'unknown');
  assert.equal(
    await deploymentStatusForResponse({ status: 200, text: async () => '<html>older build</html>' }, commitSha),
    'building',
  );

  let deletionCheckUrl = '';
  await pollRecipeDeployment({
    slug: null,
    commitSha,
    attempts: 1,
    fetcher: async (url) => {
      deletionCheckUrl = url;
      return { status: 200, text: async () => `<meta name="arta-build-version" content="${commitSha}">` };
    },
  });
  assert.match(deletionCheckUrl, /^https:\/\/danielbrindusa\.github\.io\/ArtaGatitului\/\?deployment=/);
});

test('workflow validates both branches and deploys only main with least privilege', async () => {
  const [workflow, packageJson] = await Promise.all([
    read('.github/workflows/site.yml'),
    read('package.json'),
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.match(workflow, /branches:\s*\n\s*- main\s*\n\s*- app-development/g);
  const releaseGuard = /\(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\) && github\.ref == 'refs\/heads\/main'/g;
  assert.equal([...workflow.matchAll(releaseGuard)].length, 2);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run pages:build/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /contents:\s*write|pull-requests:\s*write|secrets\.|personal.access|\bPAT\b/i);
  assert.match(scripts['pages:build'], /check:all.*pages:package/);
});
