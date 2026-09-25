import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import siteStyles from '../../../assets/css/style.css?raw';
import {
  BLOCK_TYPES,
  LAYOUT_WIDTHS,
  renderBlock,
  renderLayoutTokenCss,
  type Breakpoint,
  type ContentBlock,
  type LayoutWidth,
} from '../../../src/shared/index.mjs';
import type { PageDraft } from '../drafts/draftModel.mjs';
import { draftToPageSource } from '../drafts/draftModel.mjs';
import { publishedCategories, publishedRecipeCatalog } from './contentCatalog';
import editorStyles from './editorCanvas.css?raw';
import {
  canNestBlock,
  movePageBlock,
  removePageBlock,
  reorderPageChildren,
  setPageBlockWidth,
} from './pageEditorModel.mjs';

interface VisualPageCanvasProps {
  draft: PageDraft;
  viewport: Breakpoint;
  selectedBlockId: string | null;
  localImageUrls: Record<string, string>;
  onSelectBlock: (blockId: string) => void;
  updateDraft: (update: (draft: PageDraft) => PageDraft) => void;
}

interface BlockLocation { parentId: string | null; parentType: string; index: number }

function indexTree(blocks: ContentBlock[], parentId: string | null = null, parentType = 'page', map = new Map<string, BlockLocation>()) {
  blocks.forEach((block, index) => {
    map.set(block.id, { parentId, parentType, index });
    if (Array.isArray(block.data.blocks)) indexTree(block.data.blocks, block.id, block.type, map);
  });
  return map;
}

function widthAt(block: ContentBlock, viewport: Breakpoint): LayoutWidth {
  if (viewport === 'desktop') return block.layout?.width ?? 'wide';
  return block.responsive?.[viewport]?.width ?? block.layout?.width ?? 'wide';
}

function CanvasPortal({ viewport, children }: { viewport: Breakpoint; children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useEffect(() => {
    if (hostRef.current && !hostRef.current.shadowRoot) setRoot(hostRef.current.attachShadow({ mode: 'open' }));
    else if (hostRef.current) setRoot(hostRef.current.shadowRoot);
  }, []);
  return <div className={`visual-canvas-host visual-canvas-host-${viewport}`} ref={hostRef}>{root && createPortal(<><style>{`${siteStyles}\n${renderLayoutTokenCss()}\n${editorStyles}`}</style><div className={`editor-public-surface page-editor-surface viewport-${viewport}`}>{children}</div></>, root)}</div>;
}

function ResizeHandle({ width, onCommit }: { width: LayoutWidth; onCommit: (width: LayoutWidth) => void }) {
  const start = useRef<{ x: number; index: number } | null>(null);
  const pending = useRef(width);
  return <button className="resize-handle" type="button" title={`Resize block (${width})`} aria-label="Resize block" onPointerDown={(event) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, index: LAYOUT_WIDTHS.indexOf(width) };
    pending.current = width;
  }} onPointerMove={(event) => {
    if (!start.current) return;
    const step = Math.round((event.clientX - start.current.x) / 90);
    pending.current = LAYOUT_WIDTHS[Math.max(0, Math.min(LAYOUT_WIDTHS.length - 1, start.current.index + step))] ?? width;
  }} onPointerUp={(event) => {
    if (!start.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    start.current = null;
    if (pending.current !== width) onCommit(pending.current);
  }} onPointerCancel={() => { start.current = null; }} />;
}

function EmptyDropTarget({ parent, activeBlock }: { parent: ContentBlock; activeBlock: ContentBlock | null }) {
  const { isOver, setNodeRef } = useDroppable({ id: `drop:${parent.id}` });
  const valid = Boolean(activeBlock && canNestBlock(parent.type, activeBlock.type));
  return <div ref={setNodeRef} className={`page-empty-drop${isOver && valid ? ' valid' : ''}${activeBlock && !valid ? ' invalid' : ''}`}>Drop compatible blocks here</div>;
}

function SortablePageBlock({
  block,
  location,
  count,
  activeBlock,
  props,
}: {
  block: ContentBlock;
  location: BlockLocation;
  count: number;
  activeBlock: ContentBlock | null;
  props: VisualPageCanvasProps;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const children = Array.isArray(block.data.blocks) ? block.data.blocks : null;
  const page = draftToPageSource(props.draft);
  const content = children ? null : renderBlock(block, {
    page,
    recipes: publishedRecipeCatalog,
    categories: publishedCategories,
    root: '#',
    localImageUrls: props.localImageUrls,
  });
  const width = widthAt(block, props.viewport);
  const columnSpan = block.type === BLOCK_TYPES.COLUMN
    ? Number((block.data.span as Record<string, number> | undefined)?.[props.viewport] ?? 12)
    : null;
  return (
    <section ref={setNodeRef} className={`editor-block-frame page-block-frame editor-width-${width}${props.selectedBlockId === block.id ? ' selected' : ''}${isDragging ? ' dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition, ...(columnSpan ? { gridColumn: `span ${columnSpan}` } : {}) }} onClick={(event) => { event.stopPropagation(); props.onSelectBlock(block.id); }}>
      <div className="editor-block-toolbar">
        <button className="drag-handle" type="button" title="Drag block" aria-label={`Reorder ${block.type}`} {...attributes} {...listeners}><GripVertical size={16} /></button>
        <span>{block.type.replace(/-/g, ' ')}</span>
        <button type="button" title="Move up" aria-label="Move block up" disabled={location.index === 0} onClick={() => props.updateDraft((draft) => reorderPageChildren(draft, location.parentId, location.index, location.index - 1))}><ChevronUp size={14} /></button>
        <button type="button" title="Move down" aria-label="Move block down" disabled={location.index === count - 1} onClick={() => props.updateDraft((draft) => reorderPageChildren(draft, location.parentId, location.index, location.index + 1))}><ChevronDown size={14} /></button>
        <button type="button" title="Remove block" aria-label="Remove block" disabled={props.draft.data.page.pageType === 'home' && block.type === BLOCK_TYPES.SECTION && props.draft.layout.blocks.length === 1} onClick={() => props.updateDraft((draft) => removePageBlock(draft, block.id))}><Trash2 size={14} /></button>
      </div>
      {children ? (
        <div className={`page-layout-frame page-layout-${block.type}`}>
          <SortableContext items={children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
            {children.map((child, index) => <SortablePageBlock key={child.id} block={child} location={{ parentId: block.id, parentType: block.type, index }} count={children.length} activeBlock={activeBlock} props={props} />)}
          </SortableContext>
          {children.length === 0 && <EmptyDropTarget parent={block} activeBlock={activeBlock} />}
        </div>
      ) : <div className="page-rendered-block" dangerouslySetInnerHTML={{ __html: content ?? '' }} />}
      <ResizeHandle width={width} onCommit={(nextWidth) => props.updateDraft((draft) => setPageBlockWidth(draft, block.id, props.viewport, nextWidth))} />
    </section>
  );
}

export function VisualPageCanvas(props: VisualPageCanvasProps) {
  const locations = useMemo(() => indexTree(props.draft.layout.blocks), [props.draft.layout.blocks]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeBlock = activeId ? (() => {
    const stack = [...props.draft.layout.blocks];
    while (stack.length) {
      const block = stack.shift() as ContentBlock;
      if (block.id === activeId) return block;
      stack.push(...(block.data.blocks ?? []));
    }
    return null;
  })() : null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over || event.active.id === event.over.id) return;
    const source = locations.get(String(event.active.id));
    if (!source) return;
    const overId = String(event.over.id);
    if (overId.startsWith('drop:')) {
      const targetParentId = overId.slice(5);
      const targetParent = findBlock(props.draft.layout.blocks, targetParentId);
      if (!activeBlock || !targetParent || !canNestBlock(targetParent.type, activeBlock.type)) return;
      props.updateDraft((draft) => movePageBlock(draft, String(event.active.id), targetParentId, Number.MAX_SAFE_INTEGER));
      return;
    }
    const target = locations.get(overId);
    if (!target) return;
    if (source.parentId === target.parentId) {
      props.updateDraft((draft) => reorderPageChildren(draft, source.parentId, source.index, target.index));
    } else {
      if (!activeBlock) return;
      if (target.parentId === null && activeBlock.type !== BLOCK_TYPES.SECTION) return;
      const targetParent = target.parentId ? findBlock(props.draft.layout.blocks, target.parentId) : null;
      if (target.parentId !== null && (!targetParent || !canNestBlock(targetParent.type, activeBlock.type))) return;
      props.updateDraft((draft) => movePageBlock(draft, String(event.active.id), target.parentId, target.index));
    }
  }

  return (
    <CanvasPortal viewport={props.viewport}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => setActiveId(String(event.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={handleDragEnd}>
        <SortableContext items={props.draft.layout.blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
          <article className="page-editor-document" aria-label="Visual page editor">
            {props.draft.layout.blocks.map((block, index) => <SortablePageBlock key={block.id} block={block} location={{ parentId: null, parentType: 'page', index }} count={props.draft.layout.blocks.length} activeBlock={activeBlock} props={props} />)}
          </article>
        </SortableContext>
      </DndContext>
    </CanvasPortal>
  );
}

function findBlock(blocks: ContentBlock[], id: string): ContentBlock | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    const found = findBlock(block.data.blocks ?? [], id);
    if (found) return found;
  }
  return null;
}
