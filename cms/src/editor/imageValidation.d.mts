export const MAX_DRAFT_IMAGE_BYTES: number;
export const MAX_DRAFT_IMAGE_DIMENSION: number;
export const MAX_WEBSITE_IMAGE_BYTES: number;
export const MAX_WEBSITE_IMAGE_DIMENSION: number;
export const MIN_DRAFT_IMAGE_DIMENSION: number;
export const SUPPORTED_DRAFT_IMAGE_TYPES: readonly string[];
export function detectImageType(bytes: Uint8Array | ArrayBuffer): string | null;
export function safeImageFileName(value: unknown, mimeType?: string): string;
export function imageResizeDimensions(width: number, height: number, maximum?: number): { width: number; height: number };
export function validateDraftImage(file: File): Promise<{
  valid: boolean;
  errors: string[];
  metadata?: { mimeType: string; byteSize: number; width: number; height: number };
}>;
export function validateWebsiteImage(file: File): ReturnType<typeof validateDraftImage>;
export function prepareDraftImage(file: File): Promise<{
  valid: boolean;
  errors: string[];
  metadata?: { mimeType: string; byteSize: number; width: number; height: number };
  file: File | null;
  optimized: boolean;
}>;
