export const MAX_DRAFT_IMAGE_BYTES: number;
export const MAX_DRAFT_IMAGE_DIMENSION: number;
export const MIN_DRAFT_IMAGE_DIMENSION: number;
export const SUPPORTED_DRAFT_IMAGE_TYPES: readonly string[];
export function detectImageType(bytes: Uint8Array | ArrayBuffer): string | null;
export function validateDraftImage(file: File): Promise<{
  valid: boolean;
  errors: string[];
  metadata?: { mimeType: string; byteSize: number; width: number; height: number };
}>;
