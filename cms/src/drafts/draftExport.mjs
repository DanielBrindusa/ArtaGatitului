import { isPageDraft, isRecipeDraft, isSiteDraft } from './draftModel.mjs';

export const DRAFT_EXPORT_FORMAT = 'arta-gatitului-cms-export';
export const DRAFT_EXPORT_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function portableAttachment(attachment) {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    alt: attachment.alt,
    repositoryPath: attachment.repositoryPath,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    width: attachment.width,
    height: attachment.height,
    needsImageReselection: Boolean(attachment.localAttachmentId && !attachment.repositoryPath),
  };
}

function exportContent(draft) {
  if (isRecipeDraft(draft)) {
    return {
      data: {
        modelVersion: draft.data.modelVersion,
        recipe: clone(draft.data.recipe),
        attachments: draft.data.attachments.map(portableAttachment),
      },
      layout: clone(draft.layout),
    };
  }
  if (isPageDraft(draft)) {
    return {
      data: {
        modelVersion: draft.data.modelVersion,
        page: clone(draft.data.page),
        attachments: draft.data.attachments.map(portableAttachment),
      },
      layout: clone(draft.layout),
    };
  }
  if (isSiteDraft(draft)) {
    return {
      data: {
        modelVersion: draft.data.modelVersion,
        site: clone(draft.data.site),
      },
      layout: clone(draft.layout),
    };
  }
  throw new Error('Only a current CMS draft can be exported.');
}

export function createDraftExport(draft, exportedAt = new Date().toISOString()) {
  return {
    format: DRAFT_EXPORT_FORMAT,
    formatVersion: DRAFT_EXPORT_VERSION,
    exportedAt,
    contentType: draft.contentType,
    title: draft.title,
    slug: draft.slug,
    content: exportContent(draft),
  };
}

export function serializeDraftExport(draft, exportedAt) {
  return `${JSON.stringify(createDraftExport(draft, exportedAt), null, 2)}\n`;
}

export function draftExportFileName(draft, exportedAt = new Date().toISOString()) {
  const slug = String(draft.slug || draft.contentType || 'backup')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'backup';
  const day = /^\d{4}-\d{2}-\d{2}/.exec(exportedAt)?.[0] ?? 'undated';
  return `arta-gatitului-${draft.contentType}-${slug}-${day}.json`;
}

export async function downloadDraftExport(draft) {
  const exportedAt = new Date().toISOString();
  const fileName = draftExportFileName(draft, exportedAt);
  const contents = serializeDraftExport(draft, exportedAt);
  const file = new File([contents], fileName, { type: 'application/json' });

  if (typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: `Arta Gatitului backup: ${draft.title}` });
    return fileName;
  }

  const url = URL.createObjectURL(file);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return fileName;
}
