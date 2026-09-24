import { normalizePage, validatePageSource } from '../../../src/shared/index.mjs';
import {
  createPageDraft,
  draftToPageSource,
  isPageDraft,
  migrateDraft,
} from '../drafts/draftModel.mjs';

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_PAGE_PATH = /^src\/content\/pages\/(home|[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
const SHA = /^[0-9a-f]{40}$/;

function parseSource(sourceJson) {
  let source;
  try {
    source = JSON.parse(sourceJson);
  } catch {
    throw new Error('The published page source is not valid JSON.');
  }
  const validation = validatePageSource(source);
  if (!validation.valid) throw new Error(`The published page is invalid: ${validation.errors.join(' ')}`);
  return normalizePage(source);
}

function stableDraftId(slug) {
  let hash = 2166136261;
  for (const character of slug) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `draft-page-${slug.slice(0, 52)}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizePublishedPage(value) {
  if (!value || typeof value !== 'object') throw new Error('Published page metadata is missing.');
  if (!SAFE_SLUG.test(value.slug ?? '')) throw new Error('Published page slug is invalid.');
  const match = SAFE_PAGE_PATH.exec(value.path ?? '');
  if (!match || match[1] !== value.slug) throw new Error('Published page path is invalid.');
  if (!SHA.test(value.commitSha ?? '') || !SHA.test(value.blobSha ?? '')) throw new Error('Published page Git identity is invalid.');
  const source = parseSource(value.sourceJson);
  if (source.slug !== value.slug) throw new Error('Published page source does not match its path.');
  return {
    ...value,
    id: source.id,
    title: source.title,
    pageType: source.pageType,
    source,
    sourceJson: `${JSON.stringify(source, null, 2)}\n`,
  };
}

function extensionMime(path) {
  const extension = path.toLowerCase().split('.').pop();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return null;
}

function attachmentsForSource(source) {
  const attachments = [];
  function visit(blocks) {
    blocks.forEach((block) => {
      if (block.type === 'image' && typeof block.data.src === 'string') {
        const clean = block.data.src.split(/[?#]/, 1)[0];
        attachments.push({
          id: block.id,
          fileName: clean.split('/').pop() || 'published-image',
          alt: block.data.alt || source.title,
          localAttachmentId: null,
          sourceDeviceId: null,
          repositoryPath: block.data.src,
          mimeType: extensionMime(clean),
          byteSize: null,
          width: null,
          height: null,
        });
      }
      visit(block.data?.blocks || []);
    });
  }
  visit(source.layout.blocks);
  return attachments;
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

export function createLinkedPageDraft(value, updatedByUid) {
  const published = normalizePublishedPage(value);
  const draft = createPageDraft(updatedByUid, {
    id: stableDraftId(published.slug),
    title: published.title,
    pageType: published.pageType === 'landing' ? 'landing' : 'standard',
  });
  return migrateDraft({
    ...draft,
    title: published.title,
    slug: published.slug,
    status: 'published',
    data: {
      ...draft.data,
      page: {
        id: published.source.id,
        pageType: published.source.pageType,
        title: published.source.title,
        slug: published.source.slug,
        description: published.source.description,
        socialImage: published.source.socialImage,
        status: 'published',
        template: published.source.template,
      },
      attachments: attachmentsForSource(published.source),
    },
    layout: published.source.layout,
    sourceLink: sourceLink(published),
  });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value ?? null;
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function semanticPageChanges(draftValue) {
  const draft = migrateDraft(draftValue);
  if (!isPageDraft(draft)) throw new Error('Draft is not a page.');
  if (!draft.sourceLink) return [{ kind: 'create', label: 'New published page' }];
  const baseline = parseSource(draft.sourceLink.sourceJson);
  const current = draftToPageSource(draft);
  const changes = [];
  if (baseline.title !== current.title) changes.push({ kind: 'title', label: 'Page title changed' });
  if (baseline.slug !== current.slug) changes.push({ kind: 'slug', label: `Route changed from /${baseline.slug}/ to /${current.slug}/` });
  if (baseline.description !== current.description) changes.push({ kind: 'metadata', label: 'Meta description changed' });
  if (baseline.socialImage !== current.socialImage) changes.push({ kind: 'metadata', label: 'Social image changed' });
  if (!same(baseline.template, current.template)) changes.push({ kind: 'template', label: 'Page template assignment changed' });
  if (!same(baseline.layout, current.layout)) changes.push({ kind: 'layout', label: 'Page sections or responsive layout changed' });
  const replacements = draft.data.attachments.filter((attachment) => attachment.localAttachmentId).length;
  if (replacements) changes.push({ kind: 'image', label: `${replacements} page image${replacements === 1 ? '' : 's'} selected for publication` });
  return changes;
}

export function synchronizeLinkedPageDraftStatus(draftValue) {
  const draft = migrateDraft(draftValue);
  if (!isPageDraft(draft) || !draft.sourceLink || draft.status === 'publishedDeleted') return draft;
  const changed = semanticPageChanges(draft).length > 0;
  return {
    ...draft,
    status: changed ? 'draft' : 'published',
    data: { ...draft.data, page: { ...draft.data.page, status: changed ? 'draft' : 'published' } },
  };
}

export function attachPublishedSourceToPageDraft(draftValue, publishedValue) {
  const draft = migrateDraft(draftValue);
  if (!isPageDraft(draft)) throw new Error('Draft is not a page.');
  const published = normalizePublishedPage(publishedValue);
  return synchronizeLinkedPageDraftStatus(migrateDraft({ ...draft, sourceLink: sourceLink(published), deletedAt: null }));
}

export function pageSourceIdentityFromDraft(draftValue) {
  const draft = migrateDraft(draftValue);
  if (!isPageDraft(draft) || !draft.sourceLink) return null;
  return { path: draft.sourceLink.path, slug: draft.sourceLink.slug, commitSha: draft.sourceLink.commitSha, blobSha: draft.sourceLink.blobSha };
}

export function draftMatchesPublishedPage(draft, published) {
  return isPageDraft(draft) && (draft.sourceLink?.path === published.path
    || draft.sourceLink?.slug === published.slug
    || draft.publishedSlug === published.slug);
}

export function publishedPageDraftId(slug) {
  if (!SAFE_SLUG.test(slug ?? '')) throw new Error('Published page slug is invalid.');
  return stableDraftId(slug);
}
