import type { NormalizedRecipe } from '../../../src/shared/index.mjs';
import type { DraftPublicationMetadata } from '../drafts/draftModel.mjs';

export const GITHUB_REPOSITORY: 'DanielBrindusa/ArtaGatitului';
export const GITHUB_PUBLISH_BRANCH: 'main';

export function buildRecipePublicationSource(value: unknown): NormalizedRecipe;
export function publicationMetadataFromResult(value: unknown): DraftPublicationMetadata;
