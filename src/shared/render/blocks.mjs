import { BLOCK_TYPES } from '../blocks/model.mjs';
import { layoutClassNames } from '../blocks/layout.mjs';
import { assertValidBlock } from '../validation/blocks.mjs';
import { escapeHtml } from '../utils/html.mjs';
import {
  renderBeforeStarting,
  renderRecipeEquipment,
  renderRecipeHero,
  renderRecipeIngredients,
  renderRecipeInstructions,
  renderRecipeMetadata,
  renderRecipeRating,
  renderRelatedRecipes,
} from './recipe.mjs';

function requireRecipe(context, type) {
  if (!context.recipe) throw new Error(`Block "${type}" requires a recipe in the render context.`);
  return context.recipe;
}

function renderBlockContent(block, context) {
  const { data } = block;
  switch (block.type) {
    case BLOCK_TYPES.SECTION:
      return renderBlockTree(data.blocks, context);
    case BLOCK_TYPES.HEADING:
      return `<h${data.level}>${escapeHtml(data.text)}</h${data.level}>`;
    case BLOCK_TYPES.TEXT:
      return `<p>${escapeHtml(data.text)}</p>`;
    case BLOCK_TYPES.RICH_TEXT:
      return data.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
    case BLOCK_TYPES.IMAGE:
      return `<figure><img src="${escapeHtml(data.src)}" alt="${escapeHtml(data.alt)}" loading="${data.loading || 'lazy'}">${data.caption ? `<figcaption>${escapeHtml(data.caption)}</figcaption>` : ''}</figure>`;
    case BLOCK_TYPES.DIVIDER:
      return '<hr>';
    case BLOCK_TYPES.SPACER:
      return `<div class="block-spacer block-spacer-${data.size}" aria-hidden="true"></div>`;
    case BLOCK_TYPES.BUTTON: {
      const target = data.target || '_self';
      const rel = target === '_blank' ? ' rel="noopener noreferrer"' : '';
      return `<a class="btn${block.variant === 'secondary' ? ' secondary' : ''}" href="${escapeHtml(data.href)}" target="${target}"${rel}>${escapeHtml(data.label)}</a>`;
    }
    case BLOCK_TYPES.RECIPE_HERO:
      return renderRecipeHero(requireRecipe(context, block.type), context.root || '', data);
    case BLOCK_TYPES.RECIPE_METADATA:
      return renderRecipeMetadata(requireRecipe(context, block.type), context.root || '', data);
    case BLOCK_TYPES.INGREDIENTS:
      return renderRecipeIngredients(requireRecipe(context, block.type), data);
    case BLOCK_TYPES.BEFORE_STARTING:
      return renderBeforeStarting(requireRecipe(context, block.type), data);
    case BLOCK_TYPES.EQUIPMENT:
      return renderRecipeEquipment(requireRecipe(context, block.type), data);
    case BLOCK_TYPES.INSTRUCTIONS:
      return renderRecipeInstructions(requireRecipe(context, block.type), data);
    case BLOCK_TYPES.RATING:
      return renderRecipeRating(requireRecipe(context, block.type), data);
    case BLOCK_TYPES.RELATED_RECIPES:
      return renderRelatedRecipes(
        requireRecipe(context, block.type),
        context.root || '',
        context.recipes || [],
        data,
      );
    default:
      throw new Error(`No renderer registered for block type "${block.type}".`);
  }
}

function blockClassNames(block) {
  return [
    'content-block',
    `content-block-${block.type}`,
    block.variant && `content-block-variant-${block.variant}`,
    block.style?.tone && `content-block-tone-${block.style.tone}`,
    block.style?.surface && `content-block-surface-${block.style.surface}`,
    block.style?.radius && `content-block-radius-${block.style.radius}`,
    layoutClassNames(block.layout, block.responsive),
  ].filter(Boolean).join(' ');
}

function renderBlockWrapper(block, content) {
  return `<div id="${escapeHtml(block.id)}" class="${blockClassNames(block)}">${content}</div>`;
}

export function renderBlock(block, context = {}) {
  assertValidBlock(block);
  return renderBlockWrapper(block, renderBlockContent(block, context));
}

export function renderBlockTree(blocks, context = {}) {
  if (!Array.isArray(blocks)) throw new Error('Block tree must be an array.');
  return blocks.map((block) => renderBlock(block, context)).join('');
}
