import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRecipe } from '../src/shared/content/normalize.mjs';
import { renderBlock } from '../src/shared/render/blocks.mjs';
import { renderRecipeDetail, renderRecipeIngredients } from '../src/shared/render/recipe.mjs';

function sampleRecipe(overrides = {}) {
  return normalizeRecipe({
    slug: 'reteta-test',
    title: 'Rețetă test',
    description: 'Descriere sigură',
    category: 'Fel principal',
    ingredients: ['Apă', 'Sare'],
    steps: ['Amestecă.', 'Servește.'],
    beforeStart: ['Pregătește vasul.'],
    equipment: ['Oală'],
    tags: { complexity: ['Ușor'] },
    status: 'published',
    closing: 'Poftă bună!',
    ...overrides,
  });
}

test('shared recipe renderer includes the established recipe presentation', () => {
  const recipe = sampleRecipe({
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    ratingSummary: { totalRatings: 2, overallAverage: 4.5, cookAgainPercent: 100 },
  });
  const html = renderRecipeDetail(recipe, '../../', recipe.slug, { recipes: [recipe], tagGroups: {} });

  assert.match(html, /class="recipe-hero"/);
  assert.match(html, /Rețetă test/);
  assert.match(html, /Pregătire<\/span><strong>10 minute/);
  assert.match(html, /Echipament<\/span><strong>Oală/);
  assert.match(html, /Înainte să începi/);
  assert.match(html, /Ingrediente/);
  assert.match(html, /Mod de preparare/);
  assert.match(html, /Etichete rețetă/);
  assert.match(html, /General<\/span><strong>4\.5\/5/);
  assert.match(html, /Rețete similare/);
});

test('recipe renderer escapes dangerous recipe fields', () => {
  const recipe = sampleRecipe({
    title: 'Titlu <script>alert(1)</script>',
    description: '<img src=x onerror=alert(1)>',
    ingredients: ['<script>alert(2)</script>'],
    steps: ['<svg onload=alert(3)>'],
  });
  const html = renderRecipeDetail(recipe, '../../', recipe.slug, { recipes: [], tagGroups: {} });

  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /<img src=x/i);
  assert.doesNotMatch(html, /<svg onload/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('recipe blocks delegate to the same recipe primitives used by static pages', () => {
  const recipe = sampleRecipe();
  const html = renderBlock(
    { id: 'ingredients', type: 'ingredients', data: {} },
    { recipe, root: '../../' },
  );

  assert.ok(html.includes(renderRecipeIngredients(recipe)));
});

test('image blocks allow safe images while escaping labels', () => {
  const html = renderBlock({
    id: 'recipe-image',
    type: 'image',
    data: {
      src: 'https://example.com/recipe.jpg',
      alt: 'Preparat <gata>',
      caption: 'Servire & decor',
    },
  });

  assert.match(html, /src="https:\/\/example\.com\/recipe\.jpg"/);
  assert.match(html, /alt="Preparat &lt;gata&gt;"/);
  assert.match(html, /Servire &amp; decor/);
});
