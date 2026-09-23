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
  renderRecipeCard,
} from './recipe.mjs';

function renderHeading(data) {
  if (!data.eyebrow && !data.heading) return '';
  return `<div class="section-head"><div>${data.eyebrow ? `<p class="eyebrow">${escapeHtml(data.eyebrow)}</p>` : ''}${data.heading ? `<h2>${escapeHtml(data.heading)}</h2>` : ''}</div></div>`;
}

function renderRichTextSpan(span) {
  let value = escapeHtml(span.text);
  if (span.bold) value = `<strong>${value}</strong>`;
  if (span.italic) value = `<em>${value}</em>`;
  if (span.href) value = `<a href="${escapeHtml(span.href)}">${value}</a>`;
  return value;
}

function renderRichText(data) {
  return data.nodes.map((node) => {
    if (node.type === 'paragraph') return `<p>${node.children.map(renderRichTextSpan).join('')}</p>`;
    if (node.type === 'heading') return `<h${node.level}>${node.children.map(renderRichTextSpan).join('')}</h${node.level}>`;
    const tag = node.type === 'numbered-list' ? 'ol' : 'ul';
    return `<${tag}>${node.items.map((item) => `<li>${item.map(renderRichTextSpan).join('')}</li>`).join('')}</${tag}>`;
  }).join('');
}

function selectedRecipes(block, context) {
  const recipes = Array.isArray(context.recipes) ? context.recipes : [];
  const data = block.data;
  if (block.type === BLOCK_TYPES.LATEST_RECIPES || data.source === 'latest') {
    return [...recipes].sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || ''))).slice(0, data.limit);
  }
  if (data.source === 'category') return recipes.filter((recipe) => recipe.category === data.category).slice(0, data.limit);
  if (data.source === 'tag') {
    return recipes.filter((recipe) => Object.values(recipe.tags || {}).flat().includes(data.tag)).slice(0, data.limit);
  }
  const slugs = new Set(Array.isArray(data.slugs) ? data.slugs : []);
  const selected = slugs.size ? recipes.filter((recipe) => slugs.has(recipe.slug)) : recipes;
  return selected.slice(0, data.limit);
}

function renderRecipeDiscovery(block, context) {
  const recipes = selectedRecipes(block, context);
  const root = context.root || '';
  const cards = recipes.map((recipe) => renderRecipeCard(recipe, root)).join('');
  const homeTarget = context.page?.pageType === 'home' && block.type === BLOCK_TYPES.FEATURED_RECIPES
    ? ' id="featuredRecipes"'
    : '';
  return `${renderHeading(block.data)}<div${homeTarget} class="grid cards page-recipe-grid page-recipe-grid-${block.data.columns || 3}">${cards}</div>`;
}

function renderCategoryGrid(block, context) {
  const requested = new Set(block.data.slugs || []);
  const categories = (context.categories || []).filter((category) => !requested.size || requested.has(category.slug));
  const counts = new Map();
  (context.recipes || []).forEach((recipe) => counts.set(recipe.category, (counts.get(recipe.category) || 0) + 1));
  const root = context.root || '';
  const cards = categories.map((category) => `
    <a class="card category-card" href="${escapeHtml(`${root}categorie/${category.slug}/`)}">
      <p class="eyebrow">${escapeHtml(String(counts.get(category.name || category.title) || 0))} rețete</p>
      <h3>${escapeHtml(category.name || category.title)}</h3>
      <p>${escapeHtml(category.description || '')}</p>
    </a>`).join('');
  const homeTarget = context.page?.pageType === 'home' ? ' id="categoryGrid"' : '';
  return `${renderHeading(block.data)}<div${homeTarget} class="grid categories">${cards}</div>`;
}

function renderHero(data, context) {
  const root = context.root || '';
  const search = data.showSearch === false ? '' : `
    <form class="hero-search" action="${escapeHtml(`${root}cauta.html`)}" method="get" role="search">
      <label class="sr-only" for="${escapeHtml(`${context.page?.id || 'page'}-search`)}">${escapeHtml(data.searchPlaceholder || 'Caută după ingredient, rețetă sau etichetă')}</label>
      <input id="${escapeHtml(`${context.page?.id || 'page'}-search`)}" name="q" type="search" placeholder="${escapeHtml(data.searchPlaceholder || 'Caută după ingredient, rețetă sau etichetă')}" autocomplete="off">
      <button class="btn" type="submit">Caută</button>
    </form>`;
  const actions = data.showRandomRecipe || data.secondaryAction ? `<div class="hero-actions">
    ${data.showRandomRecipe ? '<button class="btn" type="button" id="surpriseRecipeButton">Surprinde-mă cu o rețetă</button>' : ''}
    ${data.secondaryAction ? `<a class="btn secondary" href="${escapeHtml(data.secondaryAction.href)}">${escapeHtml(data.secondaryAction.label)}</a>` : ''}
  </div>` : '';
  const quickLinks = data.quickLinks?.length ? `<div class="hero-chips" aria-label="Sugestii rapide">${data.quickLinks.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('')}</div>` : '';
  return `<div class="hero-inner">
    ${data.eyebrow ? `<p class="eyebrow">${escapeHtml(data.eyebrow)}</p>` : ''}
    <h1>${escapeHtml(data.title)}</h1>
    ${data.body ? `<p class="lead">${escapeHtml(data.body)}</p>` : ''}
    ${search}${actions}${quickLinks}
  </div>`;
}

function requireRecipe(context, type) {
  if (!context.recipe) throw new Error(`Block "${type}" requires a recipe in the render context.`);
  return context.recipe;
}

function renderBlockContent(block, context) {
  const { data } = block;
  switch (block.type) {
    case BLOCK_TYPES.SECTION:
    case BLOCK_TYPES.CONTAINER:
    case BLOCK_TYPES.COLUMNS:
    case BLOCK_TYPES.COLUMN:
    case BLOCK_TYPES.GRID:
      return renderBlockTree(data.blocks, context);
    case BLOCK_TYPES.HERO:
      return renderHero(data, context);
    case BLOCK_TYPES.HEADING:
      return `<h${data.level}>${escapeHtml(data.text)}</h${data.level}>`;
    case BLOCK_TYPES.TEXT:
      return `<p>${escapeHtml(data.text)}</p>`;
    case BLOCK_TYPES.RICH_TEXT:
      return renderRichText(data);
    case BLOCK_TYPES.IMAGE:
      return `<figure><img src="${escapeHtml(context.localImageUrls?.[block.id] || data.src)}" alt="${escapeHtml(data.alt)}" loading="${data.loading || 'lazy'}">${data.caption ? `<figcaption>${escapeHtml(data.caption)}</figcaption>` : ''}</figure>`;
    case BLOCK_TYPES.DIVIDER:
      return '<hr>';
    case BLOCK_TYPES.SPACER:
      return `<div class="block-spacer block-spacer-${data.size}" aria-hidden="true"></div>`;
    case BLOCK_TYPES.BUTTON: {
      const target = data.target || '_self';
      const rel = target === '_blank' ? ' rel="noopener noreferrer"' : '';
      return `<a class="btn${block.variant === 'secondary' ? ' secondary' : ''}" href="${escapeHtml(data.href)}" target="${target}"${rel}>${escapeHtml(data.label)}</a>`;
    }
    case BLOCK_TYPES.SEARCH:
      return `<form class="page-search" action="${escapeHtml(`${context.root || ''}cauta.html`)}" method="get" role="search"><label>${escapeHtml(data.label || 'Caută rețete')}<input name="q" type="search" placeholder="${escapeHtml(data.placeholder)}"></label><button class="btn" type="submit">${escapeHtml(data.buttonLabel)}</button></form>`;
    case BLOCK_TYPES.RECIPE_GRID:
    case BLOCK_TYPES.FEATURED_RECIPES:
    case BLOCK_TYPES.LATEST_RECIPES:
      return renderRecipeDiscovery(block, context);
    case BLOCK_TYPES.CATEGORY_GRID:
      return renderCategoryGrid(block, context);
    case BLOCK_TYPES.RANDOM_RECIPE:
      return `<button class="btn${block.variant === 'secondary' ? ' secondary' : ''}" type="button" data-random-recipe${context.page?.pageType === 'home' ? ' id="surpriseRecipeButton"' : ''}>${escapeHtml(data.label)}</button>`;
    case BLOCK_TYPES.RECIPE_HERO:
      return renderRecipeHero(requireRecipe(context, block.type), context.root || '', {
        ...data,
        localImageUrl: context.localImageUrl,
      });
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
    block.type === BLOCK_TYPES.SECTION && block.variant === 'home-hero' && 'hero hero-home',
    block.type === BLOCK_TYPES.SECTION && block.variant !== 'home-hero' && 'section',
    block.type === BLOCK_TYPES.SECTION && block.variant === 'compact' && 'compact',
    block.type === BLOCK_TYPES.CONTAINER && 'page-container',
    block.type === BLOCK_TYPES.COLUMNS && 'page-columns',
    block.type === BLOCK_TYPES.COLUMN && 'page-column',
    block.type === BLOCK_TYPES.COLUMN && `page-column-desktop-${block.data.span.desktop}`,
    block.type === BLOCK_TYPES.COLUMN && `page-column-tablet-${block.data.span.tablet}`,
    block.type === BLOCK_TYPES.COLUMN && `page-column-mobile-${block.data.span.mobile}`,
    block.type === BLOCK_TYPES.GRID && 'page-grid',
  ].filter(Boolean).join(' ');
}

function renderBlockWrapper(block, content) {
  const tag = block.type === BLOCK_TYPES.SECTION ? 'section' : 'div';
  return `<${tag} id="${escapeHtml(block.id)}" class="${blockClassNames(block)}">${content}</${tag}>`;
}

export function renderBlock(block, context = {}) {
  assertValidBlock(block);
  return renderBlockWrapper(block, renderBlockContent(block, context));
}

export function renderBlockTree(blocks, context = {}) {
  if (!Array.isArray(blocks)) throw new Error('Block tree must be an array.');
  return blocks.map((block) => renderBlock(block, context)).join('');
}
