import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { BLOCK_TYPES, BLOCK_TYPE_VALUES } from '../src/shared/blocks/model.mjs';
import { layoutClassNames } from '../src/shared/blocks/layout.mjs';
import { renderLayoutTokenCss } from '../src/shared/design/tokens.mjs';
import { renderBlock } from '../src/shared/render/blocks.mjs';
import { validateBlock } from '../src/shared/validation/blocks.mjs';

test('block schema and executable registry expose the same block types', async () => {
  const schema = JSON.parse(await fs.readFile('src/schema/block.schema.json', 'utf8'));
  assert.deepEqual(schema.properties.type.enum, BLOCK_TYPE_VALUES);
});

test('every registered initial block type has a valid structured form', () => {
  const blocks = [
    { id: 'section', type: 'section', data: { blocks: [] } },
    { id: 'heading', type: 'heading', data: { text: 'Titlu', level: 2 } },
    { id: 'text', type: 'text', data: { text: 'Text' } },
    { id: 'rich-text', type: 'rich-text', data: { paragraphs: ['Paragraf'] } },
    { id: 'image', type: 'image', data: { src: '/imagini/test.jpg', alt: 'Preparat' } },
    { id: 'divider', type: 'divider', data: {} },
    { id: 'spacer', type: 'spacer', data: { size: 'md' } },
    { id: 'button', type: 'button', data: { label: 'Deschide', href: './reteta/' } },
    { id: 'recipe-hero', type: 'recipe-hero', data: {} },
    { id: 'recipe-metadata', type: 'recipe-metadata', data: {} },
    { id: 'ingredients', type: 'ingredients', data: {} },
    { id: 'before-starting', type: 'before-starting', data: {} },
    { id: 'equipment', type: 'equipment', data: {} },
    { id: 'instructions', type: 'instructions', data: {} },
    { id: 'rating', type: 'rating', data: {} },
    { id: 'related-recipes', type: 'related-recipes', data: {} },
  ];

  assert.deepEqual(blocks.map((block) => block.type), BLOCK_TYPE_VALUES);
  blocks.forEach((block) => assert.deepEqual(validateBlock(block), { valid: true, errors: [] }));
});

test('valid nested blocks accept constrained responsive layout', () => {
  const block = {
    id: 'recipe-content',
    type: BLOCK_TYPES.SECTION,
    data: {
      blocks: [{
        id: 'recipe-title',
        type: BLOCK_TYPES.HEADING,
        data: { text: 'Titlu', level: 2 },
        layout: { width: 'medium', columns: 1, gap: 'md', paddingBlock: 'sm', align: 'start' },
        responsive: { mobile: { width: 'full', columns: 1, gap: 'sm', visible: true } },
      }],
    },
    layout: { width: 'wide', columns: 2, gap: 'lg' },
  };

  assert.deepEqual(validateBlock(block), { valid: true, errors: [] });
  assert.equal(
    layoutClassNames(block.layout, { mobile: { columns: 1, visible: true } }),
    'layout-width-wide layout-columns-2 layout-gap-lg layout-mobile-columns-1',
  );
  assert.match(renderLayoutTokenCss(), /\.layout-mobile-columns-1/);
});

test('unknown blocks, unsafe URLs, arbitrary fields, and unsupported layout values are rejected', () => {
  const invalidBlocks = [
    { id: 'bad-type', type: 'script', data: {} },
    { id: 'bad-layout', type: BLOCK_TYPES.DIVIDER, data: {}, layout: { columns: 12 } },
    { id: 'bad-action', type: BLOCK_TYPES.BUTTON, data: { label: 'Rulează', href: 'javascript:alert(1)' } },
    { id: 'bad-obfuscated-action', type: BLOCK_TYPES.BUTTON, data: { label: 'Rulează', href: 'java\nscript:alert(1)' } },
    { id: 'bad-protocol-relative', type: BLOCK_TYPES.IMAGE, data: { src: '//example.com/image.jpg', alt: 'Imagine' } },
    { id: 'bad-field', type: BLOCK_TYPES.TEXT, data: { text: 'Salut', onClick: 'alert(1)' } },
    { id: 'bad-style', type: BLOCK_TYPES.TEXT, data: { text: 'Salut' }, style: { css: 'position:absolute' } },
  ];

  invalidBlocks.forEach((block) => assert.equal(validateBlock(block).valid, false));
});

test('text blocks escape markup instead of emitting executable content', () => {
  const html = renderBlock({
    id: 'safe-text',
    type: BLOCK_TYPES.RICH_TEXT,
    data: { paragraphs: ['Salut <script>alert(1)</script>'] },
  });

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/i);
});
