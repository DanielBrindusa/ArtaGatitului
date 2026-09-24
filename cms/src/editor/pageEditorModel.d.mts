import type { BlockType, ContentBlock, LayoutWidth } from '../../../src/shared/index.mjs';
import type { PageDraft } from '../drafts/draftModel.mjs';

export const PAGE_LIBRARY_BLOCK_TYPES: readonly BlockType[];
export function createPageBlock(type: BlockType, options?: { id?: string }): ContentBlock;
export function createDefaultPageBlocks(pageType?: 'standard' | 'landing', title?: string): ContentBlock[];
export function canNestBlock(parentType: string, childType: string): boolean;
export function findPageBlock(blocks: ContentBlock[], blockId: string): ContentBlock | null;
export function updatePageBlock(draft: PageDraft, blockId: string, update: (block: ContentBlock) => ContentBlock): PageDraft;
export function removePageBlock(draft: PageDraft, blockId: string): PageDraft;
export function insertPageBlock(draft: PageDraft, parentId: string | null, type: BlockType, index?: number, options?: { id?: string }): PageDraft;
export function movePageBlock(draft: PageDraft, blockId: string, targetParentId: string | null, targetIndex: number): PageDraft;
export function reorderPageChildren(draft: PageDraft, parentId: string | null, fromIndex: number, toIndex: number): PageDraft;
export function setPageBlockWidth(draft: PageDraft, blockId: string, breakpoint: 'desktop' | 'tablet' | 'mobile', width: LayoutWidth): PageDraft;
export function setPageBlockVisibility(draft: PageDraft, blockId: string, breakpoint: 'desktop' | 'tablet' | 'mobile', visible: boolean): PageDraft;
export function setColumnsPreset(draft: PageDraft, columnsId: string, breakpoint: 'desktop' | 'tablet' | 'mobile', spans: number[]): PageDraft;
export function updatePageTitle(draft: PageDraft, title: string): PageDraft;
export function updatePageSlug(draft: PageDraft, slug: string): PageDraft;
export function applyPageEditorAction(draft: PageDraft, action: Record<string, unknown>): PageDraft;
