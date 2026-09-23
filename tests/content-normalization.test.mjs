import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRecipe } from '../src/shared/content/normalize.mjs';
import { validateRecipeSource } from '../src/shared/validation/recipe.mjs';
import { loadContent } from '../src/scripts/build/content-loader.mjs';

test('legacy recipe fields normalize without losing content', () => {
  const source = {
    name: 'Supă de test',
    category: 'Fel principal',
    ingredients: [' Apă ', 'Sare'],
    preparation: [' Fierbe apa. '],
    beforeStart: ['Pregătește oala.'],
    tags: { equipment: ['La oală'] },
    closing: 'Gata!',
    status: 'published',
    customLegacyField: 'preserved',
  };

  const recipe = normalizeRecipe(source, 'legacy.json');

  assert.equal(recipe.slug, 'supa-de-test');
  assert.equal(recipe.title, source.name);
  assert.equal(recipe.name, source.name);
  assert.deepEqual(recipe.ingredients, ['Apă', 'Sare']);
  assert.deepEqual(recipe.steps, ['Fierbe apa.']);
  assert.deepEqual(recipe.preparation, recipe.steps);
  assert.deepEqual(recipe.equipment, ['La oală']);
  assert.equal(recipe.closing, 'Gata!');
  assert.equal(recipe.customLegacyField, 'preserved');
});

test('shared recipe validation rejects unsafe URLs and invalid controlled values', () => {
  const result = validateRecipeSource({
    slug: 'reteta-test',
    title: 'Rețetă test',
    category: 'Fel principal',
    ingredients: ['Apă'],
    steps: ['Fierbe.'],
    status: 'published',
    image: 'javascript:alert(1)',
    prepTimeMinutes: -1,
    ratingSummary: { totalRatings: -2, overallAverage: 9 },
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.startsWith('image must')));
  assert.ok(result.errors.some((message) => message.startsWith('prepTimeMinutes must')));
  assert.ok(result.errors.some((message) => message.startsWith('ratingSummary.totalRatings must')));
  assert.ok(result.errors.some((message) => message.startsWith('ratingSummary.overallAverage must')));
});

test('all existing recipes load through the shared normalized model', async () => {
  const content = await loadContent();
  assert.equal(content.recipes.length, 37);

  const steak = content.recipes.find((recipe) => recipe.slug === 'steak-de-vita');
  assert.ok(steak);
  assert.equal(steak.title, 'Steak de vita');
  assert.equal(steak.name, steak.title);
  assert.ok(steak.ingredients.length > 20);
  assert.ok(steak.steps.length > 10);
  assert.ok(steak.beforeStart.length > 0);
  assert.ok(steak.equipment.length > 0);
  assert.equal(steak.extras[0].type, 'steak-calculator');

  const noEquipment = content.recipes.find((recipe) => recipe.slug === 'fructe-cu-nutella');
  assert.deepEqual(noEquipment.equipment, []);
  assert.equal(noEquipment.status, 'published');
});
