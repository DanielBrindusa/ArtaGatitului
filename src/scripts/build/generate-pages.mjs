import path from 'node:path';
import { DEFAULT_SOON_SECTION, ROOT } from './config.mjs';
import { writeTextFile } from './html-utils.mjs';

export async function generatePages(content, renderers) {
  const { categories, recipes, aliases } = content;

  await writeTextFile(path.join(ROOT, 'index.html'), renderers.homePage());
  await writeTextFile(path.join(ROOT, 'adauga-reteta.html'), renderers.recipeBuilderPage());
  await writeTextFile(path.join(ROOT, 'categorii.html'), renderers.categoriesIndexPage());
  await writeTextFile(path.join(ROOT, 'cauta.html'), renderers.searchPage());
  await writeTextFile(path.join(ROOT, 'ce-pot-gati.html'), renderers.ingredientMatcherPage());
  await writeTextFile(path.join(ROOT, 'offline.html'), renderers.offlinePage());
  await writeTextFile(path.join(ROOT, 'portofoliu', 'index.html'), renderers.portfolioPage());
  await writeTextFile(path.join(ROOT, 'randomizer', 'index.html'), renderers.randomizerPage());
  await writeTextFile(path.join(ROOT, 'soon-to-come', 'index.html'), renderers.soonPage(DEFAULT_SOON_SECTION));

  for (const category of categories) {
    await writeTextFile(path.join(ROOT, 'categorie', category.slug, 'index.html'), renderers.categoryPage(category));
    await writeTextFile(path.join(ROOT, category.slug, 'index.html'), renderers.categoryPage(category, '../'));
  }

  const recipeBySlug = new Map(recipes.map((recipe) => [recipe.slug, recipe]));
  for (const recipe of recipes) {
    await writeTextFile(path.join(ROOT, 'retete', recipe.slug, 'index.html'), renderers.recipePage(recipe, '../../', recipe.slug, content));
    await writeTextFile(path.join(ROOT, recipe.slug, 'index.html'), renderers.recipePage(recipe, '../', recipe.slug, content));
  }

  for (const [alias, target] of Object.entries(aliases || {})) {
    const recipe = recipeBySlug.get(target);
    await writeTextFile(path.join(ROOT, 'retete', alias, 'index.html'), renderers.recipePage(recipe, '../../', alias, content));
    await writeTextFile(path.join(ROOT, alias, 'index.html'), renderers.recipePage(recipe, '../', alias, content));
  }
}
