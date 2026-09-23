import {
  BLOCK_MODEL_VERSION,
  CONTENT_MODEL_VERSION,
  normalizeRecipe,
  validateBlock,
} from '../../../src/shared/index.mjs';
import { validateRecipeSource } from '../../../src/shared/validation/recipe.mjs';
import { isSafeContentUrl } from '../../../src/shared/utils/html.mjs';
import { createDefaultRecipeBlocks, isSafeDraftSlug } from '../editor/editorModel.mjs';

export const DRAFT_SCHEMA_VERSION = 1;
export const DRAFT_STATUSES = Object.freeze(['draft', 'ready', 'published', 'publishedDeleted']);
export const DRAFT_CONTENT_TYPES = Object.freeze(['recipe']);
export const MAX_DRAFT_BYTES = 750_000;

const DRAFT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ATTACHMENT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const DRAFT_KEYS = new Set([
  'id', 'contentType', 'schemaVersion', 'title', 'slug', 'status', 'data', 'layout',
  'createdAt', 'updatedAt', 'updatedByUid', 'revision', 'publishedCommitSha',
  'publishedRepository', 'publishedBranch', 'publishedSourceDraftId', 'publishedSlug',
  'publishedAt', 'sourceLink', 'deletedAt',
]);
const DATA_KEYS = new Set(['modelVersion', 'recipe', 'attachments']);
const RECIPE_KEYS = new Set([
  'id', 'slug', 'title', 'name', 'description', 'category', 'ingredients', 'steps',
  'preparation', 'beforeStart', 'tags', 'equipment', 'prepTimeMinutes',
  'cookTimeMinutes', 'totalTimeMinutes', 'servings', 'image', 'sourceUrl',
  'imageAlt', 'createdAt', 'updatedAt', 'status', 'closing', 'extras', 'ratingSummary', 'keywords',
]);
const LAYOUT_KEYS = new Set(['modelVersion', 'blocks']);
const SOURCE_LINK_KEYS = new Set(['path', 'slug', 'commitSha', 'blobSha', 'sourceJson']);
const ATTACHMENT_KEYS = new Set([
  'id', 'fileName', 'alt', 'localAttachmentId', 'sourceDeviceId', 'repositoryPath',
  'mimeType', 'byteSize', 'width', 'height',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function string(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value) {
  return typeof value === 'string' ? value : null;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function nullableNonNegativeInteger(value) {
  return value === null || (Number.isInteger(value) && value >= 0) ? value : null;
}

function normalizeTags(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, items]) => key.trim() && Array.isArray(items))
      .map(([key, items]) => [key, stringArray(items)]),
  );
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((attachment) => ({
    id: string(attachment.id),
    fileName: string(attachment.fileName),
    alt: string(attachment.alt),
    localAttachmentId: nullableString(attachment.localAttachmentId),
    sourceDeviceId: nullableString(attachment.sourceDeviceId),
    repositoryPath: nullableString(attachment.repositoryPath),
    mimeType: nullableString(attachment.mimeType),
    byteSize: nullableNonNegativeInteger(attachment.byteSize),
    width: nullableNonNegativeInteger(attachment.width),
    height: nullableNonNegativeInteger(attachment.height),
  }));
}

function normalizeSourceLink(value) {
  if (!isRecord(value)) return null;
  return {
    path: string(value.path),
    slug: string(value.slug),
    commitSha: string(value.commitSha),
    blobSha: string(value.blobSha),
    sourceJson: string(value.sourceJson),
  };
}

function normalizeRecipeData(value) {
  const recipe = isRecord(value) ? value : {};
  const steps = stringArray(recipe.steps);
  return {
    id: string(recipe.id),
    slug: string(recipe.slug),
    title: string(recipe.title),
    name: string(recipe.name),
    description: string(recipe.description),
    category: string(recipe.category),
    ingredients: stringArray(recipe.ingredients),
    steps,
    preparation: stringArray(recipe.preparation),
    beforeStart: stringArray(recipe.beforeStart),
    tags: normalizeTags(recipe.tags),
    equipment: stringArray(recipe.equipment),
    prepTimeMinutes: nullableNonNegativeInteger(recipe.prepTimeMinutes),
    cookTimeMinutes: nullableNonNegativeInteger(recipe.cookTimeMinutes),
    totalTimeMinutes: nullableNonNegativeInteger(recipe.totalTimeMinutes),
    servings: recipe.servings === null || typeof recipe.servings === 'string' || Number.isInteger(recipe.servings)
      ? recipe.servings
      : null,
    image: nullableString(recipe.image),
    imageAlt: nullableString(recipe.imageAlt),
    sourceUrl: nullableString(recipe.sourceUrl),
    createdAt: nullableString(recipe.createdAt),
    updatedAt: nullableString(recipe.updatedAt),
    status: ['published', 'draft', 'archived'].includes(recipe.status) ? recipe.status : 'draft',
    closing: string(recipe.closing),
    extras: Array.isArray(recipe.extras) ? clone(recipe.extras) : [],
    ratingSummary: isRecord(recipe.ratingSummary) ? clone(recipe.ratingSummary) : null,
    keywords: stringArray(recipe.keywords),
  };
}

function normalizeLayout(value) {
  const layout = isRecord(value) ? value : {};
  return {
    modelVersion: BLOCK_MODEL_VERSION,
    blocks: Array.isArray(layout.blocks) ? clone(layout.blocks) : [],
  };
}

function normalizeV1(value) {
  const data = isRecord(value.data) ? value.data : {};
  return {
    id: string(value.id),
    contentType: 'recipe',
    schemaVersion: DRAFT_SCHEMA_VERSION,
    title: string(value.title),
    slug: string(value.slug),
    status: DRAFT_STATUSES.includes(value.status) ? value.status : 'draft',
    data: {
      modelVersion: CONTENT_MODEL_VERSION,
      recipe: normalizeRecipeData(data.recipe),
      attachments: normalizeAttachments(data.attachments),
    },
    layout: normalizeLayout(value.layout),
    createdAt: nullableString(value.createdAt),
    updatedAt: nullableString(value.updatedAt),
    updatedByUid: string(value.updatedByUid),
    revision: Number.isInteger(value.revision) && value.revision >= 0 ? value.revision : 0,
    publishedCommitSha: nullableString(value.publishedCommitSha),
    publishedRepository: nullableString(value.publishedRepository),
    publishedBranch: nullableString(value.publishedBranch),
    publishedSourceDraftId: nullableString(value.publishedSourceDraftId),
    publishedSlug: nullableString(value.publishedSlug),
    publishedAt: nullableString(value.publishedAt),
    sourceLink: normalizeSourceLink(value.sourceLink),
    deletedAt: nullableString(value.deletedAt),
  };
}

export class UnsupportedDraftSchemaError extends Error {
  constructor(schemaVersion) {
    super(`Draft schema version ${String(schemaVersion)} is not supported by this application.`);
    this.name = 'UnsupportedDraftSchemaError';
    this.schemaVersion = schemaVersion;
  }
}

export class DraftValidationError extends Error {
  constructor(errors) {
    super(`Invalid draft:\n- ${errors.join('\n- ')}`);
    this.name = 'DraftValidationError';
    this.errors = errors;
  }
}

export function migrateDraft(value) {
  if (!isRecord(value)) throw new DraftValidationError(['draft must be an object']);
  if (value.schemaVersion !== DRAFT_SCHEMA_VERSION) {
    throw new UnsupportedDraftSchemaError(value.schemaVersion);
  }
  const validation = validateDraftForStorage(value);
  if (!validation.valid) throw new DraftValidationError(validation.errors);
  return normalizeV1(value);
}

export function slugifyDraftTitle(value) {
  return string(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

export function createDraftId() {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `draft-${randomId.toLowerCase()}`;
}

export function createRecipeDraft(updatedByUid, options = {}) {
  const id = options.id || createDraftId();
  const title = string(options.title, 'Untitled recipe');
  const slug = slugifyDraftTitle(title) || id;
  return {
    id,
    contentType: 'recipe',
    schemaVersion: DRAFT_SCHEMA_VERSION,
    title,
    slug,
    status: 'draft',
    data: {
      modelVersion: CONTENT_MODEL_VERSION,
      recipe: {
        id,
        slug,
        title,
        name: title,
        description: '',
        category: '',
        ingredients: [],
        steps: [],
        preparation: [],
        beforeStart: [],
        tags: {},
        equipment: [],
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        totalTimeMinutes: null,
        servings: null,
        image: null,
        imageAlt: null,
        sourceUrl: null,
        createdAt: null,
        updatedAt: null,
        status: 'draft',
        closing: '',
        extras: [],
        ratingSummary: null,
        keywords: [],
      },
      attachments: [],
    },
    layout: {
      modelVersion: BLOCK_MODEL_VERSION,
      blocks: createDefaultRecipeBlocks(),
    },
    createdAt: null,
    updatedAt: null,
    updatedByUid,
    revision: 0,
    publishedCommitSha: null,
    publishedRepository: null,
    publishedBranch: null,
    publishedSourceDraftId: null,
    publishedSlug: null,
    publishedAt: null,
    sourceLink: null,
    deletedAt: null,
  };
}

export function duplicateRecipeDraft(source, updatedByUid, options = {}) {
  const sourceDraft = migrateDraft(source);
  const title = string(options.title, `${sourceDraft.title || 'Untitled recipe'} copy`);
  const copy = clone(sourceDraft);
  copy.id = options.id || createDraftId();
  copy.title = title;
  copy.slug = slugifyDraftTitle(title) || copy.id;
  copy.data.recipe.id = copy.id;
  copy.data.recipe.title = title;
  copy.data.recipe.name = title;
  copy.data.recipe.slug = copy.slug;
  copy.data.recipe.status = 'draft';
  copy.status = 'draft';
  copy.createdAt = null;
  copy.updatedAt = null;
  copy.updatedByUid = updatedByUid;
  copy.revision = 0;
  copy.publishedCommitSha = null;
  copy.publishedRepository = null;
  copy.publishedBranch = null;
  copy.publishedSourceDraftId = null;
  copy.publishedSlug = null;
  copy.publishedAt = null;
  copy.sourceLink = null;
  copy.deletedAt = null;
  return copy;
}

function checkPlainValue(value, path, errors, depth = 0) {
  if (depth > 30) {
    errors.push(`${path} exceeds the maximum nesting depth`);
    return;
  }
  if (typeof value === 'string' && /^data:/i.test(value.trim())) {
    errors.push(`${path} must not contain a data URL`);
    return;
  }
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkPlainValue(item, `${path}[${index}]`, errors, depth + 1));
    return;
  }
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    errors.push(`${path} must contain JSON-compatible values only`);
    return;
  }
  Object.entries(value).forEach(([key, item]) => checkPlainValue(item, `${path}.${key}`, errors, depth + 1));
}

function checkOnlyKeys(value, allowed, path, errors) {
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not supported`);
  });
}

function validNullableTimestamp(value) {
  return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}

export function validateDraftForStorage(value) {
  const errors = [];
  if (!isRecord(value)) return { valid: false, errors: ['draft must be an object'] };
  checkOnlyKeys(value, DRAFT_KEYS, 'draft', errors);
  if (!DRAFT_ID.test(value.id)) errors.push('id must be a stable lowercase identifier');
  if (!DRAFT_CONTENT_TYPES.includes(value.contentType)) errors.push('contentType must be recipe');
  if (value.schemaVersion !== DRAFT_SCHEMA_VERSION) errors.push(`schemaVersion must be ${DRAFT_SCHEMA_VERSION}`);
  if (typeof value.title !== 'string' || value.title.length > 200) errors.push('title must be a string of at most 200 characters');
  if (typeof value.slug !== 'string' || value.slug.length > 160) errors.push('slug must be a string of at most 160 characters');
  if (!DRAFT_STATUSES.includes(value.status)) errors.push(`status must be one of ${DRAFT_STATUSES.join(', ')}`);
  if (!isRecord(value.data)) errors.push('data must be an object');
  if (!isRecord(value.layout)) errors.push('layout must be an object');
  if (!Number.isInteger(value.revision) || value.revision < 0) errors.push('revision must be a non-negative integer');
  if (typeof value.updatedByUid !== 'string' || !value.updatedByUid) errors.push('updatedByUid is required');
  if (!validNullableTimestamp(value.createdAt)) errors.push('createdAt must be an ISO timestamp or null');
  if (!validNullableTimestamp(value.updatedAt)) errors.push('updatedAt must be an ISO timestamp or null');
  if (value.publishedCommitSha !== null && typeof value.publishedCommitSha !== 'string') {
    errors.push('publishedCommitSha must be a string or null');
  }
  ['publishedRepository', 'publishedBranch', 'publishedSourceDraftId', 'publishedSlug'].forEach((field) => {
    if (value[field] != null && typeof value[field] !== 'string') {
      errors.push(`${field} must be a string or null`);
    }
  });
  if (!validNullableTimestamp(value.publishedAt)) errors.push('publishedAt must be an ISO timestamp or null');
  if (!validNullableTimestamp(value.deletedAt ?? null)) errors.push('deletedAt must be an ISO timestamp or null');
  if (value.sourceLink != null) {
    if (!isRecord(value.sourceLink)) {
      errors.push('sourceLink must be an object or null');
    } else {
      checkOnlyKeys(value.sourceLink, SOURCE_LINK_KEYS, 'sourceLink', errors);
      if (!/^src\/content\/recipes\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(value.sourceLink.path ?? '')) {
        errors.push('sourceLink.path must be an approved recipe source path');
      }
      if (!isSafeDraftSlug(value.sourceLink.slug)
        || value.sourceLink.path !== `src/content/recipes/${value.sourceLink.slug}.json`) {
        errors.push('sourceLink.slug must match the recipe source path');
      }
      ['commitSha', 'blobSha'].forEach((field) => {
        if (!/^[0-9a-f]{40}$/.test(value.sourceLink[field] ?? '')) {
          errors.push(`sourceLink.${field} must be a Git SHA`);
        }
      });
      if (typeof value.sourceLink.sourceJson !== 'string' || !value.sourceLink.sourceJson.trim()) {
        errors.push('sourceLink.sourceJson is required');
      } else {
        try {
          const source = JSON.parse(value.sourceLink.sourceJson);
          const sourceValidation = validateRecipeSource(source);
          sourceValidation.errors.forEach((error) => errors.push(`sourceLink.sourceJson: ${error}`));
          if (source?.slug !== value.sourceLink.slug) errors.push('sourceLink source slug must match sourceLink.slug');
        } catch {
          errors.push('sourceLink.sourceJson must contain valid recipe JSON');
        }
      }
    }
  }
  const publicationFields = [
    value.publishedCommitSha ?? null,
    value.publishedRepository ?? null,
    value.publishedBranch ?? null,
    value.publishedSourceDraftId ?? null,
    value.publishedSlug ?? null,
    value.publishedAt ?? null,
  ];
  const publicationComplete = /^[0-9a-f]{40}$/.test(value.publishedCommitSha ?? '')
    && value.publishedRepository === 'DanielBrindusa/ArtaGatitului'
    && value.publishedBranch === 'main'
    && value.publishedSourceDraftId === value.id
    && isSafeDraftSlug(value.publishedSlug)
    && value.publishedAt !== null;
  if (publicationFields.some((field) => field !== null) && !publicationComplete) {
    errors.push('publication metadata must be complete and repository-pinned');
  }
  if (value.status === 'published') {
    if (!publicationComplete && value.sourceLink == null) errors.push('published drafts require publication metadata or source linkage');
  } else if (value.status === 'publishedDeleted') {
    if (value.sourceLink == null) errors.push('deleted published drafts require source linkage');
    if (value.deletedAt == null) errors.push('deletedAt is required for deleted published drafts');
  } else if (value.sourceLink == null && publicationFields.some((field) => field !== null)) {
    errors.push('unlinked drafts cannot retain publication metadata');
  }
  if (value.status !== 'publishedDeleted' && value.deletedAt != null) {
    errors.push('deletedAt is allowed only for deleted published drafts');
  }
  /* Legacy field-level messages remain useful for existing persisted drafts. */
  if (value.status === 'published' && publicationComplete) {
    if (!/^[0-9a-f]{40}$/.test(value.publishedCommitSha ?? '')) errors.push('publishedCommitSha must be a Git commit SHA');
    if (value.publishedRepository !== 'DanielBrindusa/ArtaGatitului') errors.push('publishedRepository must be the configured repository');
    if (value.publishedBranch !== 'main') errors.push('publishedBranch must be main');
    if (value.publishedSourceDraftId !== value.id) errors.push('publishedSourceDraftId must match the draft id');
    if (value.publishedAt === null) errors.push('publishedAt is required for published drafts');
  }

  if (isRecord(value.data)) {
    checkOnlyKeys(value.data, DATA_KEYS, 'data', errors);
    if (value.data.modelVersion !== CONTENT_MODEL_VERSION) errors.push(`data.modelVersion must be ${CONTENT_MODEL_VERSION}`);
    const recipe = value.data.recipe;
    if (!isRecord(recipe)) errors.push('data.recipe must be an object');
    else {
      checkOnlyKeys(recipe, RECIPE_KEYS, 'data.recipe', errors);
      ['id', 'title', 'name', 'slug', 'description', 'category', 'closing'].forEach((field) => {
        if (typeof recipe[field] !== 'string') errors.push(`data.recipe.${field} must be a string`);
      });
      if (recipe.id !== value.id) errors.push('data.recipe.id must match draft id');
      if (recipe.title !== value.title) errors.push('data.recipe.title must match draft title');
      if (recipe.name !== value.title) errors.push('data.recipe.name must match draft title');
      if (recipe.slug !== value.slug) errors.push('data.recipe.slug must match draft slug');
      const expectedRecipeStatus = value.status === 'published'
        ? 'published'
        : value.status === 'publishedDeleted'
          ? 'archived'
          : 'draft';
      if (recipe.status !== expectedRecipeStatus) {
        errors.push('data.recipe.status must match the draft workflow state');
      }
      ['ingredients', 'steps', 'preparation', 'beforeStart', 'equipment', 'keywords'].forEach((field) => {
        if (!Array.isArray(recipe[field]) || recipe[field].some((item) => typeof item !== 'string')) {
          errors.push(`data.recipe.${field} must be a string array`);
        }
      });
      if (Array.isArray(recipe.steps) && Array.isArray(recipe.preparation)
        && JSON.stringify(recipe.steps) !== JSON.stringify(recipe.preparation)) {
        errors.push('data.recipe.preparation must match data.recipe.steps');
      }
      if (!isRecord(recipe.tags) || Object.values(recipe.tags).some((items) => !Array.isArray(items) || items.some((item) => typeof item !== 'string'))) {
        errors.push('data.recipe.tags must map names to string arrays');
      }
      ['prepTimeMinutes', 'cookTimeMinutes', 'totalTimeMinutes'].forEach((field) => {
        if (recipe[field] !== null && (!Number.isInteger(recipe[field]) || recipe[field] < 0)) {
          errors.push(`data.recipe.${field} must be a non-negative integer or null`);
        }
      });
      if (recipe.servings !== null && typeof recipe.servings !== 'string'
        && (!Number.isInteger(recipe.servings) || recipe.servings < 0)) {
        errors.push('data.recipe.servings must be a non-negative integer, string, or null');
      }
      ['image', 'sourceUrl'].forEach((field) => {
        if (recipe[field] !== null && typeof recipe[field] !== 'string') {
          errors.push(`data.recipe.${field} must be a string or null`);
        } else if (typeof recipe[field] === 'string'
          && (!recipe[field].trim() || !isSafeContentUrl(recipe[field]))) {
          errors.push(`data.recipe.${field} must be a safe relative or HTTP(S) URL`);
        }
      });
      if (recipe.imageAlt !== null && (typeof recipe.imageAlt !== 'string' || recipe.imageAlt.length > 500)) {
        errors.push('data.recipe.imageAlt must be a string of at most 500 characters or null');
      }
      ['createdAt', 'updatedAt'].forEach((field) => {
        if (!validNullableTimestamp(recipe[field])) errors.push(`data.recipe.${field} must be an ISO timestamp or null`);
      });
      if (!['published', 'draft', 'archived'].includes(recipe.status)) {
        errors.push('data.recipe.status must use a shared recipe status');
      }
      if (!Array.isArray(recipe.extras) || recipe.extras.some((item) => !isRecord(item))) {
        errors.push('data.recipe.extras must be an array of objects');
      }
      if (recipe.ratingSummary !== null && !isRecord(recipe.ratingSummary)) {
        errors.push('data.recipe.ratingSummary must be an object or null');
      }
    }
    if (!Array.isArray(value.data.attachments)) errors.push('data.attachments must be an array');
    else if (value.data.attachments.length > 50) errors.push('data.attachments must contain at most 50 records');
    else value.data.attachments.forEach((attachment, index) => {
      if (!isRecord(attachment)) {
        errors.push(`data.attachments[${index}] must be an object`);
        return;
      }
      checkOnlyKeys(attachment, ATTACHMENT_KEYS, `data.attachments[${index}]`, errors);
      if (!ATTACHMENT_ID.test(attachment.id)) errors.push(`data.attachments[${index}].id is invalid`);
      if (typeof attachment.fileName !== 'string' || !attachment.fileName.trim()
        || attachment.fileName.length > 255 || /[\\/]/.test(attachment.fileName)) {
        errors.push(`data.attachments[${index}].fileName must be a safe filename`);
      }
      if (typeof attachment.alt !== 'string' || attachment.alt.length > 500) {
        errors.push(`data.attachments[${index}].alt must be a string of at most 500 characters`);
      }
      ['localAttachmentId', 'sourceDeviceId', 'repositoryPath'].forEach((field) => {
        if (attachment[field] !== null && typeof attachment[field] !== 'string') {
          errors.push(`data.attachments[${index}].${field} must be a string or null`);
        }
      });
      if (typeof attachment.repositoryPath === 'string'
        && (!attachment.repositoryPath.trim() || !isSafeContentUrl(attachment.repositoryPath))) {
        errors.push(`data.attachments[${index}].repositoryPath must be a safe relative or HTTP(S) URL`);
      }
      if (attachment.mimeType !== undefined && attachment.mimeType !== null
        && !['image/jpeg', 'image/png', 'image/webp'].includes(attachment.mimeType)) {
        errors.push(`data.attachments[${index}].mimeType is not a supported image type`);
      }
      ['byteSize', 'width', 'height'].forEach((field) => {
        if (attachment[field] !== undefined && attachment[field] !== null
          && (!Number.isInteger(attachment[field]) || attachment[field] < 0)) {
          errors.push(`data.attachments[${index}].${field} must be a non-negative integer or null`);
        }
      });
    });
  }

  if (isRecord(value.layout)) {
    checkOnlyKeys(value.layout, LAYOUT_KEYS, 'layout', errors);
    if (value.layout.modelVersion !== BLOCK_MODEL_VERSION) errors.push(`layout.modelVersion must be ${BLOCK_MODEL_VERSION}`);
    if (!Array.isArray(value.layout.blocks)) errors.push('layout.blocks must be an array');
    else value.layout.blocks.forEach((block, index) => {
      const result = validateBlock(block);
      result.errors.forEach((error) => errors.push(`layout.blocks[${index}]: ${error}`));
    });
  }

  checkPlainValue(value, 'draft', errors);
  try {
    const serialized = JSON.stringify(value);
    const byteLength = new TextEncoder().encode(serialized).byteLength;
    if (byteLength > MAX_DRAFT_BYTES) errors.push(`draft exceeds the ${MAX_DRAFT_BYTES} byte application limit`);
  } catch {
    errors.push('draft must be JSON serializable');
  }
  return { valid: errors.length === 0, errors };
}

export function assertDraftForStorage(value) {
  const result = validateDraftForStorage(value);
  if (!result.valid) throw new DraftValidationError(result.errors);
  return value;
}

export function draftToRecipeSource(value) {
  const draft = migrateDraft(value);
  return normalizeRecipe({
    ...draft.data.recipe,
    id: draft.id,
    title: draft.title,
    name: draft.title,
    slug: draft.slug,
    status: draft.status === 'published' ? 'published' : 'draft',
    preparation: draft.data.recipe.steps,
    image: draft.data.attachments[0]?.repositoryPath ?? null,
    imageAlt: draft.data.attachments[0]?.alt || draft.data.recipe.imageAlt || draft.title,
  }, `${draft.id}.json`);
}

export function validateDraftForPublish(value) {
  try {
    const draft = migrateDraft(value);
    const errors = [];
    if (draft.status === 'publishedDeleted') {
      errors.push('Use Create as new recipe before publishing a deleted recipe draft.');
    }
    if (!draft.title.trim() || draft.title.trim() === 'Untitled recipe') {
      errors.push('Add a recipe title.');
    }
    if (!isSafeDraftSlug(draft.slug)) {
      errors.push('Use a safe slug with lowercase letters, numbers, and hyphens only.');
    }
    if (!draft.data.recipe.category.trim()) errors.push('Choose a category.');
    if (!draft.data.recipe.ingredients.some((item) => item.trim())) errors.push('Add at least one ingredient.');
    if (!draft.data.recipe.steps.some((item) => item.trim())) errors.push('Add at least one instruction.');
    ['recipe-hero', 'ingredients', 'instructions'].forEach((type) => {
      if (!draft.layout.blocks.some((block) => block.type === type)) {
        errors.push(`Restore the required ${type} block.`);
      }
    });
    const recipeValidation = validateRecipeSource(draftToRecipeSource(draft));
    recipeValidation.errors.forEach((error) => {
      if (!errors.includes(error)) errors.push(error);
    });
    return { valid: errors.length === 0, errors };
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : 'Draft could not be normalized.'] };
  }
}
