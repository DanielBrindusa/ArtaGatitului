import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  assertGlobalBlockDeletion,
  collectGlobalBlockUsage,
  deleteCategoryWithReplacement,
  detachFromTemplate,
  detachGlobalBlockReference,
  mergeTag,
  renameCategory,
  renderSiteThemeCss,
  reorderNavigationItems,
  replaceTemplateAndDelete,
  resetTheme,
  resetToTemplate,
  resolveTemplateLayout,
  updateTemplateBlockOverride,
  validateNavigation,
  validateTheme,
} from '../src/shared/site/model.mjs';

async function json(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

function layout() {
  return {
    modelVersion: 1,
    blocks: [
      { id: 'ingredients-local', type: 'ingredients', data: { style: 'checkbox' }, layout: { width: 'wide', paddingBlock: 'lg' }, variant: 'default' },
      { id: 'hero-local', type: 'recipe-hero', data: {}, layout: { width: 'wide', paddingBlock: 'sm' }, variant: 'default' },
    ],
  };
}

test('template defaults, explicit overrides, detach, and reset have one predictable inheritance level', async () => {
  const templates = (await json('src/content/site/templates.json')).templates;
  const assignment = { id: 'recipe-default', mode: 'linked', overrides: { ingredients: { layout: { width: 'narrow' } } } };
  const effective = resolveTemplateLayout(layout(), assignment, templates);
  assert.deepEqual(effective.blocks.map((block) => block.type), ['recipe-hero', 'ingredients']);
  assert.equal(effective.blocks[1].layout.width, 'narrow');
  assert.equal(effective.blocks[1].layout.paddingBlock, 'sm');

  const edited = updateTemplateBlockOverride(assignment, templates, effective.blocks[1], {
    layout: { paddingBlock: 'lg' },
    responsive: { mobile: { width: 'full', visible: false } },
  });
  const editedAgain = updateTemplateBlockOverride(edited, templates, effective.blocks[1], {
    responsive: { mobile: { visible: true } },
  });
  assert.deepEqual(editedAgain.overrides.ingredients, {
    layout: { width: 'narrow', paddingBlock: 'lg' },
    responsive: { mobile: { width: 'full', visible: true } },
  });

  const detached = detachFromTemplate({ layout: layout(), template: assignment }, templates);
  assert.equal(detached.template.mode, 'detached');
  assert.equal(detached.template.id, null);
  assert.deepEqual(detached.layout, effective);

  const reset = resetToTemplate(detached, 'recipe-default');
  assert.deepEqual(reset.template, { id: 'recipe-default', mode: 'linked', overrides: {} });
});

test('template deletion requires a compatible replacement and never orphans linked content', async () => {
  const templates = (await json('src/content/site/templates.json')).templates;
  const contents = [{ id: 'one', title: 'One', template: { id: 'recipe-dessert', mode: 'linked', overrides: { hero: { variant: 'compact' } } } }];
  assert.throws(() => replaceTemplateAndDelete(templates, contents, 'recipe-dessert', 'page-standard'), /compatible replacement/);
  const outcome = replaceTemplateAndDelete(templates, contents, 'recipe-dessert', 'recipe-default');
  assert.equal(outcome.templates.some((template) => template.id === 'recipe-dessert'), false);
  assert.deepEqual(outcome.contents[0].template, { id: 'recipe-default', mode: 'linked', overrides: {} });
});

test('global references report usage, detach as local content, and block unsafe deletion', async () => {
  const globals = (await json('src/content/site/global-blocks.json')).blocks;
  const reference = { id: 'home-random', type: 'global-reference', data: { globalId: 'global-random-recipe' } };
  const pages = [{ id: 'home', slug: 'home', title: 'Home', layout: { modelVersion: 1, blocks: [{ id: 'root', type: 'section', data: { blocks: [reference] } }] } }];
  assert.equal(collectGlobalBlockUsage(pages, 'global-random-recipe').length, 1);
  assert.throws(() => assertGlobalBlockDeletion('global-random-recipe', pages), /used on 1 page/);
  const local = detachGlobalBlockReference(reference, globals, 'home-random-local');
  assert.equal(local.id, 'home-random-local');
  assert.equal(local.type, 'random-recipe');
  assert.notEqual(local, globals[0].block);
});

test('navigation reorders safely and rejects missing targets and excessive submenu depth', async () => {
  const navigation = await json('src/content/site/navigation.json');
  const reordered = reorderNavigationItems(navigation.header.primaryItems, 0, 2);
  assert.equal(reordered[2].id, navigation.header.primaryItems[0].id);
  assert.equal(navigation.header.primaryItems[0].id, 'portfolio');

  const invalidTarget = structuredClone(navigation);
  invalidTarget.header.menuItems[0] = { id: 'missing-page', label: 'Missing', type: 'page', target: 'does-not-exist', children: [] };
  assert.match(validateNavigation(invalidTarget, { pageSlugs: ['home'], categorySlugs: [], recipeSlugs: [] }).errors.join('\n'), /missing page/);

  const tooDeep = structuredClone(navigation);
  tooDeep.header.primaryItems = [{ id: 'level-one', label: 'One', type: 'group', target: '', children: [{ id: 'level-two', label: 'Two', type: 'group', target: '', children: [{ id: 'level-three', label: 'Three', type: 'home', target: 'home', children: [] }] }] }];
  assert.match(validateNavigation(tooDeep, { pageSlugs: [], categorySlugs: [], recipeSlugs: [] }).errors.join('\n'), /maximum submenu depth/);
});

test('category rename and replacement deletion migrate recipes and navigation coherently', async () => {
  const categories = await json('src/content/categories.json');
  const navigation = await json('src/content/site/navigation.json');
  const recipes = [{ slug: 'cake', title: 'Cake', category: 'Desert', tags: {} }];
  const renamed = renameCategory(categories, recipes, navigation, 'desert', { title: 'Deserturi', slug: 'deserturi' });
  assert.equal(renamed.recipes[0].category, 'Deserturi');
  assert.equal(renamed.navigation.header.menuItems.find((item) => item.id === 'category-desert').target, 'deserturi');
  assert.deepEqual(renamed.routeChange, { from: 'desert', to: 'deserturi' });

  const deleted = deleteCategoryWithReplacement(renamed.categories, renamed.recipes, 'desert', 'fel-principal');
  assert.equal(deleted.affectedRecipes, 1);
  assert.equal(deleted.recipes[0].category, 'Fel principal');
  assert.equal(deleted.categories.some((category) => category.id === 'desert'), false);
});

test('tag merge is deduplicated and reports affected recipes', () => {
  const recipes = [
    { slug: 'one', tags: { taste: ['Dulce', 'Aromat'] } },
    { slug: 'two', tags: { taste: ['Aromat'] } },
  ];
  const outcome = mergeTag(recipes, 'taste', 'Dulce', 'Aromat');
  assert.equal(outcome.affectedRecipes, 1);
  assert.deepEqual(outcome.recipes[0].tags.taste, ['Aromat']);
});

test('theme accepts controlled tokens, rejects CSS-like input, and resets exactly', async () => {
  const theme = await json('src/content/site/theme.json');
  assert.equal(validateTheme(theme).valid, true);
  const unsafe = structuredClone(theme);
  unsafe.colors.primary = 'url(javascript:alert(1))';
  assert.equal(validateTheme(unsafe).valid, false);
  assert.match(validateTheme(unsafe).errors.join('\n'), /hex color/);
  assert.deepEqual(resetTheme(), theme);
  const css = renderSiteThemeCss(theme);
  assert.match(css, /--color-primary:#ff8a5b/);
  assert.doesNotMatch(css, /url\(/i);
});

test('native global publication allowlist and stale-state checks remain narrow', async () => {
  const [native, permission] = await Promise.all([
    fs.readFile('src-tauri/src/github/mod.rs', 'utf8'),
    fs.readFile('src-tauri/permissions/github-publishing.toml', 'utf8'),
  ]);
  for (const path of ['src/content/site/templates.json', 'src/content/site/global-blocks.json', 'src/content/site/navigation.json', 'src/content/site/settings.json', 'src/content/site/theme.json', 'src/content/categories.json', 'src/data/tag-groups.json']) {
    assert.match(native, new RegExp(path.replace(/[/.]/g, '\\$&')));
  }
  assert.match(native, /current\.sha != file\.blob_sha/);
  assert.match(native, /changed in GitHub after this draft began/);
  assert.match(native, /submitted_paths != expected_paths/);
  assert.match(permission, /github_load_site_configuration/);
  assert.match(permission, /github_prepare_site_publish/);
  assert.doesNotMatch(permission, /github_write_arbitrary|filesystem_write/);
});

test('generated pages consume structured navigation, theme, and template output', async () => {
  const [home, recipe, css, generator] = await Promise.all([
    fs.readFile('dist/generated/index.html', 'utf8'),
    fs.readFile('dist/generated/retete/steak-de-vita/index.html', 'utf8'),
    fs.readFile('dist/generated/assets/css/style.css', 'utf8'),
    fs.readFile('build-static-site.mjs', 'utf8'),
  ]);
  assert.match(home, /Arta Gătitului/);
  assert.match(css, /--color-primary:#ff8a5b/);
  assert.match(css, /\.nav-submenu/);
  assert.match(home, /Portofoliu/);
  assert.match(home, /Creator rețetă/);
  assert.match(recipe, /recipe-hero/);
  assert.match(generator, /resolveTemplateLayout\(content\.layout, content\.template/);
  assert.match(generator, /nav-item has-submenu/);
});
