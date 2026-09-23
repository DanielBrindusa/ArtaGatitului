import {
  ArrowDown,
  ArrowUp,
  Bold,
  CheckCircle2,
  ImagePlus,
  Italic,
  Link,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  BLOCK_TYPES,
  LAYOUT_WIDTHS,
  SPACING_TOKENS,
  validatePageSource,
  type Breakpoint,
  type ContentBlock,
  type LayoutWidth,
} from '../../../src/shared/index.mjs';
import {
  draftToPageSource,
  validateDraftForPublish,
  type PageDraft,
} from '../drafts/draftModel.mjs';
import { publishedCategories, publishedRecipeCatalog } from './contentCatalog';
import {
  setColumnsPreset,
  setPageBlockVisibility,
  setPageBlockWidth,
  updatePageBlock,
  updatePageSlug,
  updatePageTitle,
} from './pageEditorModel.mjs';

type RichSpan = { text: string; bold?: boolean; italic?: boolean; href?: string };
type RichNode = { type: 'paragraph' | 'heading' | 'bullet-list' | 'numbered-list'; level?: number; children?: RichSpan[]; items?: RichSpan[][] };

interface MoveTarget { id: string | null; label: string }

interface PageBlockInspectorProps {
  draft: PageDraft;
  block: ContentBlock | null;
  viewport: Breakpoint;
  moveTargets: MoveTarget[];
  updateDraft: (update: (draft: PageDraft) => PageDraft) => void;
  onMove: (parentId: string | null) => void;
  onRemove: () => void;
  onPickImage: (file: File) => void;
  onRemoveImage: () => void;
}

function widthAt(block: ContentBlock, breakpoint: Breakpoint): LayoutWidth {
  if (breakpoint === 'desktop') return block.layout?.width ?? 'wide';
  return block.responsive?.[breakpoint]?.width ?? block.layout?.width ?? 'wide';
}

function sourceLabel(source: string) {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function SafeRichTextEditor({ nodes, onChange }: { nodes: RichNode[]; onChange: (nodes: RichNode[]) => void }) {
  const normalized = nodes.length ? nodes : [{ type: 'paragraph' as const, children: [{ text: 'Text' }] }];
  const updateSpan = (nodeIndex: number, changes: Partial<RichSpan>) => {
    const next = structuredClone(normalized);
    const node = next[nodeIndex]!;
    const spans = node.type.includes('list') ? (node.items?.[0] ?? [{ text: 'Text' }]) : (node.children ?? [{ text: 'Text' }]);
    spans[0] = { ...spans[0], ...changes, text: changes.text || spans[0]?.text || 'Text' };
    if (node.type.includes('list')) node.items = [spans];
    else node.children = spans;
    onChange(next);
  };
  return (
    <div className="safe-rich-editor">
      {normalized.map((node, index) => {
        const span = node.type.includes('list') ? node.items?.[0]?.[0] : node.children?.[0];
        return (
          <div className="rich-node-editor" key={`${node.type}-${index}`}>
            <div className="rich-node-toolbar">
              <select aria-label={`Text row ${index + 1} type`} value={node.type} onChange={(event) => {
                const next = structuredClone(normalized);
                const text = span?.text || 'Text';
                const type = event.target.value as RichNode['type'];
                next[index] = type.includes('list') ? { type, items: [[{ text }]] } : type === 'heading' ? { type, level: 2, children: [{ text }] } : { type, children: [{ text }] };
                onChange(next);
              }}>
                <option value="paragraph">Paragraph</option><option value="heading">Heading</option><option value="bullet-list">Bullet list</option><option value="numbered-list">Numbered list</option>
              </select>
              <button type="button" title="Bold" aria-label="Bold" className={span?.bold ? 'active' : undefined} onClick={() => updateSpan(index, { bold: !span?.bold })}><Bold size={14} /></button>
              <button type="button" title="Italic" aria-label="Italic" className={span?.italic ? 'active' : undefined} onClick={() => updateSpan(index, { italic: !span?.italic })}><Italic size={14} /></button>
              <button type="button" title="Remove row" aria-label="Remove rich text row" disabled={normalized.length === 1} onClick={() => onChange(normalized.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button>
            </div>
            <textarea value={span?.text ?? ''} onChange={(event) => updateSpan(index, { text: event.target.value || 'Text' })} />
            <label><span><Link aria-hidden="true" size={12} /> Optional safe link</span><input value={span?.href ?? ''} placeholder="/page/ or https://example.com" onChange={(event) => updateSpan(index, { href: event.target.value || undefined })} /></label>
          </div>
        );
      })}
      <button className="secondary-command" type="button" onClick={() => onChange([...normalized, { type: 'paragraph', children: [{ text: 'New paragraph' }] }])}>Add paragraph</button>
    </div>
  );
}

function RecipePicker({ slugs, onChange }: { slugs: string[]; onChange: (slugs: string[]) => void }) {
  return (
    <div className="reference-picker">
      <label><span>Recipes</span><select value="" onChange={(event) => {
        const slug = event.target.value;
        if (slug && !slugs.includes(slug)) onChange([...slugs, slug]);
      }}><option value="">Add a recipe...</option>{publishedRecipeCatalog.filter((recipe) => !slugs.includes(recipe.slug)).map((recipe) => <option key={recipe.slug} value={recipe.slug}>{recipe.title}</option>)}</select></label>
      <ol>{slugs.map((slug, index) => {
        const recipe = publishedRecipeCatalog.find((item) => item.slug === slug);
        return <li key={slug}><span>{recipe?.title ?? slug}</span><button type="button" title="Move up" aria-label={`Move ${slug} up`} disabled={index === 0} onClick={() => { const next = [...slugs]; const [item] = next.splice(index, 1); if (item) next.splice(index - 1, 0, item); onChange(next); }}><ArrowUp size={13} /></button><button type="button" title="Move down" aria-label={`Move ${slug} down`} disabled={index === slugs.length - 1} onClick={() => { const next = [...slugs]; const [item] = next.splice(index, 1); if (item) next.splice(index + 1, 0, item); onChange(next); }}><ArrowDown size={13} /></button><button type="button" title="Remove" aria-label={`Remove ${slug}`} onClick={() => onChange(slugs.filter((item) => item !== slug))}><Trash2 size={13} /></button></li>;
      })}</ol>
    </div>
  );
}

export function PageBlockInspector(props: PageBlockInspectorProps) {
  const { draft, block, viewport, updateDraft } = props;
  const readiness = validateDraftForPublish(draft, {
    recipeSlugs: publishedRecipeCatalog.map((recipe) => recipe.slug),
    categorySlugs: publishedCategories.map((category) => category.slug),
  });
  const sourceValidation = validatePageSource(draftToPageSource(draft));

  function updateData(changes: Record<string, unknown>) {
    if (!block) return;
    updateDraft((current) => updatePageBlock(current, block.id, (item: ContentBlock) => ({ ...item, data: { ...item.data, ...changes } })));
  }

  function updateLayout(changes: Record<string, unknown>) {
    if (!block) return;
    updateDraft((current) => updatePageBlock(current, block.id, (item: ContentBlock) => ({ ...item, layout: { ...item.layout, ...changes } })));
  }

  const data = block?.data ?? {};
  const selectedSlugs = Array.isArray(data.slugs) ? data.slugs as string[] : [];

  return (
    <div className="inspector-content page-inspector">
      <div className="panel-heading"><div><span className="workspace-kicker">Selection</span><h2>{block ? block.type.replace(/-/g, ' ') : 'Page settings'}</h2></div><SlidersHorizontal aria-hidden="true" size={18} /></div>

      <section className="inspector-section">
        <h3>Page</h3>
        <label><span>Title</span><input value={draft.title} maxLength={200} onChange={(event) => updateDraft((current) => updatePageTitle(current, event.target.value))} /></label>
        <label><span>Slug</span><input value={draft.slug} disabled={draft.data.page.pageType === 'home' || Boolean(draft.sourceLink)} spellCheck={false} onChange={(event) => updateDraft((current) => updatePageSlug(current, event.target.value))} /></label>
        <label><span>Meta description</span><textarea maxLength={320} value={draft.data.page.description} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, page: { ...current.data.page, description: event.target.value } } }))} /></label>
        <label><span>Social image</span><input value={draft.data.page.socialImage ?? ''} placeholder="/assets/images/..." onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, page: { ...current.data.page, socialImage: event.target.value || null } } }))} /></label>
      </section>

      {block && <>
        <section className="inspector-section">
          <h3>{sourceLabel(viewport)} layout</h3>
          <span className="inspector-label">Width</span>
          <div className="inspector-segments" aria-label={`${viewport} block width`}>{LAYOUT_WIDTHS.map((width) => <button key={width} type="button" className={widthAt(block, viewport) === width ? 'active' : undefined} onClick={() => updateDraft((current) => setPageBlockWidth(current, block.id, viewport, width))}>{width}</button>)}</div>
          <label><span>Vertical spacing</span><select value={block.layout?.paddingBlock ?? 'none'} onChange={(event) => updateLayout({ paddingBlock: event.target.value })}>{SPACING_TOKENS.map((token) => <option key={token}>{token}</option>)}</select></label>
          <label className="toggle-field"><input type="checkbox" checked={block.responsive?.[viewport]?.visible !== false} onChange={(event) => updateDraft((current) => setPageBlockVisibility(current, block.id, viewport, event.target.checked))} /><span>Visible at {viewport}</span></label>
          {props.moveTargets.length > 0 && <label><span>Move into</span><select value="" onChange={(event) => { if (event.target.value) props.onMove(event.target.value === 'root' ? null : event.target.value); }}><option value="">Choose destination...</option>{props.moveTargets.map((target) => <option key={target.id ?? 'root'} value={target.id ?? 'root'}>{target.label}</option>)}</select></label>}
          {draft.data.page.pageType !== 'home' || block.type !== BLOCK_TYPES.SECTION || draft.layout.blocks.length > 1 ? <button className="danger-command inspector-remove-command" type="button" onClick={props.onRemove}><Trash2 size={15} />Remove block</button> : null}
        </section>

        {block.type === BLOCK_TYPES.HEADING && <section className="inspector-section"><h3>Heading</h3><label><span>Text</span><input value={String(data.text ?? '')} onChange={(event) => updateData({ text: event.target.value || 'Heading' })} /></label><label><span>Level</span><select value={Number(data.level ?? 2)} onChange={(event) => updateData({ level: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>H{level}</option>)}</select></label></section>}
        {block.type === BLOCK_TYPES.RICH_TEXT && <section className="inspector-section"><h3>Rich text</h3><SafeRichTextEditor nodes={(Array.isArray(data.nodes) ? data.nodes : []) as RichNode[]} onChange={(nodes) => updateData({ nodes })} /></section>}
        {block.type === BLOCK_TYPES.HERO && <section className="inspector-section"><h3>Hero</h3><label><span>Eyebrow</span><input value={String(data.eyebrow ?? '')} onChange={(event) => updateData({ eyebrow: event.target.value || undefined })} /></label><label><span>Title</span><input value={String(data.title ?? '')} onChange={(event) => updateData({ title: event.target.value || 'Page title' })} /></label><label><span>Body</span><textarea value={String(data.body ?? '')} onChange={(event) => updateData({ body: event.target.value || undefined })} /></label><label className="toggle-field"><input type="checkbox" checked={data.showSearch === true} onChange={(event) => updateData({ showSearch: event.target.checked })} /><span>Show recipe search</span></label><label className="toggle-field"><input type="checkbox" checked={data.showRandomRecipe === true} onChange={(event) => updateData({ showRandomRecipe: event.target.checked })} /><span>Show random recipe</span></label></section>}
        {block.type === BLOCK_TYPES.IMAGE && <section className="inspector-section"><h3>Image</h3><label><span>Source</span><input value={String(data.src ?? '')} onChange={(event) => updateData({ src: event.target.value || './icon.png' })} /></label><label><span>Alt text</span><input value={String(data.alt ?? '')} onChange={(event) => updateData({ alt: event.target.value || 'Page image' })} /></label><label className="image-picker-label"><ImagePlus size={15} /><span>Select local image</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onPickImage(file); event.currentTarget.value = ''; }} /></label>{draft.data.attachments.some((item) => item.id === block.id) && <button className="secondary-command" type="button" onClick={props.onRemoveImage}>Remove local image</button>}</section>}
        {block.type === BLOCK_TYPES.BUTTON && <section className="inspector-section"><h3>Button</h3><label><span>Label</span><input value={String(data.label ?? '')} onChange={(event) => updateData({ label: event.target.value || 'Button' })} /></label><label><span>Link</span><input value={String(data.href ?? '')} onChange={(event) => updateData({ href: event.target.value || '#' })} /></label><label><span>Internal link</span><select value="" onChange={(event) => event.target.value && updateData({ href: event.target.value })}><option value="">Choose...</option><option value="/">Homepage</option>{publishedCategories.map((category) => <option key={category.slug} value={`/categorie/${category.slug}/`}>{category.title}</option>)}{publishedRecipeCatalog.map((recipe) => <option key={recipe.slug} value={`/retete/${recipe.slug}/`}>{recipe.title}</option>)}</select></label><label className="toggle-field"><input type="checkbox" checked={data.target === '_blank'} onChange={(event) => updateData({ target: event.target.checked ? '_blank' : '_self' })} /><span>Open in new tab</span></label></section>}
        {block.type === BLOCK_TYPES.SEARCH && <section className="inspector-section"><h3>Search</h3><label><span>Label</span><input value={String(data.label ?? '')} onChange={(event) => updateData({ label: event.target.value || undefined })} /></label><label><span>Placeholder</span><input value={String(data.placeholder ?? '')} onChange={(event) => updateData({ placeholder: event.target.value || 'Search recipes' })} /></label><label><span>Button label</span><input value={String(data.buttonLabel ?? '')} onChange={(event) => updateData({ buttonLabel: event.target.value || 'Search' })} /></label></section>}
        {[BLOCK_TYPES.RECIPE_GRID, BLOCK_TYPES.FEATURED_RECIPES, BLOCK_TYPES.LATEST_RECIPES, BLOCK_TYPES.CATEGORY_GRID].includes(block.type as never) && <section className="inspector-section"><h3>Discovery</h3><label><span>Eyebrow</span><input value={String(data.eyebrow ?? '')} onChange={(event) => updateData({ eyebrow: event.target.value || undefined })} /></label><label><span>Heading</span><input value={String(data.heading ?? '')} onChange={(event) => updateData({ heading: event.target.value || 'Recipes' })} /></label>{[BLOCK_TYPES.RECIPE_GRID, BLOCK_TYPES.FEATURED_RECIPES].includes(block.type as never) && <RecipePicker slugs={selectedSlugs} onChange={(slugs) => updateData({ slugs })} />}{block.type === BLOCK_TYPES.RECIPE_GRID && <><label><span>Source</span><select value={String(data.source ?? 'manual')} onChange={(event) => updateData({ source: event.target.value })}><option value="manual">Manual selection</option><option value="category">Category</option><option value="tag">Tag</option><option value="latest">Latest</option></select></label>{data.source === 'category' && <label><span>Category</span><select value={String(data.category ?? '')} onChange={(event) => updateData({ category: event.target.value })}><option value="">Choose...</option>{publishedCategories.map((category) => <option key={category.slug} value={category.title}>{category.title}</option>)}</select></label>}</>}{block.type !== BLOCK_TYPES.CATEGORY_GRID && <label><span>Limit</span><input type="number" min="1" max="24" value={Number(data.limit ?? 6)} onChange={(event) => updateData({ limit: Math.min(24, Math.max(1, Number(event.target.value) || 1)) })} /></label>}</section>}
        {block.type === BLOCK_TYPES.COLUMNS && <section className="inspector-section"><h3>Column proportions</h3><div className="column-preset-grid">{viewport === 'mobile' ? <button type="button" onClick={() => updateDraft((current) => setColumnsPreset(current, block.id, viewport, (data.blocks as ContentBlock[]).map(() => 12)))}>Stack</button> : [[6, 6], [4, 8], [8, 4], [3, 9], [9, 3]].filter((preset) => preset.length === (data.blocks as ContentBlock[]).length).map((preset) => <button type="button" key={preset.join('-')} onClick={() => updateDraft((current) => setColumnsPreset(current, block.id, viewport, preset))}>{preset.join(' / ')}</button>)}</div></section>}
      </>}

      <section className={`readiness-panel${readiness.valid && sourceValidation.valid ? ' ready' : ''}`} aria-live="polite"><div><CheckCircle2 aria-hidden="true" size={18} /><strong>{readiness.valid && sourceValidation.valid ? 'Ready to publish' : `${readiness.errors.length} issue${readiness.errors.length === 1 ? '' : 's'} before publishing`}</strong></div>{!readiness.valid && <ul>{readiness.errors.map((error) => <li key={error}>{error}</li>)}</ul>}</section>
    </div>
  );
}
