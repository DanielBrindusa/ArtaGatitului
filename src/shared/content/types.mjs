export const RECIPE_STATUSES = Object.freeze(['published', 'draft', 'archived']);

/**
 * @typedef {Object} NormalizedRecipe
 * @property {string} id
 * @property {string} slug
 * @property {string} title
 * @property {string} name
 * @property {string} category
 * @property {string} description
 * @property {string[]} ingredients
 * @property {string[]} steps
 * @property {string[]} preparation
 * @property {string[]} beforeStart
 * @property {Record<string, string[]>} tags
 * @property {string[]} equipment
 * @property {'published'|'draft'|'archived'} status
 */

/**
 * @typedef {Object} NormalizedCategory
 * @property {string} id
 * @property {string} slug
 * @property {string} title
 * @property {string} name
 * @property {string} description
 * @property {'published'|'draft'|'archived'} status
 */

export const CONTENT_MODEL_VERSION = 1;
