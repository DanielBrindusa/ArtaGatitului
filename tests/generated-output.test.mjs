import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { loadContent } from '../src/scripts/build/content-loader.mjs';
import { renderRecipeDetail } from '../src/shared/render/recipe.mjs';

const REPRESENTATIVE_SLUGS = [
  'steak-de-vita',
  'avocado-cu-bacon',
  'fructe-cu-nutella',
  'pui-dulce-acrisor-cu-orez',
];

test('representative generated recipe pages use the shared renderer output', async () => {
  const content = await loadContent();
  for (const slug of REPRESENTATIVE_SLUGS) {
    const recipe = content.recipes.find((item) => item.slug === slug);
    assert.ok(recipe, `missing representative recipe ${slug}`);
    const generatedPage = (await fs.readFile(`retete/${slug}/index.html`, 'utf8')).replace(/\r\n/g, '\n');
    const renderedDetail = renderRecipeDetail(recipe, '../../', slug, content).replace(/\r\n/g, '\n');
    assert.ok(generatedPage.includes(renderedDetail), `${slug} does not contain the shared renderer output`);
  }
});
