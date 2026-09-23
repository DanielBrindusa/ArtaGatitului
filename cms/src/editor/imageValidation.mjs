export const MAX_DRAFT_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_DRAFT_IMAGE_DIMENSION = 8_000;
export const MIN_DRAFT_IMAGE_DIMENSION = 320;
export const SUPPORTED_DRAFT_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

export function detectImageType(bytes) {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (value.length >= 8
    && value[0] === 0x89 && value[1] === 0x50 && value[2] === 0x4e && value[3] === 0x47
    && value[4] === 0x0d && value[5] === 0x0a && value[6] === 0x1a && value[7] === 0x0a) {
    return 'image/png';
  }
  if (value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) {
    return 'image/jpeg';
  }
  if (value.length >= 12
    && String.fromCharCode(...value.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...value.slice(8, 12)) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

async function imageDimensions(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The selected file could not be decoded as an image.'));
    };
    image.src = url;
  });
}

export async function validateDraftImage(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return { valid: false, errors: ['Select an image file.'] };
  }
  const errors = [];
  if (!file.size || file.size > MAX_DRAFT_IMAGE_BYTES) {
    errors.push(`Images must be smaller than ${MAX_DRAFT_IMAGE_BYTES / 1024 / 1024} MB.`);
  }
  const signature = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const detectedType = detectImageType(signature);
  if (!detectedType || !SUPPORTED_DRAFT_IMAGE_TYPES.includes(detectedType)) {
    errors.push('Use a real JPEG, PNG, or WebP image.');
  } else if (file.type && file.type !== detectedType) {
    errors.push('The image contents do not match its declared file type.');
  }
  if (errors.length) return { valid: false, errors };

  try {
    const dimensions = await imageDimensions(file);
    if (dimensions.width < MIN_DRAFT_IMAGE_DIMENSION || dimensions.height < MIN_DRAFT_IMAGE_DIMENSION) {
      errors.push(`Images must be at least ${MIN_DRAFT_IMAGE_DIMENSION} pixels in both dimensions.`);
    }
    if (dimensions.width > MAX_DRAFT_IMAGE_DIMENSION || dimensions.height > MAX_DRAFT_IMAGE_DIMENSION) {
      errors.push(`Images must not exceed ${MAX_DRAFT_IMAGE_DIMENSION} pixels in either dimension.`);
    }
    return {
      valid: errors.length === 0,
      errors,
      metadata: errors.length ? undefined : {
        mimeType: detectedType,
        byteSize: file.size,
        width: dimensions.width,
        height: dimensions.height,
      },
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'The selected image is malformed.'],
    };
  }
}
