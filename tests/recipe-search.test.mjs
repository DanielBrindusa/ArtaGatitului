import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { buildDataIndexes } from '../src/scripts/build/generate-data-assets.mjs';
import { normalizeRecipe } from '../src/shared/content/normalize.mjs';

function recipe(overrides = {}) {
  return {
    slug: 'reteta-test',
    title: 'Pui rumenit',
    category: 'Cina',
    description: 'Descriere savuroasa',
    ingredients: ['Pui', 'Usturoi', 'Ulei', 'Sare', 'Piper', 'Lamaie'],
    keywords: ['familie'],
    tags: { texture: ['Crocant'] },
    preparation: ['Toarna sosul peste pui.'],
    steps: ['Amesteca delicat.'],
    beforeStart: ['Preincalzeste cuptorul.'],
    ...overrides,
  };
}

function searchRecord(source) {
  return buildDataIndexes({ categories: [], recipes: [source] })['search-index.json'][0];
}

test('search indexes only titles, all ingredients, keywords, and tags', () => {
  const source = recipe();
  const record = searchRecord(source);
  for (const word of ['pui', 'rumenit', 'usturoi', 'lamaie', 'familie', 'crocant']) {
    assert.ok(record.tokens.includes(word), `Missing allowed field token: ${word}`);
  }
  for (const word of ['cina', 'descriere', 'savuroasa', 'toarna', 'peste', 'delicat', 'preincalzeste']) {
    assert.ok(!record.tokens.includes(word), `Unexpected excluded field token: ${word}`);
    assert.ok(!record.searchText.includes(word));
  }
  assert.equal(record.category, source.category);
  assert.equal(record.description, source.description);
  assert.equal(record.ingredients.length, 5);
});

test('generated keywords cannot reintroduce excluded search fields', () => {
  for (const keywords of [undefined, []]) {
    const source = recipe({ keywords });
    for (const value of [source, normalizeRecipe(source)]) {
      const record = searchRecord(value);
      assert.ok(record.tokens.includes('rumenit'));
      assert.ok(record.tokens.includes('lamaie'));
      assert.ok(record.tokens.includes('crocant'));
      for (const word of ['cina', 'savuroasa', 'peste', 'preincalzeste', 'delicat']) {
        assert.ok(!record.tokens.includes(word), `Generated keyword leaked: ${word}`);
      }
    }
  }
});

test('explicit keywords and legacy recipe names remain searchable', () => {
  const source = recipe({ title: undefined, name: 'Reteta veche', keywords: ['Peste', 'Cina'] });
  for (const word of ['reteta', 'veche', 'peste', 'cina']) {
    assert.ok(searchRecord(source).tokens.includes(word));
  }
});

test('browser search preserves full-word, multiword, and accent-insensitive matching', async () => {
  const script = await readFile(new URL('../dist/generated/assets/js/site.js', import.meta.url), 'utf8');
  const functions = ['normalize', 'tokenizeText', 'normalizedTagGroups', 'flatTags', 'recipeSearchTokens', 'recipeMatchesSearch'];
  const source = functions.map((name) => {
    const match = script.match(new RegExp(`^  function ${name}\\([^]*?^  }`, 'm'));
    assert.ok(match, `Missing generated browser function: ${name}`);
    return match[0];
  }).join('\n');
  const matches = runInNewContext(`${source}\n(recipe, query) => recipeMatchesSearch(recipe, tokenizeText(query))`);
  const chicken = recipe();
  const fish = recipe({ title: 'Pe\u0219te la cuptor' });
  const oats = recipe({ title: 'Ovaz peste noapte' });

  for (const input of [chicken, searchRecord(chicken), { searchText: searchRecord(chicken).searchText }]) {
    assert.equal(matches(input, 'peste'), false);
    assert.equal(matches(input, 'cina'), false);
    assert.equal(matches(input, 'savuroasa'), false);
    assert.equal(matches(input, 'preincalzeste'), false);
    assert.equal(matches(input, 'PUI lamaie familie crocant'), true);
    assert.equal(matches(input, 'pui peste'), false);
    assert.equal(matches(input, 'pu'), false);
    assert.equal(matches(input, ''), true);
  }
  for (const input of [fish, searchRecord(fish), oats, searchRecord(oats)]) {
    assert.equal(matches(input, 'peste'), true);
    assert.equal(matches(input, 'PE\u0218TE'), true);
  }
});
