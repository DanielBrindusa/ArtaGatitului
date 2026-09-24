export const MAX_DRAFT_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_DRAFT_IMAGE_DIMENSION = 8_000;
export const MIN_DRAFT_IMAGE_DIMENSION = 320;
export const MAX_WEBSITE_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_WEBSITE_IMAGE_DIMENSION = 2_400;
export const SUPPORTED_DRAFT_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

const IMAGE_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

export function safeImageFileName(value, mimeType = 'image/webp') {
  const base = String(value || 'image')
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'image';
  return `${base}.${IMAGE_EXTENSIONS[mimeType] ?? 'webp'}`;
}

export function imageResizeDimensions(width, height, maximum = MAX_WEBSITE_IMAGE_DIMENSION) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Image dimensions are invalid.');
  }
  const scale = Math.min(1, maximum / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

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

export async function validateWebsiteImage(file) {
  const validation = await validateDraftImage(file);
  if (!validation.valid || !validation.metadata) return validation;
  const errors = [];
  if (validation.metadata.byteSize > MAX_WEBSITE_IMAGE_BYTES) {
    errors.push('This image is too large for the website. Select it again so the editor can optimize it.');
  }
  if (Math.max(validation.metadata.width, validation.metadata.height) > MAX_WEBSITE_IMAGE_DIMENSION) {
    errors.push(`Website images must not exceed ${MAX_WEBSITE_IMAGE_DIMENSION} pixels on their longest side.`);
  }
  return { valid: errors.length === 0, errors, metadata: errors.length ? undefined : validation.metadata };
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('The optimized image could not be encoded.')),
    type,
    quality,
  ));
}

export async function prepareDraftImage(file) {
  const validation = await validateDraftImage(file);
  if (!validation.valid || !validation.metadata) return { ...validation, file: null, optimized: false };

  const needsOptimization = validation.metadata.byteSize > MAX_WEBSITE_IMAGE_BYTES
    || Math.max(validation.metadata.width, validation.metadata.height) > MAX_WEBSITE_IMAGE_DIMENSION;
  if (!needsOptimization) {
    const safeName = safeImageFileName(file.name, validation.metadata.mimeType);
    const safeFile = safeName === file.name
      ? file
      : new File([file], safeName, { type: validation.metadata.mimeType, lastModified: file.lastModified });
    return { valid: true, errors: [], metadata: validation.metadata, file: safeFile, optimized: false };
  }

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return { valid: false, errors: ['This image must be resized before it can be used on the website.'], file: null, optimized: false };
  }

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file);
    const dimensions = imageResizeDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Image optimization is unavailable on this device.');
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    const blob = await canvasBlob(canvas, 'image/webp', 0.84);
    const optimized = new File([blob], safeImageFileName(file.name, 'image/webp'), {
      type: 'image/webp',
      lastModified: Date.now(),
    });
    const optimizedValidation = await validateWebsiteImage(optimized);
    return {
      ...optimizedValidation,
      file: optimizedValidation.valid ? optimized : null,
      optimized: optimizedValidation.valid,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'The image could not be optimized.'],
      file: null,
      optimized: false,
    };
  } finally {
    bitmap?.close();
  }
}
