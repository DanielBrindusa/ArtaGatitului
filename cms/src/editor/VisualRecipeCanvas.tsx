import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
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
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImagePlus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import siteStyles from '../../../assets/css/style.css?raw';
import {
  BLOCK_TYPES,
  LAYOUT_WIDTHS,
  renderBlock,
  renderLayoutTokenCss,
  type ContentBlock,
  type LayoutWidth,
} from '../../../src/shared/index.mjs';
import type { RecipeDraft } from '../drafts/draftModel.mjs';
import { knownCategories } from './contentCatalog';
import editorStyles from './editorCanvas.css?raw';
import {
  REQUIRED_RECIPE_BLOCK_TYPES,
  insertListItem,
  removeDraftBlock,
  removeListItem,
  reorderDraftBlocks,
  reorderItems,
  resolvedBlockWidth,
  setBlockWidth,
  updateDraftBlock,
  updateDraftTitle,
  updateRecipeFields,
  updateRecipeList,
} from './editorModel.mjs';

export type EditorViewport = 'desktop' | 'tablet' | 'mobile';
export type LocalImageStatus = 'none' | 'loading' | 'ready' | 'missing-local' | 'other-device';

interface VisualRecipeCanvasProps {
  draft: RecipeDraft;
  viewport: EditorViewport;
  selectedBlockId: string | null;
  localImageUrl: string | null;
  localImageStatus: LocalImageStatus;
  onSelectBlock: (blockId: string) => void;
  updateDraft: (update: (draft: RecipeDraft) => RecipeDraft) => void;
  onPickImage: (file: File) => void;
  onRemoveImage: () => void;
}

function labelForType(type: string) {
  return type.replace(/-/g, ' ');
}

function CanvasPortal({ viewport, children }: { viewport: EditorViewport; children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useEffect(() => {
    if (hostRef.current && !hostRef.current.shadowRoot) setRoot(hostRef.current.attachShadow({ mode: 'open' }));
    else if (hostRef.current) setRoot(hostRef.current.shadowRoot);
  }, []);
  return (
    <div className={`visual-canvas-host visual-canvas-host-${viewport}`} ref={hostRef}>
      {root && createPortal(
        <>
          <style>{`${siteStyles}\n${renderLayoutTokenCss()}\n${editorStyles}`}</style>
          <div className={`editor-public-surface viewport-${viewport}`}>{children}</div>
        </>,
        root,
      )}
    </div>
  );
}

function ResizeHandle({
  width,
  onCommit,
}: {
  width: LayoutWidth;
  onCommit: (width: LayoutWidth) => void;
}) {
  const start = useRef<{ x: number; index: number } | null>(null);
  const pending = useRef(width);

  return (
    <button
      aria-label="Resize block"
      className="resize-handle"
      title={`Resize block (${width})`}
      type="button"
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, index: LAYOUT_WIDTHS.indexOf(width) };
        pending.current = width;
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const step = Math.round((event.clientX - start.current.x) / 90);
        const nextIndex = Math.max(0, Math.min(LAYOUT_WIDTHS.length - 1, start.current.index + step));
        pending.current = LAYOUT_WIDTHS[nextIndex] ?? width;
        event.currentTarget.title = `Resize block (${pending.current})`;
      }}
      onPointerUp={(event) => {
        if (!start.current) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        start.current = null;
        if (pending.current !== width) onCommit(pending.current);
      }}
      onPointerCancel={() => { start.current = null; }}
    />
  );
}

interface SortableListRowProps {
  id: string;
  value: string;
  index: number;
  marker: 'checkbox' | 'bullet' | 'number';
  count: number;
  inputRef: (element: HTMLInputElement | null) => void;
  onChange: (value: string) => void;
  onInsertAfter: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

function SortableListRow(props: SortableListRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id });
  const marker = props.marker === 'checkbox'
    ? <CheckSquare aria-hidden="true" size={17} />
    : props.marker === 'bullet' ? '\u2022' : `${props.index + 1}.`;
  return (
    <li
      ref={setNodeRef}
      className={`list-row${isDragging ? ' sorting' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button className="drag-handle" type="button" title="Drag to reorder" aria-label={`Reorder item ${props.index + 1}`} {...attributes} {...listeners}>
        <GripVertical aria-hidden="true" size={17} />
      </button>
      <span className="list-marker" aria-hidden="true">{marker}</span>
      <input
        ref={props.inputRef}
        className="inline-list-input"
        aria-label={`Item ${props.index + 1}`}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            props.onInsertAfter();
          } else if (event.key === 'Backspace' && !props.value) {
            event.preventDefault();
            props.onRemove();
          }
        }}
      />
      <button className="list-move-up" type="button" title="Move up" aria-label={`Move item ${props.index + 1} up`} disabled={props.index === 0} onClick={() => props.onMove(-1)}>
        <ChevronUp aria-hidden="true" size={15} />
      </button>
      <button className="list-move-down" type="button" title="Move down" aria-label={`Move item ${props.index + 1} down`} disabled={props.index === props.count - 1} onClick={() => props.onMove(1)}>
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      <button type="button" title="Remove item" aria-label={`Remove item ${props.index + 1}`} onClick={props.onRemove}>
        <Trash2 aria-hidden="true" size={15} />
      </button>
    </li>
  );
}

function InlineListEditor({
  field,
  items,
  marker,
  onChange,
}: {
  field: string;
  items: string[];
  marker: 'checkbox' | 'bullet' | 'number';
  onChange: (items: string[]) => void;
}) {
  const renderedItems = items.length ? items : [''];
  const ids = renderedItems.map((_, index) => `${field}-${index}`);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  useEffect(() => {
    if (focusIndex === null) return;
    inputRefs.current[focusIndex]?.focus();
    setFocusIndex(null);
  }, [focusIndex, renderedItems.length]);

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || items.length < 2) return;
    const from = ids.indexOf(String(event.active.id));
    const to = ids.indexOf(String(event.over.id));
    onChange(reorderItems(items, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="editor-list" aria-label={`${field} list`}>
          {renderedItems.map((item, index) => (
            <SortableListRow
              key={ids[index]}
              id={ids[index] ?? `${field}-${index}`}
              value={item}
              index={index}
              marker={marker}
              count={renderedItems.length}
              inputRef={(element) => { inputRefs.current[index] = element; }}
              onChange={(value) => {
                const next = items.length ? [...items] : [''];
                next[index] = value;
                onChange(next);
              }}
              onInsertAfter={() => {
                onChange(insertListItem(items.length ? items : [''], index + 1));
                setFocusIndex(index + 1);
              }}
              onRemove={() => {
                const next = removeListItem(items.length ? items : [''], index);
                onChange(next);
                setFocusIndex(Math.max(0, index - 1));
              }}
              onMove={(direction) => {
                const target = index + direction;
                if (target < 0 || target >= items.length) return;
                onChange(reorderItems(items, index, target));
                setFocusIndex(target);
              }}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function HeroEditor({
  draft,
  imageUrl,
  imageStatus,
  updateDraft,
  onPickImage,
  onRemoveImage,
}: Pick<VisualRecipeCanvasProps, 'draft' | 'updateDraft' | 'onPickImage' | 'onRemoveImage'> & {
  imageUrl: string | null;
  imageStatus: LocalImageStatus;
}) {
  const recipe = draft.data.recipe;
  const hasAttachment = draft.data.attachments.length > 0;
  const placeholder = imageStatus === 'other-device'
    ? 'This draft contains an image selected on another device. Select it on this device or publish from the original device.'
    : imageStatus === 'missing-local'
      ? 'The local image copy is unavailable. Select the image again to restore its preview.'
      : 'No recipe image selected.';
  return (
    <header className="recipe-hero editor-recipe-hero">
      <div>
        <div className="editor-hero-image">
          {imageUrl ? <img src={imageUrl} alt={draft.data.attachments[0]?.alt || recipe.title} /> : (
            <div className="editor-image-placeholder">
              <ImagePlus aria-hidden="true" size={28} />
              <strong>{hasAttachment ? 'Image metadata found' : 'Recipe image'}</strong>
              <span>{placeholder}</span>
            </div>
          )}
          <div className="editor-hero-image-actions">
            <label className="image-picker-label">
              <ImagePlus aria-hidden="true" size={16} />
              <span>Select image</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPickImage(file);
                event.currentTarget.value = '';
              }} />
            </label>
            {hasAttachment && <button className="image-picker-label" type="button" onClick={onRemoveImage}><Trash2 aria-hidden="true" size={15} /><span>Remove</span></button>}
          </div>
        </div>
        <p className="eyebrow">Rețetă</p>
        {recipe.category && <span className="pill">{recipe.category}</span>}
        <textarea
          className="inline-title"
          aria-label="Recipe title"
          rows={2}
          maxLength={200}
          value={draft.title}
          onChange={(event) => updateDraft((current) => updateDraftTitle(current, event.target.value.replace(/[\r\n]+/g, ' ')))}
        />
        <textarea
          className="inline-description"
          aria-label="Recipe description"
          placeholder="Describe the recipe"
          value={recipe.description}
          onChange={(event) => updateDraft((current) => updateRecipeFields(current, { description: event.target.value }))}
        />
      </div>
    </header>
  );
}

function MetadataEditor({ draft, updateDraft }: Pick<VisualRecipeCanvasProps, 'draft' | 'updateDraft'>) {
  const recipe = draft.data.recipe;
  const numberValue = (value: number | null) => value ?? '';
  const setNumber = (field: 'prepTimeMinutes' | 'cookTimeMinutes' | 'totalTimeMinutes', value: string) => {
    const parsed = value === '' ? null : Math.max(0, Number.parseInt(value, 10) || 0);
    updateDraft((current) => updateRecipeFields(current, { [field]: parsed }));
  };
  return (
    <section className="recipe-timeline box" aria-label="Recipe metadata">
      <div><span>Category</span><select className="inline-meta-select" value={recipe.category} onChange={(event) => updateDraft((current) => updateRecipeFields(current, { category: event.target.value }))}><option value="">Choose</option>{knownCategories.map((category) => <option key={category}>{category}</option>)}</select></div>
      <div><span>Preparation</span><input className="inline-meta-input" aria-label="Preparation minutes" type="number" min="0" value={numberValue(recipe.prepTimeMinutes)} onChange={(event) => setNumber('prepTimeMinutes', event.target.value)} /></div>
      <div><span>Cooking</span><input className="inline-meta-input" aria-label="Cooking minutes" type="number" min="0" value={numberValue(recipe.cookTimeMinutes)} onChange={(event) => setNumber('cookTimeMinutes', event.target.value)} /></div>
      <div><span>Total</span><input className="inline-meta-input" aria-label="Total minutes" type="number" min="0" value={numberValue(recipe.totalTimeMinutes)} onChange={(event) => setNumber('totalTimeMinutes', event.target.value)} /></div>
      <div><span>Servings</span><input className="inline-meta-input" aria-label="Servings" value={recipe.servings ?? ''} onChange={(event) => updateDraft((current) => updateRecipeFields(current, { servings: event.target.value || null }))} /></div>
    </section>
  );
}

function ListRecipeBlock({
  block,
  draft,
  updateDraft,
}: {
  block: ContentBlock;
  draft: RecipeDraft;
  updateDraft: VisualRecipeCanvasProps['updateDraft'];
}) {
  const mapping = {
    [BLOCK_TYPES.INGREDIENTS]: { field: 'ingredients', fallback: 'Ingrediente', marker: 'checkbox' },
    [BLOCK_TYPES.BEFORE_STARTING]: { field: 'beforeStart', fallback: 'Înainte să începi', marker: 'checkbox' },
    [BLOCK_TYPES.EQUIPMENT]: { field: 'equipment', fallback: 'Echipament', marker: 'bullet' },
    [BLOCK_TYPES.INSTRUCTIONS]: { field: 'steps', fallback: 'Mod de preparare', marker: 'number' },
  } as const;
  const config = mapping[block.type as keyof typeof mapping];
  const items = draft.data.recipe[config.field] as string[];
  return (
    <section className="box">
      <h2 className="inline-heading">{String(block.data.heading || config.fallback)}</h2>
      <InlineListEditor
        field={config.field}
        items={items}
        marker={config.marker}
        onChange={(next) => updateDraft((current) => updateRecipeList(current, config.field, next))}
      />
    </section>
  );
}

function InlineBlockContent(props: {
  block: ContentBlock;
  draft: RecipeDraft;
  updateDraft: VisualRecipeCanvasProps['updateDraft'];
  localImageUrl: string | null;
  localImageStatus: LocalImageStatus;
  onPickImage: (file: File) => void;
  onRemoveImage: () => void;
}) {
  const { block, draft, updateDraft } = props;
  if (block.type === BLOCK_TYPES.RECIPE_HERO) return <HeroEditor draft={draft} updateDraft={updateDraft} imageUrl={props.localImageUrl} imageStatus={props.localImageStatus} onPickImage={props.onPickImage} onRemoveImage={props.onRemoveImage} />;
  if (block.type === BLOCK_TYPES.RECIPE_METADATA) return <MetadataEditor draft={draft} updateDraft={updateDraft} />;
  if ([BLOCK_TYPES.INGREDIENTS, BLOCK_TYPES.BEFORE_STARTING, BLOCK_TYPES.EQUIPMENT, BLOCK_TYPES.INSTRUCTIONS].includes(block.type as never)) {
    return <ListRecipeBlock block={block} draft={draft} updateDraft={updateDraft} />;
  }
  if (block.type === BLOCK_TYPES.HEADING) {
    return <input className="inline-heading" aria-label="Heading text" value={String(block.data.text ?? '')} onChange={(event) => updateDraft((current) => updateDraftBlock(current, block.id, (item) => ({ ...item, data: { ...item.data, text: event.target.value || 'Heading' } })))} />;
  }
  if (block.type === BLOCK_TYPES.TEXT) {
    return <div className="generic-inline-editor"><textarea aria-label="Text block" value={String(block.data.text ?? '')} onChange={(event) => updateDraft((current) => updateDraftBlock(current, block.id, (item) => ({ ...item, data: { ...item.data, text: event.target.value || 'Text' } })))} /></div>;
  }
  return <div dangerouslySetInnerHTML={{ __html: renderBlock(block, { recipe: draft.data.recipe, recipes: [draft.data.recipe], root: '#', localImageUrl: props.localImageUrl }) }} />;
}

function SortableBlockFrame({
  block,
  index,
  count,
  props,
}: {
  block: ContentBlock;
  index: number;
  count: number;
  props: VisualRecipeCanvasProps;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const width = resolvedBlockWidth(block, props.viewport);
  const required = REQUIRED_RECIPE_BLOCK_TYPES.includes(block.type);
  return (
    <section
      ref={setNodeRef}
      className={`editor-block-frame editor-width-${width}${props.selectedBlockId === block.id ? ' selected' : ''}${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelectBlock(block.id);
      }}
    >
      <div className="editor-block-toolbar">
        <button className="drag-handle" type="button" title="Drag section" aria-label={`Reorder ${labelForType(block.type)} section`} {...attributes} {...listeners}><GripVertical aria-hidden="true" size={16} /></button>
        <span>{labelForType(block.type)}</span>
        <button type="button" title="Move section up" aria-label="Move section up" disabled={index === 0} onClick={() => props.updateDraft((draft) => reorderDraftBlocks(draft, index, index - 1))}><ChevronUp aria-hidden="true" size={14} /></button>
        <button type="button" title="Move section down" aria-label="Move section down" disabled={index === count - 1} onClick={() => props.updateDraft((draft) => reorderDraftBlocks(draft, index, index + 1))}><ChevronDown aria-hidden="true" size={14} /></button>
        {!required && <button type="button" title="Remove block" aria-label="Remove block" onClick={() => props.updateDraft((draft) => removeDraftBlock(draft, block.id))}><Trash2 aria-hidden="true" size={14} /></button>}
      </div>
      <InlineBlockContent block={block} draft={props.draft} updateDraft={props.updateDraft} localImageUrl={props.localImageUrl} localImageStatus={props.localImageStatus} onPickImage={props.onPickImage} onRemoveImage={props.onRemoveImage} />
      <ResizeHandle width={width} onCommit={(nextWidth) => props.updateDraft((draft) => setBlockWidth(draft, block.id, props.viewport, nextWidth))} />
    </section>
  );
}

export function VisualRecipeCanvas(props: VisualRecipeCanvasProps) {
  const blockIds = useMemo(() => props.draft.layout.blocks.map((block) => block.id), [props.draft.layout.blocks]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleBlockDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const from = blockIds.indexOf(String(event.active.id));
    const to = blockIds.indexOf(String(event.over.id));
    props.updateDraft((draft) => reorderDraftBlocks(draft, from, to));
  }

  return (
    <CanvasPortal viewport={props.viewport}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBlockDragEnd}>
        <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
          <article className="recipe-detail-card editor-recipe" aria-label="Visual recipe editor" onClick={() => undefined}>
            {props.draft.layout.blocks.map((block, index) => (
              <SortableBlockFrame key={block.id} block={block} index={index} count={blockIds.length} props={props} />
            ))}
          </article>
        </SortableContext>
      </DndContext>
    </CanvasPortal>
  );
}
