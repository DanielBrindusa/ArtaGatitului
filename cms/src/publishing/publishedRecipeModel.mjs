import {
  BLOCK_MODEL_VERSION,
  normalizeRecipe,
  validateBlock,
} from '../../../src/shared/index.mjs';
import { validateRecipeSource } from '../../../src/shared/validation/recipe.mjs';
import {
  createRecipeDraft,
  migrateDraft,
} from '../drafts/draftModel.mjs';
import { createDefaultRecipeBlocks } from '../editor/editorModel.mjs';
import { buildRecipePublicationSource } from './publicationModel.mjs';

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_RECIPE_PATH = /^src\/content\/recipes\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
const SHA = /^[0-9a-f]{40}$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseSource(sourceJson) {
  let source;
  try {
    source = JSON.parse(sourceJson);
  } catch {
    throw new Error('The published recipe source is not valid JSON.');
  }
  const validation = validateRecipeSource(source);
  if (!validation.valid) throw new Error(`The published recipe is invalid: ${validation.errors.join(' ')}`);
  return source;
}

function normalizedLayout(value) {
  if (!value || value.modelVersion !== BLOCK_MODEL_VERSION || !Array.isArray(value.blocks)) {
    return { modelVersion: BLOCK_MODEL_VERSION, blocks: createDefaultRecipeBlocks() };
  }
  value.blocks.forEach((block) => {
    const validation = validateBlock(block);
    if (!validation.valid) throw new Error(`The published layout is invalid: ${validation.errors.join(' ')}`);
  });
  return { modelVersion: BLOCK_MODEL_VERSION, blocks: clone(value.blocks) };
}

function stableDraftId(slug) {
  let hash = 2166136261;
  for (const character of slug) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `draft-edit-${slug.slice(0, 52)}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizePublishedRecipe(value) {
  if (!value || typeof value !== 'object') throw new Error('Published recipe metadata is missing.');
  if (!SAFE_SLUG.test(value.slug ?? '')) throw new Error('Published recipe slug is invalid.');
  const pathMatch = SAFE_RECIPE_PATH.exec(value.path ?? '');
  if (!pathMatch || pathMatch[1] !== value.slug) throw new Error('Published recipe path is invalid.');
  if (!SHA.test(value.commitSha ?? '') || !SHA.test(value.blobSha ?? '')) {
    throw new Error('Published recipe Git identity is invalid.');
  }
  if (typeof value.sourceJson !== 'string' || !value.sourceJson.trim()) {
    throw new Error('Published recipe source is missing.');
  }
  const raw = parseSource(value.sourceJson);
  const recipe = normalizeRecipe(raw, value.path);
  if (recipe.slug !== value.slug) throw new Error('Published recipe source does not match its path.');
  const layout = normalizedLayout(raw.layout);
  const source = {
    ...recipe,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : recipe.slug,
    imageAlt: typeof raw.imageAlt === 'string' ? raw.imageAlt : recipe.title,
    layout,
  };
  return {
    ...value,
    title: recipe.title,
    category: recipe.category,
    imagePath: typeof recipe.image === 'string' ? recipe.image : null,
    source,
    sourceJson: `${JSON.stringify(source, null, 2)}\n`,
  };
}

function attachmentForSource(published) {
  if (!published.source.image) return [];
  const cleanPath = published.source.image.split(/[?#]/, 1)[0];
  const fileName = cleanPath.split('/').pop() || 'published-image';
  const extension = fileName.toLowerCase().split('.').pop();
  const mimeType = extension === 'png'
    ? 'image/png'
    : extension === 'webp'
      ? 'image/webp'
      : extension === 'jpg' || extension === 'jpeg'
        ? 'image/jpeg'
        : null;
  return [{
    id: 'published-image',
    fileName,
    alt: published.source.imageAlt || published.source.title,
    localAttachmentId: null,
    sourceDeviceId: null,
    repositoryPath: published.source.image,
    mimeType,
    byteSize: null,
    width: null,
    height: null,
  }];
}

function sourceLink(published) {
  return {
    path: published.path,
    slug: published.slug,
    commitSha: published.commitSha,
    blobSha: published.blobSha,
    sourceJson: published.sourceJson,
  };
}

export function createLinkedRecipeDraft(value, updatedByUid) {
  const published = normalizePublishedRecipe(value);
  const { layout, ...sourceRecipe } = published.source;
  const draft = createRecipeDraft(updatedByUid, {
    id: stableDraftId(published.slug),
    title: published.source.title,
  });
  return migrateDraft({
    ...draft,
    slug: published.slug,
    status: 'published',
    data: {
      ...draft.data,
      recipe: {
        ...sourceRecipe,
        id: draft.id,
        status: 'published',
      },
      attachments: attachmentForSource(published),
    },
    layout,
    sourceLink: sourceLink(published),
  });
}

export function attachPublishedSourceToDraft(draftValue, publishedValue) {
  const draft = migrateDraft(draftValue);
  const published = normalizePublishedRecipe(publishedValue);
  const linked = migrateDraft({
    ...draft,
    sourceLink: sourceLink(published),
    deletedAt: null,
  });
  return synchronizeLinkedDraftStatus(linked);
}

function meaningfulSource(value) {
  return {
    id: value.id,
    slug: value.slug,
    title: value.title,
    description: value.description,
    category: value.category,
    ingredients: value.ingredients,
    steps: value.steps,
    beforeStart: value.beforeStart,
    tags: value.tags,
    equipment: value.equipment,
    prepTimeMinutes: value.prepTimeMinutes,
    cookTimeMinutes: value.cookTimeMinutes,
    totalTimeMinutes: value.totalTimeMinutes,
    servings: value.servings,
    image: value.image,
    imageAlt: value.imageAlt,
    sourceUrl: value.sourceUrl,
    closing: value.closing,
    extras: value.extras,
    ratingSummary: value.ratingSummary,
    keywords: value.keywords,
    template: value.template,
    layout: value.layout,
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value ?? null;
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function countChanged(before = [], after = []) {
  const shared = Math.min(before.length, after.length);
  let changed = Math.abs(before.length - after.length);
  for (let index = 0; index < shared; index += 1) {
    if (before[index] !== after[index]) changed += 1;
  }
  return changed;
}

export function semanticRecipeChanges(draftValue) {
  const draft = migrateDraft(draftValue);
  if (!draft.sourceLink) return [{ kind: 'create', label: 'New published recipe' }];
  const baseline = meaningfulSource(parseSource(draft.sourceLink.sourceJson));
  const current = meaningfulSource(buildRecipePublicationSource(draft));
  const changes = [];
  if (baseline.title !== current.title) changes.push({ kind: 'title', label: 'Title changed' });
  if (baseline.slug !== current.slug) changes.push({ kind: 'slug', label: `Slug changed from ${baseline.slug} to ${current.slug}` });
  if (baseline.category !== current.category) changes.push({ kind: 'category', label: 'Category changed' });
  const ingredients = countChanged(baseline.ingredients, current.ingredients);
  if (ingredients) changes.push({ kind: 'ingredients', label: `${ingredients} ingredient${ingredients === 1 ? '' : 's'} changed` });
  const steps = countChanged(baseline.steps, current.steps);
  if (steps) changes.push({ kind: 'steps', label: `${steps} instruction${steps === 1 ? '' : 's'} changed` });
  if (!same(baseline.beforeStart, current.beforeStart)) changes.push({ kind: 'beforeStart', label: 'Before-starting checklist changed' });
  if (!same(baseline.equipment, current.equipment)) changes.push({ kind: 'equipment', label: 'Equipment changed' });
  if (!same(baseline.tags, current.tags)) changes.push({ kind: 'tags', label: 'Tags changed' });
  const metadataFields = ['description', 'prepTimeMinutes', 'cookTimeMinutes', 'totalTimeMinutes', 'servings', 'sourceUrl', 'closing', 'extras', 'ratingSummary', 'keywords'];
  if (metadataFields.some((field) => !same(baseline[field], current[field]))) {
    changes.push({ kind: 'metadata', label: 'Recipe details changed' });
  }
  const attachment = draft.data.attachments[0];
  const imageLabel = attachment?.localAttachmentId
    ? 'Image replaced'
    : baseline.image && !attachment
      ? 'Image removed; repository asset will be preserved'
      : !same(baseline.imageAlt, current.imageAlt)
        ? 'Image alt text changed'
        : null;
  if (imageLabel) changes.push({ kind: 'image', label: imageLabel });
  if (!same(baseline.layout, current.layout)) changes.push({ kind: 'layout', label: 'Recipe block layout changed' });
  return changes;
}

export function synchronizeLinkedDraftStatus(draftValue) {
  const draft = migrateDraft(draftValue);
  if (!draft.sourceLink || draft.status === 'publishedDeleted') return draft;
  const changed = semanticRecipeChanges(draft).length > 0;
  return {
    ...draft,
    status: changed ? 'draft' : 'published',
    data: {
      ...draft.data,
      recipe: { ...draft.data.recipe, status: changed ? 'draft' : 'published' },
    },
  };
}

export function sourceIdentityFromDraft(draftValue) {
  const draft = migrateDraft(draftValue);
  if (!draft.sourceLink) return null;
  return {
    path: draft.sourceLink.path,
    slug: draft.sourceLink.slug,
    commitSha: draft.sourceLink.commitSha,
    blobSha: draft.sourceLink.blobSha,
  };
}

export function imageActionForDraft(draftValue) {
  const draft = migrateDraft(draftValue);
  const attachment = draft.data.attachments[0];
  if (attachment?.localAttachmentId) return 'replace';
  if (!attachment) return 'remove';
  return draft.sourceLink ? 'retain' : 'remove';
}

export function draftMatchesPublishedRecipe(draft, published) {
  return draft.sourceLink?.path === published.path
    || draft.sourceLink?.slug === published.slug
    || draft.publishedSlug === published.slug;
}

export function publishedDraftId(slug) {
  if (!SAFE_SLUG.test(slug ?? '')) throw new Error('Published recipe slug is invalid.');
  return stableDraftId(slug);
}
