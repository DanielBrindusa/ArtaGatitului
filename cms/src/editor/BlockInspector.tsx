import { AlertCircle, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import {
  BLOCK_TYPES,
  LAYOUT_WIDTHS,
  SPACING_TOKENS,
  resolveTemplateLayout,
  updateTemplateBlockOverride,
  type ContentBlock,
  type LayoutWidth,
} from '../../../src/shared/index.mjs';
import {
  validateDraftForPublish,
  type RecipeDraft,
} from '../drafts/draftModel.mjs';
import { knownCategories, knownTagGroups, siteTemplates } from './contentCatalog';
import {
  REQUIRED_RECIPE_BLOCK_TYPES,
  resolvedBlockWidth,
  setBlockVisibility,
  setBlockWidth,
  updateDraftBlock,
  updateDraftSlug,
  updateRecipeFields,
} from './editorModel.mjs';
import type { EditorViewport } from './VisualRecipeCanvas';

interface BlockInspectorProps {
  draft: RecipeDraft;
  block: ContentBlock | null;
  viewport: EditorViewport;
  updateDraft: (update: (draft: RecipeDraft) => RecipeDraft) => void;
}

function blockListStyles(block: ContentBlock) {
  switch (block.type) {
    case BLOCK_TYPES.INGREDIENTS: return ['checkbox', 'bullet', 'plain'];
    case BLOCK_TYPES.BEFORE_STARTING: return ['checklist', 'bullet', 'plain'];
    case BLOCK_TYPES.EQUIPMENT: return ['bullet', 'plain'];
    case BLOCK_TYPES.INSTRUCTIONS: return ['numbered', 'plain'];
    default: return [];
  }
}

export function BlockInspector({ draft, block, viewport, updateDraft }: BlockInspectorProps) {
  const readiness = validateDraftForPublish(draft);
  const attachment = draft.data.attachments[0];
  const required = block ? REQUIRED_RECIPE_BLOCK_TYPES.includes(block.type) : false;
  const recipeTemplates = siteTemplates.templates.filter((template) => template.contentType === 'recipe');
  const assignment = draft.data.recipe.template;

  function updateBlockData(changes: Record<string, unknown>) {
    if (!block) return;
    updateDraft((current) => updateDraftBlock(current, block.id, (item) => ({
      ...item,
      data: { ...item.data, ...changes },
    })));
  }

  function updateBlockLayout(changes: Record<string, unknown>) {
    if (!block) return;
    updateDraft((current) => {
      const template = updateTemplateBlockOverride(current.data.recipe.template, recipeTemplates, block, { layout: changes });
      if (template) return { ...current, data: { ...current.data, recipe: { ...current.data.recipe, template } } };
      return updateDraftBlock(current, block.id, (item) => ({ ...item, layout: { ...item.layout, ...changes } }));
    });
  }

  function updateBlockWidth(width: LayoutWidth) {
    if (!block) return;
    updateDraft((current) => {
      const patch = viewport === 'desktop' ? { layout: { width } } : { responsive: { [viewport]: { width } } };
      const template = updateTemplateBlockOverride(current.data.recipe.template, recipeTemplates, block, patch);
      if (template) return { ...current, data: { ...current.data, recipe: { ...current.data.recipe, template } } };
      return setBlockWidth(current, block.id, viewport, width);
    });
  }

  function updateBlockVisibility(visible: boolean) {
    if (!block) return;
    updateDraft((current) => {
      const template = updateTemplateBlockOverride(current.data.recipe.template, recipeTemplates, block, { responsive: { [viewport]: { visible } } });
      if (template) return { ...current, data: { ...current.data, recipe: { ...current.data.recipe, template } } };
      return setBlockVisibility(current, block.id, viewport, visible);
    });
  }

  function setKnownTag(group: string, tag: string, checked: boolean) {
    updateDraft((current) => {
      const existing = current.data.recipe.tags[group] ?? [];
      const values = checked
        ? Array.from(new Set([...existing, tag]))
        : existing.filter((item) => item !== tag);
      return updateRecipeFields(current, {
        tags: { ...current.data.recipe.tags, [group]: values },
      });
    });
  }

  return (
    <div className="inspector-content">
      <div className="panel-heading">
        <div><span className="workspace-kicker">Selection</span><h2>{block ? block.type.replace(/-/g, ' ') : 'Recipe settings'}</h2></div>
        <SlidersHorizontal aria-hidden="true" size={18} />
      </div>

      <section className="inspector-section template-link-controls">
        <h3>Template</h3>
        <label><span>Recipe layout</span><select value={assignment?.mode === 'linked' ? assignment.id ?? '' : 'detached'} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, recipe: { ...current.data.recipe, template: event.target.value === 'detached' ? { id: null, mode: 'detached', overrides: {} } : { id: event.target.value, mode: 'linked', overrides: {} } } } }))}><option value="detached">Detached layout</option>{recipeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
        {assignment?.mode === 'linked' && <div className="template-link-actions"><button className="secondary-command" type="button" onClick={() => { if (!window.confirm('Remove all local layout overrides and return to the template defaults? Recipe content will not be changed.')) return; updateDraft((current) => ({ ...current, data: { ...current.data, recipe: { ...current.data.recipe, template: { id: current.data.recipe.template?.id ?? 'recipe-default', mode: 'linked', overrides: {} } } } })); }}>Reset to template</button><button className="secondary-command" type="button" onClick={() => { if (!window.confirm('Detach this recipe? Future template changes will no longer update its layout.')) return; updateDraft((current) => ({ ...current, layout: resolveTemplateLayout(current.layout, current.data.recipe.template, recipeTemplates), data: { ...current.data, recipe: { ...current.data.recipe, template: { id: null, mode: 'detached', overrides: {} } } } })); }}>Detach</button></div>}
        <p className="panel-note">{assignment?.mode === 'linked' ? 'Template defaults remain linked; explicit block settings win.' : 'This layout is independent from future template changes.'}</p>
      </section>

      {!block && <p className="panel-note">Select a block on the canvas to edit its layout and presentation.</p>}

      {(block?.type === BLOCK_TYPES.RECIPE_HERO || !block) && (
        <section className="inspector-section">
          <h3>Recipe identity</h3>
          <label><span>Slug</span><input value={draft.slug} spellCheck={false} onChange={(event) => updateDraft((current) => updateDraftSlug(current, event.target.value))} /></label>
          <label><span>Category</span><select value={draft.data.recipe.category} onChange={(event) => updateDraft((current) => updateRecipeFields(current, { category: event.target.value }))}><option value="">Choose a category</option>{knownCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
          {attachment && <label><span>Image alt text</span><input value={attachment.alt} onChange={(event) => updateDraft((current) => ({ ...current, data: { ...current.data, attachments: current.data.attachments.map((item, index) => index === 0 ? { ...item, alt: event.target.value } : item) } }))} /></label>}
        </section>
      )}

      {block && (
        <>
          <section className="inspector-section">
            <h3>{viewport} layout</h3>
            <span className="inspector-label">Width</span>
            <div className="inspector-segments" aria-label={`${viewport} block width`}>
              {LAYOUT_WIDTHS.map((width) => <button key={width} type="button" className={resolvedBlockWidth(block, viewport) === width ? 'active' : undefined} onClick={() => updateBlockWidth(width)}>{width}</button>)}
            </div>
            <label><span>Vertical spacing</span><select value={block.layout?.paddingBlock ?? 'none'} onChange={(event) => updateBlockLayout({ paddingBlock: event.target.value })}>{SPACING_TOKENS.map((token) => <option key={token}>{token}</option>)}</select></label>
            <label className="toggle-field"><input type="checkbox" checked={block.responsive?.[viewport]?.visible !== false} disabled={required} onChange={(event) => updateBlockVisibility(event.target.checked)} /><span>Visible at {viewport}</span></label>
            {required && <p className="field-help">Required recipe blocks cannot be hidden.</p>}
          </section>

          {['ingredients', 'before-starting', 'equipment', 'instructions', 'rating', 'related-recipes'].includes(block.type) && (
            <section className="inspector-section">
              <h3>Content display</h3>
              <label><span>Section heading</span><input value={String(block.data.heading ?? '')} onChange={(event) => updateBlockData({ heading: event.target.value || 'Section' })} /></label>
              {blockListStyles(block).length > 0 && <label><span>List style</span><select value={String(block.data.listStyle ?? blockListStyles(block)[0])} onChange={(event) => updateBlockData({ listStyle: event.target.value })}>{blockListStyles(block).map((style) => <option key={style}>{style}</option>)}</select></label>}
              {block.type === BLOCK_TYPES.RELATED_RECIPES && <label><span>Maximum recipes</span><input type="number" min="1" max="12" value={Number(block.data.limit ?? 6)} onChange={(event) => updateBlockData({ limit: Math.min(12, Math.max(1, Number(event.target.value) || 1)) })} /></label>}
              {block.type === BLOCK_TYPES.RATING && <p className="field-help">Ratings are display-only here. Community values cannot be edited by authors.</p>}
            </section>
          )}

          {block.type === BLOCK_TYPES.RECIPE_HERO && (
            <section className="inspector-section">
              <h3>Hero display</h3>
              <label className="toggle-field"><input type="checkbox" checked={block.data.showCategory !== false} onChange={(event) => updateBlockData({ showCategory: event.target.checked })} /><span>Show category</span></label>
              <label className="toggle-field"><input type="checkbox" checked={block.data.showDescription !== false} onChange={(event) => updateBlockData({ showDescription: event.target.checked })} /><span>Show description</span></label>
            </section>
          )}

          {block.type === BLOCK_TYPES.HEADING && <section className="inspector-section"><h3>Heading</h3><label><span>Level</span><select value={Number(block.data.level ?? 2)} onChange={(event) => updateBlockData({ level: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>H{level}</option>)}</select></label></section>}
          {block.type === BLOCK_TYPES.IMAGE && (
            <section className="inspector-section">
              <h3>Image</h3>
              <label><span>Source</span><input value={String(block.data.src ?? '')} onChange={(event) => updateBlockData({ src: event.target.value || './icon.png' })} /></label>
              <label><span>Alt text</span><input value={String(block.data.alt ?? '')} onChange={(event) => updateBlockData({ alt: event.target.value || 'Image' })} /></label>
              <label><span>Fit</span><select value={block.variant ?? 'default'} onChange={(event) => updateDraft((current) => updateDraftBlock(current, block.id, (item) => ({ ...item, variant: event.target.value })))}><option value="default">Default</option><option value="cover">Cover</option><option value="contain">Contain</option></select></label>
            </section>
          )}
          {block.type === BLOCK_TYPES.SPACER && <section className="inspector-section"><h3>Spacer</h3><label><span>Size</span><select value={String(block.data.size ?? 'md')} onChange={(event) => updateBlockData({ size: event.target.value })}>{SPACING_TOKENS.map((token) => <option key={token}>{token}</option>)}</select></label></section>}
          {block.type === BLOCK_TYPES.BUTTON && <section className="inspector-section"><h3>Button</h3><label><span>Label</span><input value={String(block.data.label ?? '')} onChange={(event) => updateBlockData({ label: event.target.value || 'Button' })} /></label><label><span>Link</span><input value={String(block.data.href ?? '')} onChange={(event) => updateBlockData({ href: event.target.value || '#' })} /></label></section>}
        </>
      )}

      {(block?.type === BLOCK_TYPES.RECIPE_HERO || !block) && (
        <section className="inspector-section inspector-tags">
          <h3>Known tags</h3>
          <p className="field-help">Selections come from the existing recipe catalog.</p>
          {Object.entries(knownTagGroups).map(([group, tags]) => (
            <details key={group}>
              <summary>{group}</summary>
              <div>{tags.map((tag) => <label key={tag} className="tag-choice"><input type="checkbox" checked={(draft.data.recipe.tags[group] ?? []).includes(tag)} onChange={(event) => setKnownTag(group, tag, event.target.checked)} /><span>{tag}</span></label>)}</div>
            </details>
          ))}
        </section>
      )}

      <section className={`readiness-panel${readiness.valid ? ' ready' : ''}`} aria-live="polite">
        <div>{readiness.valid ? <CheckCircle2 aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />}<strong>{readiness.valid ? 'Ready for Milestone 9' : `${readiness.errors.length} issue${readiness.errors.length === 1 ? '' : 's'} before publishing`}</strong></div>
        {!readiness.valid && <ul>{readiness.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      </section>
    </div>
  );
}
