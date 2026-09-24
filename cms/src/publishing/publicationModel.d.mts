import type { NormalizedRecipe } from '../../../src/shared/index.mjs';
import type { DraftPublicationMetadata } from '../drafts/draftModel.mjs';

export const GITHUB_REPOSITORY: 'DanielBrindusa/ArtaGatitului';
export const GITHUB_PUBLISH_BRANCH: 'main';

export function buildRecipePublicationSource(value: unknown): NormalizedRecipe & {
  imageAlt: string | null;
  layout: { modelVersion: 1; blocks: import('../../../src/shared/index.mjs').ContentBlock[] };
};
export function publicationMetadataFromResult(value: unknown): DraftPublicationMetadata;
export function pagePublicationMetadataFromResult(value: unknown): DraftPublicationMetadata;
