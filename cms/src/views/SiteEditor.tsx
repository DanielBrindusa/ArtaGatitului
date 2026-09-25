import { GitHubConnectionDialog } from '../publishing/GitHubConnectionDialog';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CloudDownload,
  ExternalLink,
  GitFork,
  GripVertical,
  Layers3,
  LoaderCircle,
  LogOut,
  Monitor,
  Palette,
  Plus,
  RefreshCw,
  Settings2,
  Smartphone,
  Tags,
  Tablet,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  collectGlobalBlockUsage,
  deleteCategoryWithReplacement,
  detachGlobalBlockReference,
  mergeTag,
  renameCategory,
  renderSiteThemeCss,
  reorderNavigationItems,
  replaceTemplateAndDelete,
  resetTheme,
  validateSiteBundle,
} from '../../../src/shared/index.mjs';
import type { AppRoute } from '../app/useAppRoute';
import type { AnyDraft, SiteBundle, SiteDraft } from '../drafts/draftModel.mjs';
import { ExportDraftButton, UndoRedoControls } from '../components/EditorSafetyControls';
import { PublicationHistory } from '../components/PublicationHistory';
import { isRecipeDraft } from '../drafts/draftModel.mjs';
import { useDraftWorkspace } from '../drafts/useDraftWorkspace';
import { useGitHubSitePublishing } from '../publishing/useGitHubSitePublishing';
import type { GitHubSitePublishingController } from '../publishing/useGitHubSitePublishing';

type Tab = 'templates' | 'globals' | 'navigation' | 'taxonomies' | 'theme' | 'settings';
type PreviewViewport = 'desktop' | 'tablet' | 'mobile';
type PreviewKind = 'home' | 'recipe';
type TemplateSlot = { id: string; type: string; layout?: { width?: string; paddingBlock?: string }; variant?: string };
type Template = { id: string; name: string; contentType: 'recipe' | 'page' | 'category'; pageType?: string; locked?: boolean; slots: TemplateSlot[] };
type GlobalBlock = { id: string; name: string; status: string; block: { id: string; type: string; data: Record<string, unknown>; [key: string]: unknown } };
type NavigationItem = { id: string; label: string; type: string; target: string; children: NavigationItem[] };
type Navigation = {
  modelVersion: 1;
  header: { logoMark: string; siteTitle: string; logoHref: 'home'; searchVisible: boolean; themeSwitcherVisible: boolean; menuPlacement: string; primaryItems: NavigationItem[]; menuItems: NavigationItem[] };
  footer: { copyright: string; showLogo: boolean; text: string; links: NavigationItem[]; socialLinks: NavigationItem[] };
};
type Category = { id: string; slug: string; title: string; name?: string; description: string; status: string };
type TagGroup = { label: string; options: string[] };
type Theme = {
  modelVersion: 1;
  colors: Record<'primary' | 'accent' | 'background' | 'surface' | 'text' | 'mutedText' | 'border', string>;
  typography: { headingFont: string; bodyFont: string; fontScale: string };
  layout: { contentWidth: string; sectionSpacing: string; cardPadding: string };
  shape: { cardRadius: string; buttonRadius: string };
  cards: { border: string; shadow: string };
  buttons: { size: string };
};
type SiteSettings = { modelVersion: 1; siteTitle: string; siteDescription: string; language: 'ro'; locale: 'ro_RO'; defaultSocialImage: string; defaultTemplates: Record<string, string> };

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'templates', label: 'Templates' },
  { id: 'globals', label: 'Global blocks' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'taxonomies', label: 'Categories & tags' },
  { id: 'theme', label: 'Theme' },
  { id: 'settings', label: 'Settings' },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function replaceGlobalReferences(blocks: Array<Record<string, unknown>>, globalId: string, globals: GlobalBlock[]): Array<Record<string, unknown>> {
  return blocks.map((block) => {
    if (block.type === 'global-reference' && (block.data as Record<string, unknown>)?.globalId === globalId) {
      return detachGlobalBlockReference(block as never, globals as never, `${String(block.id)}-local`) as unknown as Record<string, unknown>;
    }
    const data = block.data as Record<string, unknown> | undefined;
    return Array.isArray(data?.blocks)
      ? { ...block, data: { ...data, blocks: replaceGlobalReferences(data.blocks as Array<Record<string, unknown>>, globalId, globals) } }
      : block;
  });
}

function move<T>(items: T[], index: number, direction: -1 | 1) {
  return reorderNavigationItems(items, index, index + direction);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="site-field"><span>{label}</span>{children}</label>;
}

function ImpactNote({ children }: { children: React.ReactNode }) {
  return <div className="site-impact-note"><AlertTriangle aria-hidden="true" size={17} />{children}</div>;
}

function TemplatesPanel({ site, update, setError }: { site: SiteBundle; update: (site: SiteBundle) => void; setError: (message: string | null) => void }) {
  const templates = (site.templates.templates ?? []) as unknown as Template[];
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '');
  const [replacementId, setReplacementId] = useState('');
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const contents = [...site.recipes, ...site.pages] as Array<Record<string, unknown>>;
  const usedBy = contents.filter((item) => {
    const assignment = item.template as { id?: string; mode?: string } | undefined;
    return assignment?.mode === 'linked' && assignment.id === selected?.id;
  });
  if (!selected) return <p>No templates are configured.</p>;
  const activeTemplate = selected;

  function updateTemplate(changes: Partial<Template>) {
    update({ ...site, templates: { ...site.templates, templates: templates.map((template) => template.id === activeTemplate.id ? { ...template, ...changes } : template) } });
  }

  function deleteTemplate() {
    try {
      if (activeTemplate.locked) throw new Error('This default template is protected. Change the site default before removing it.');
      if (usedBy.length && !replacementId) throw new Error('Choose a compatible replacement template first.');
      if (!window.confirm(usedBy.length ? `Replace this template for ${usedBy.length} linked items and delete it?` : 'Delete this unused template?')) return;
      const outcome = (usedBy.length
        ? replaceTemplateAndDelete(templates as never, contents as never, activeTemplate.id, replacementId)
        : { templates: templates.filter((template) => template.id !== activeTemplate.id), contents }) as { templates: Template[]; contents: Array<Record<string, unknown>> };
      const recipes = outcome.contents.filter((item) => 'ingredients' in item) as unknown as SiteBundle['recipes'];
      const pages = outcome.contents.filter((item) => 'pageType' in item) as unknown as SiteBundle['pages'];
      update({ ...site, templates: { ...site.templates, templates: outcome.templates }, recipes, pages });
      setSelectedId(outcome.templates[0]?.id ?? '');
      setReplacementId('');
    } catch (error) { setError(error instanceof Error ? error.message : 'The template could not be deleted.'); }
  }

  return <div className="site-two-column">
    <aside className="site-list-panel">
      <div className="site-panel-heading"><div><span>Template library</span><strong>{templates.length} layouts</strong></div><button className="icon-command" type="button" title="Add template" onClick={() => {
        const id = `template-${Date.now().toString(36)}`;
        const next: Template = { id, name: 'New template', contentType: 'page', slots: [{ id: 'intro', type: 'section', layout: { width: 'wide', paddingBlock: 'md' }, variant: 'default' }] };
        update({ ...site, templates: { ...site.templates, templates: [...templates, next] } });
        setSelectedId(id);
      }}><Plus size={16} /></button></div>
      {templates.map((template) => <button key={template.id} className={`site-list-row${template.id === activeTemplate.id ? ' active' : ''}`} type="button" onClick={() => setSelectedId(template.id)}><Layers3 size={17} /><span><strong>{template.name}</strong><small>{template.contentType}</small></span><b>{contents.filter((item) => (item.template as { id?: string })?.id === template.id).length}</b></button>)}
    </aside>
    <section className="site-detail-panel">
      <div className="site-section-heading"><div><span>Template</span><h2>{activeTemplate.name}</h2></div>{!activeTemplate.locked && <button className="danger-command" type="button" onClick={deleteTemplate}><Trash2 size={16} />Delete</button>}</div>
      {usedBy.length > 0 && <ImpactNote><span><strong>Used by {usedBy.length} linked pages or recipes.</strong> Changes apply to them unless they have an explicit override. {usedBy.slice(0, 4).map((item) => String(item.title ?? item.name ?? item.slug)).join(', ')}.</span></ImpactNote>}
      <div className="site-form-grid">
        <Field label="Name"><input value={activeTemplate.name} onChange={(event) => updateTemplate({ name: event.target.value })} /></Field>
        <Field label="Content type"><select value={activeTemplate.contentType} disabled={usedBy.length > 0} onChange={(event) => updateTemplate({ contentType: event.target.value as Template['contentType'] })}><option value="recipe">Recipe</option><option value="page">Page</option><option value="category">Category</option></select></Field>
      </div>
      <div className="site-subheading"><h3>Inherited slot order</h3><span>Template defaults, then local overrides</span></div>
      <div className="template-slot-list">{activeTemplate.slots.map((slot, index) => <div className="template-slot" key={slot.id}><GripVertical size={16} /><span><strong>{slot.type}</strong><small>{slot.id}</small></span><select aria-label={`${slot.type} width`} value={slot.layout?.width ?? 'wide'} onChange={(event) => updateTemplate({ slots: activeTemplate.slots.map((item) => item.id === slot.id ? { ...item, layout: { ...item.layout, width: event.target.value } } : item) })}><option value="narrow">Narrow</option><option value="medium">Medium</option><option value="wide">Wide</option><option value="full">Full</option></select><button className="icon-command" type="button" disabled={index === 0} title="Move up" onClick={() => updateTemplate({ slots: move(activeTemplate.slots, index, -1) })}><ArrowUp size={15} /></button><button className="icon-command" type="button" disabled={index === activeTemplate.slots.length - 1} title="Move down" onClick={() => updateTemplate({ slots: move(activeTemplate.slots, index, 1) })}><ArrowDown size={15} /></button></div>)}</div>
      <div className="template-sample-preview"><span>Representative preview</span><h3>{activeTemplate.contentType === 'recipe' ? 'Tartă cu mere și scorțișoară' : 'Povestea bucătăriei noastre'}</h3><p>{activeTemplate.contentType === 'recipe' ? '45 min · 8 porții · Mere, făină, scorțișoară' : 'A sample page using safe fixture content.'}</p><div>{activeTemplate.slots.map((slot) => <span key={slot.id}>{slot.type}</span>)}</div></div>
      {usedBy.length > 0 && <Field label="Replacement for deletion"><select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">Choose replacement</option>{templates.filter((template) => template.id !== activeTemplate.id && template.contentType === activeTemplate.contentType).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field>}
    </section>
  </div>;
}

function GlobalsPanel({ site, update, setError }: { site: SiteBundle; update: (site: SiteBundle) => void; setError: (message: string | null) => void }) {
  const globals = (site.globalBlocks.blocks ?? []) as unknown as GlobalBlock[];
  const [selectedId, setSelectedId] = useState(globals[0]?.id ?? '');
  const selected = globals.find((entry) => entry.id === selectedId) ?? globals[0];
  const usage = selected ? collectGlobalBlockUsage(site.pages as unknown as Array<Record<string, unknown>>, selected.id) : [];
  if (!selected) return <button className="primary-command" type="button" onClick={() => {
    const entry: GlobalBlock = { id: 'global-discovery', name: 'Recipe discovery', status: 'published', block: { id: 'global-discovery-content', type: 'random-recipe', data: { label: 'Descoperă o rețetă' } } };
    update({ ...site, globalBlocks: { ...site.globalBlocks, blocks: [entry] } }); setSelectedId(entry.id);
  }}><Plus size={16} />Add global block</button>;
  const activeGlobal = selected;

  function updateGlobal(changes: Partial<GlobalBlock>) {
    update({ ...site, globalBlocks: { ...site.globalBlocks, blocks: globals.map((entry) => entry.id === activeGlobal.id ? { ...entry, ...changes } : entry) } });
  }
  function detachUsages() {
    if (!window.confirm(`Convert ${usage.length} usages to independent local copies?`)) return;
    const pages = site.pages.map((page) => ({ ...page, layout: { ...page.layout, blocks: replaceGlobalReferences(page.layout.blocks as unknown as Array<Record<string, unknown>>, activeGlobal.id, globals) as never } }));
    update({ ...site, pages });
  }
  function remove() {
    if (usage.length) { setError(`This global block is used on ${usage.length} page${usage.length === 1 ? '' : 's'}. Detach those usages first.`); return; }
    if (!window.confirm('Delete this unused global block?')) return;
    const blocks = globals.filter((entry) => entry.id !== activeGlobal.id);
    update({ ...site, globalBlocks: { ...site.globalBlocks, blocks } });
    setSelectedId(blocks[0]?.id ?? '');
  }
  return <div className="site-two-column"><aside className="site-list-panel"><div className="site-panel-heading"><div><span>Reusable content</span><strong>{globals.length} global blocks</strong></div><button className="icon-command" type="button" title="Add global block" onClick={() => {
    const id = `global-${Date.now().toString(36)}`;
    const entry: GlobalBlock = { id, name: 'New discovery block', status: 'published', block: { id: `${id}-content`, type: 'random-recipe', data: { label: 'Descoperă o rețetă' } } };
    update({ ...site, globalBlocks: { ...site.globalBlocks, blocks: [...globals, entry] } }); setSelectedId(id);
  }}><Plus size={16} /></button></div>{globals.map((entry) => { const count = collectGlobalBlockUsage(site.pages as unknown as Array<Record<string, unknown>>, entry.id).length; return <button className={`site-list-row${entry.id === selected.id ? ' active' : ''}`} type="button" key={entry.id} onClick={() => setSelectedId(entry.id)}><RefreshCw size={16} /><span><strong>{entry.name}</strong><small>Global block</small></span><b>{count}</b></button>; })}</aside><section className="site-detail-panel"><div className="site-section-heading"><div><span>Global block</span><h2>{selected.name}</h2></div><button className="danger-command" type="button" onClick={remove}><Trash2 size={16} />Delete</button></div>{usage.length > 0 && <ImpactNote><span><strong>Used on {usage.length} page{usage.length === 1 ? '' : 's'}.</strong> {usage.map((item) => item.title).join(', ')}</span><button className="secondary-command" type="button" onClick={detachUsages}>Convert to local copies</button></ImpactNote>}<Field label="Name"><input value={selected.name} onChange={(event) => updateGlobal({ name: event.target.value })} /></Field><Field label="Call to action label"><input value={String(selected.block.data.label ?? '')} onChange={(event) => updateGlobal({ block: { ...selected.block, data: { ...selected.block.data, label: event.target.value } } })} /></Field><div className="global-block-preview"><span>Global Block</span><button type="button">{String(selected.block.data.label ?? 'Descoperă o rețetă')}</button></div></section></div>;
}

function NavigationList({ items, onChange, targets, depth = 1, allowChildren = true }: { items: NavigationItem[]; onChange: (items: NavigationItem[]) => void; targets: { categories: Category[]; pages: SiteBundle['pages']; recipes: SiteBundle['recipes'] }; depth?: 1 | 2; allowChildren?: boolean }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  function updateItem(index: number, changes: Partial<NavigationItem>) { onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item)); }
  function targetOptions(type: string) {
    if (type === 'home') return [{ value: 'home', label: 'Homepage' }];
    if (type === 'category') return targets.categories.map((item) => ({ value: item.slug, label: item.title }));
    if (type === 'page') return targets.pages.map((item) => ({ value: item.slug, label: item.title }));
    if (type === 'recipe') return targets.recipes.map((item) => ({ value: item.slug, label: item.title }));
    if (type === 'system') return ['portfolio', 'ingredient-matcher', 'randomizer', 'search', 'categories', 'recipe-builder'].map((value) => ({ value, label: value }));
    return [];
  }
  return <div className={`navigation-list navigation-depth-${depth}`}>{items.map((item, index) => <div className="navigation-item-group" key={item.id}>
    <div className="navigation-row" draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== null && dragIndex !== index) onChange(reorderNavigationItems(items, dragIndex, index)); setDragIndex(null); }}>
      <GripVertical size={17} />
      <input aria-label="Navigation label" value={item.label} onChange={(event) => updateItem(index, { label: event.target.value })} />
      <select aria-label="Navigation item type" value={item.type} onChange={(event) => { const type = event.target.value; const first = targetOptions(type)[0]?.value ?? ''; updateItem(index, { type, target: first }); }}><option value="home">Home</option><option value="page">Page</option><option value="recipe">Recipe</option><option value="category">Category</option><option value="system">System</option><option value="external">External URL</option><option value="group">Group</option></select>
      {item.type === 'external' ? <input aria-label="External URL" value={item.target} placeholder="https://" onChange={(event) => updateItem(index, { target: event.target.value })} /> : item.type === 'group' ? <span className="navigation-parent-label">Non-clickable</span> : <select aria-label="Navigation target" value={item.target} onChange={(event) => updateItem(index, { target: event.target.value })}>{targetOptions(item.type).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
      <button className="icon-command" type="button" disabled={index === 0} title="Move up" onClick={() => onChange(move(items, index, -1))}><ArrowUp size={14} /></button>
      <button className="icon-command" type="button" disabled={index === items.length - 1} title="Move down" onClick={() => onChange(move(items, index, 1))}><ArrowDown size={14} /></button>
      {allowChildren && depth < 2 ? <button className="icon-command" type="button" title="Add submenu item" onClick={() => updateItem(index, { children: [...item.children, { id: `submenu-${Date.now().toString(36)}`, label: 'New submenu item', type: 'home', target: 'home', children: [] }] })}><Plus size={14} /></button> : <span className="navigation-action-placeholder" aria-hidden="true" />}
      <button className="icon-command" type="button" title="Remove item" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button>
    </div>
    {item.children.length > 0 && <div className="navigation-children"><NavigationList items={item.children} targets={targets} depth={2} allowChildren={false} onChange={(children) => updateItem(index, { children })} /></div>}
  </div>)}</div>;
}

function NavigationPanel({ site, update }: { site: SiteBundle; update: (site: SiteBundle) => void }) {
  const navigation = site.navigation as unknown as Navigation;
  const targets = { categories: site.categories as Category[], pages: site.pages, recipes: site.recipes };
  function setNavigation(next: Navigation) { update({ ...site, navigation: next }); }
  function add(kind: 'primaryItems' | 'menuItems') {
    const id = `menu-${Date.now().toString(36)}`;
    setNavigation({ ...navigation, header: { ...navigation.header, [kind]: [...navigation.header[kind], { id, label: 'New item', type: 'home', target: 'home', children: [] }] } });
  }
  return <div className="site-stacked-panels"><section className="site-detail-panel"><div className="site-section-heading"><div><span>Site chrome</span><h2>Header</h2></div></div><div className="site-form-grid"><Field label="Logo mark"><input maxLength={8} value={navigation.header.logoMark} onChange={(event) => setNavigation({ ...navigation, header: { ...navigation.header, logoMark: event.target.value } })} /></Field><Field label="Site title"><input value={navigation.header.siteTitle} onChange={(event) => setNavigation({ ...navigation, header: { ...navigation.header, siteTitle: event.target.value } })} /></Field></div><div className="site-toggle-row"><label><input type="checkbox" checked={navigation.header.searchVisible} onChange={(event) => setNavigation({ ...navigation, header: { ...navigation.header, searchVisible: event.target.checked } })} />Search action</label><label><input type="checkbox" checked={navigation.header.themeSwitcherVisible} onChange={(event) => setNavigation({ ...navigation, header: { ...navigation.header, themeSwitcherVisible: event.target.checked } })} />Theme switcher</label><span>Logo always links home</span></div></section><section className="site-detail-panel"><div className="site-section-heading"><div><span>Desktop and mobile · maximum depth: 2</span><h2>Primary navigation</h2></div><button className="secondary-command" type="button" onClick={() => add('primaryItems')}><Plus size={16} />Add item</button></div><NavigationList items={navigation.header.primaryItems} targets={targets} onChange={(items) => setNavigation({ ...navigation, header: { ...navigation.header, primaryItems: items } })} /></section><section className="site-detail-panel"><div className="site-section-heading"><div><span>Maximum depth: 2</span><h2>Menu</h2></div><button className="secondary-command" type="button" onClick={() => add('menuItems')}><Plus size={16} />Add item</button></div><NavigationList items={navigation.header.menuItems} targets={targets} onChange={(items) => setNavigation({ ...navigation, header: { ...navigation.header, menuItems: items } })} /></section><section className="site-detail-panel"><div className="site-section-heading"><div><span>Structured content only</span><h2>Footer</h2></div></div><div className="site-form-grid"><Field label="Footer text"><input value={navigation.footer.text} onChange={(event) => setNavigation({ ...navigation, footer: { ...navigation.footer, text: event.target.value } })} /></Field><Field label="Copyright"><input value={navigation.footer.copyright} onChange={(event) => setNavigation({ ...navigation, footer: { ...navigation.footer, copyright: event.target.value } })} /></Field></div><NavigationList items={navigation.footer.links} targets={targets} allowChildren={false} onChange={(items) => setNavigation({ ...navigation, footer: { ...navigation.footer, links: items } })} /></section></div>;
}

function TaxonomiesPanel({ site, update, setError }: { site: SiteBundle; update: (site: SiteBundle) => void; setError: (message: string | null) => void }) {
  const categories = site.categories as Category[];
  const tagGroups = site.tagGroups as Record<string, TagGroup>;
  const [replacement, setReplacement] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState('');
  const [newTags, setNewTags] = useState<Record<string, string>>({});
  function rename(category: Category, changes: Partial<Category>) {
    try {
      const result = renameCategory(categories as never, site.recipes as never, site.navigation, category.id, changes as never);
      update({ ...site, categories: result.categories as never, recipes: result.recipes as never, navigation: result.navigation });
    } catch (error) { setError(error instanceof Error ? error.message : 'The category could not be changed.'); }
  }
  function remove(category: Category) {
    const replacementId = replacement[category.id];
    try {
      const count = site.recipes.filter((recipe) => recipe.category === category.title).length;
      if (!replacementId) throw new Error('Choose a replacement category first.');
      if (!window.confirm(`Move ${count} recipes to the replacement category and delete ${category.title}?`)) return;
      const result = deleteCategoryWithReplacement(categories as never, site.recipes as never, category.id, replacementId);
      update({ ...site, categories: result.categories as never, recipes: result.recipes as never });
    } catch (error) { setError(error instanceof Error ? error.message : 'The category could not be deleted.'); }
  }
  function renameTag(groupId: string, source: string, target: string) {
    if (!target.trim() || target === source) return;
    try {
      const result = mergeTag(site.recipes as never, groupId, source, target.trim());
      const group = tagGroups[groupId];
      if (!group) throw new Error('The tag group no longer exists.');
      const options = [...new Set(group.options.map((item) => item === source ? target.trim() : item))];
      update({ ...site, recipes: result.recipes as never, tagGroups: { ...tagGroups, [groupId]: { ...group, options } } });
    } catch (error) { setError(error instanceof Error ? error.message : 'The tag could not be renamed.'); }
  }
  function deleteTag(groupId: string, tag: string) {
    const group = tagGroups[groupId];
    if (!group) return;
    const count = site.recipes.filter((recipe) => recipe.tags?.[groupId]?.includes(tag)).length;
    if (!window.confirm(`Remove “${tag}” from ${count} recipes and delete it?`)) return;
    update({ ...site, recipes: site.recipes.map((recipe) => ({ ...recipe, tags: { ...recipe.tags, [groupId]: (recipe.tags?.[groupId] ?? []).filter((item) => item !== tag) } })), tagGroups: { ...tagGroups, [groupId]: { ...group, options: group.options.filter((item) => item !== tag) } } });
  }
  return <div className="site-stacked-panels"><section className="site-detail-panel"><div className="site-section-heading"><div><span>Stable IDs and dependency-aware changes</span><h2>Categories</h2></div><div className="site-inline-add"><input placeholder="Category name" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} /><button className="secondary-command" type="button" onClick={() => { const title = newCategory.trim(); const slug = slugify(title); if (!title || !slug || categories.some((item) => item.slug === slug)) { setError('Enter a unique category name.'); return; } update({ ...site, categories: [...categories, { id: slug, slug, title, description: '', status: 'published' }] }); setNewCategory(''); }}><Plus size={16} />Add</button></div></div><div className="category-editor-list">{categories.map((category, index) => { const usage = site.recipes.filter((recipe) => recipe.category === category.title).length; return <div className="category-editor-row" key={category.id}><div className="category-order"><button className="icon-command" type="button" disabled={index === 0} onClick={() => update({ ...site, categories: move(categories, index, -1) })}><ArrowUp size={14} /></button><button className="icon-command" type="button" disabled={index === categories.length - 1} onClick={() => update({ ...site, categories: move(categories, index, 1) })}><ArrowDown size={14} /></button></div><Field label="Display name"><input value={category.title} onChange={(event) => rename(category, { title: event.target.value })} /></Field><Field label="Slug"><input value={category.slug} onChange={(event) => rename(category, { slug: event.target.value })} /></Field><Field label="Description"><input value={category.description} onChange={(event) => rename(category, { description: event.target.value })} /></Field><span className="usage-badge">{usage} recipes</span><select aria-label={`Replacement for ${category.title}`} value={replacement[category.id] ?? ''} onChange={(event) => setReplacement({ ...replacement, [category.id]: event.target.value })}><option value="">Replacement</option>{categories.filter((item) => item.id !== category.id).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select><button className="icon-command" type="button" title="Delete category" onClick={() => remove(category)}><Trash2 size={15} /></button></div>; })}</div></section><section className="site-detail-panel"><div className="site-section-heading"><div><span>Merge, rename, or remove safely</span><h2>Tags</h2></div></div><div className="tag-group-grid">{Object.entries(tagGroups).map(([groupId, group]) => <section className="tag-group" key={groupId}><div><strong>{group.label}</strong><small>{groupId}</small></div><div className="tag-options">{group.options.map((tag) => { const count = site.recipes.filter((recipe) => recipe.tags?.[groupId]?.includes(tag)).length; return <div key={tag}><input aria-label={`${tag} tag name`} value={tag} onChange={(event) => renameTag(groupId, tag, event.target.value)} /><span>{count}</span><button className="icon-command" type="button" title={`Delete ${tag}`} onClick={() => deleteTag(groupId, tag)}><Trash2 size={13} /></button></div>; })}</div><div className="site-inline-add"><input placeholder="New tag" value={newTags[groupId] ?? ''} onChange={(event) => setNewTags({ ...newTags, [groupId]: event.target.value })} /><button className="icon-command" type="button" title="Add tag" onClick={() => { const tag = (newTags[groupId] ?? '').trim(); if (!tag || group.options.includes(tag)) return; update({ ...site, tagGroups: { ...tagGroups, [groupId]: { ...group, options: [...group.options, tag] } } }); setNewTags({ ...newTags, [groupId]: '' }); }}><Plus size={15} /></button></div></section>)}</div></section></div>;
}

function ThemePanel({ site, update }: { site: SiteBundle; update: (site: SiteBundle) => void }) {
  const theme = site.theme as unknown as Theme;
  const [viewport, setViewport] = useState<PreviewViewport>('desktop');
  const [previewKind, setPreviewKind] = useState<PreviewKind>('home');
  const colors = Object.entries(theme.colors) as Array<[keyof Theme['colors'], string]>;
  function setTheme(next: Theme) { update({ ...site, theme: next }); }
  function select(section: keyof Theme, key: string, value: string) { setTheme({ ...theme, [section]: { ...(theme[section] as object), [key]: value } }); }
  return <div className="theme-editor-layout"><section className="site-detail-panel theme-controls"><div className="site-section-heading"><div><span>Validated design tokens</span><h2>Theme</h2></div><button className="secondary-command" type="button" onClick={() => { if (window.confirm('Reset all theme tokens to the known site defaults?')) setTheme(resetTheme() as unknown as Theme); }}><RefreshCw size={16} />Reset</button></div><h3>Colors</h3><div className="theme-color-grid">{colors.map(([key, value]) => <Field key={key} label={key}><div className="theme-color-input"><input type="color" value={value.slice(0, 7)} onChange={(event) => setTheme({ ...theme, colors: { ...theme.colors, [key]: event.target.value } })} /><input value={value} pattern="#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?" onChange={(event) => setTheme({ ...theme, colors: { ...theme.colors, [key]: event.target.value } })} /></div></Field>)}</div><h3>Typography and layout</h3><div className="site-form-grid"><Field label="Heading font"><select value={theme.typography.headingFont} onChange={(event) => select('typography', 'headingFont', event.target.value)}><option value="cinzel">Cinzel</option><option value="source-sans-3">Source Sans 3</option><option value="system-serif">System serif</option><option value="system-sans">System sans</option></select></Field><Field label="Body font"><select value={theme.typography.bodyFont} onChange={(event) => select('typography', 'bodyFont', event.target.value)}><option value="source-sans-3">Source Sans 3</option><option value="cinzel">Cinzel</option><option value="system-serif">System serif</option><option value="system-sans">System sans</option></select></Field><Field label="Font scale"><select value={theme.typography.fontScale} onChange={(event) => select('typography', 'fontScale', event.target.value)}><option value="compact">Compact</option><option value="default">Default</option><option value="large">Large</option></select></Field><Field label="Content width"><select value={theme.layout.contentWidth} onChange={(event) => select('layout', 'contentWidth', event.target.value)}><option value="medium">Medium</option><option value="wide">Wide</option><option value="full">Full</option></select></Field><Field label="Section spacing"><select value={theme.layout.sectionSpacing} onChange={(event) => select('layout', 'sectionSpacing', event.target.value)}><option value="compact">Compact</option><option value="default">Default</option><option value="relaxed">Relaxed</option></select></Field><Field label="Card padding"><select value={theme.layout.cardPadding} onChange={(event) => select('layout', 'cardPadding', event.target.value)}><option value="compact">Compact</option><option value="default">Default</option><option value="comfortable">Comfortable</option></select></Field><Field label="Card radius"><select value={theme.shape.cardRadius} onChange={(event) => select('shape', 'cardRadius', event.target.value)}><option value="none">None</option><option value="sm">Small</option><option value="md">Medium</option></select></Field><Field label="Button radius"><select value={theme.shape.buttonRadius} onChange={(event) => select('shape', 'buttonRadius', event.target.value)}><option value="none">None</option><option value="sm">Small</option><option value="md">Medium</option></select></Field><Field label="Card border"><select value={theme.cards.border} onChange={(event) => select('cards', 'border', event.target.value)}><option value="none">None</option><option value="subtle">Subtle</option><option value="strong">Strong</option></select></Field><Field label="Card shadow"><select value={theme.cards.shadow} onChange={(event) => select('cards', 'shadow', event.target.value)}><option value="none">None</option><option value="soft">Soft</option><option value="strong">Strong</option></select></Field><Field label="Button size"><select value={theme.buttons.size} onChange={(event) => select('buttons', 'size', event.target.value)}><option value="compact">Compact</option><option value="default">Default</option><option value="large">Large</option></select></Field></div></section><section className="theme-preview-panel"><div className="theme-preview-toolbar"><div className="editor-segments"><button className={previewKind === 'home' ? 'active' : ''} type="button" onClick={() => setPreviewKind('home')}>Homepage</button><button className={previewKind === 'recipe' ? 'active' : ''} type="button" onClick={() => setPreviewKind('recipe')}>Recipe</button></div><div className="editor-segments"><button className={viewport === 'desktop' ? 'active' : ''} type="button" title="Desktop" onClick={() => setViewport('desktop')}><Monitor size={15} /></button><button className={viewport === 'tablet' ? 'active' : ''} type="button" title="Tablet" onClick={() => setViewport('tablet')}><Tablet size={15} /></button><button className={viewport === 'mobile' ? 'active' : ''} type="button" title="Mobile" onClick={() => setViewport('mobile')}><Smartphone size={15} /></button></div></div><div className={`theme-preview-frame theme-preview-${viewport}`}><style>{renderSiteThemeCss(theme)}</style><div className="theme-preview-surface"><header><b>AG</b><strong>Arta Gătitului</strong><span>Categorii · Caută</span></header>{previewKind === 'home' ? <main><p>Rețete pentru acasă</p><h1>Gătește cu poftă</h1><button>Descoperă rețetele</button><div className="theme-preview-cards"><article><span>Desert</span><h2>Tartă cu mere</h2><p>O rețetă simplă și aromată.</p></article><article><span>Fel principal</span><h2>Paste cremoase</h2><p>Pregătite în mai puțin de o oră.</p></article></div></main> : <main><p>Desert</p><h1>Tartă cu mere</h1><div className="theme-preview-cards"><article><h2>Ingrediente</h2><p>Mere · scorțișoară · făină</p></article><article><h2>Preparare</h2><p>Amestecă, coace și lasă să se răcească.</p></article></div><button>Salvează rețeta</button></main>}</div></div></section></div>;
}

function SettingsPanel({ site, update }: { site: SiteBundle; update: (site: SiteBundle) => void }) {
  const settings = site.settings as unknown as SiteSettings;
  const templates = site.templates.templates as unknown as Template[];
  function setSettings(changes: Partial<SiteSettings>) { update({ ...site, settings: { ...settings, ...changes } }); }
  return <section className="site-detail-panel settings-panel"><div className="site-section-heading"><div><span>Global metadata and defaults</span><h2>Site settings</h2></div></div><div className="site-form-grid"><Field label="Site title"><input value={settings.siteTitle} onChange={(event) => setSettings({ siteTitle: event.target.value })} /></Field><Field label="Default social image"><input value={settings.defaultSocialImage} onChange={(event) => setSettings({ defaultSocialImage: event.target.value })} /></Field><Field label="Language"><input value="Romanian (ro)" disabled /></Field><Field label="Locale"><input value="ro_RO" disabled /></Field></div><Field label="Site description"><textarea rows={4} maxLength={320} value={settings.siteDescription} onChange={(event) => setSettings({ siteDescription: event.target.value })} /></Field><h3>Default templates</h3><div className="site-form-grid">{Object.entries(settings.defaultTemplates).map(([kind, templateId]) => <Field label={kind} key={kind}><select value={templateId} onChange={(event) => setSettings({ defaultTemplates: { ...settings.defaultTemplates, [kind]: event.target.value } })}>{templates.filter((template) => template.contentType === (kind === 'landing' ? 'page' : kind)).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></Field>)}</div></section>;
}

function HighRiskSiteReview({ publishing, draft }: { publishing: GitHubSitePublishingController; draft: SiteDraft }) {
  const review = publishing.highRiskReview;
  if (!review) return null;
  return <div className="draft-dialog-backdrop"><div className="draft-dialog site-publish-review" role="alertdialog" aria-modal="true">
    <AlertTriangle size={23} /><h2>Confirm global site change</h2>
    <ImpactNote><span><strong>This can affect {draft.data.site.recipes.length} recipes and {draft.data.site.pages.length} pages.</strong> Review every file before publishing.</span></ImpactNote>
    <dl className="publish-summary"><div><dt>Repository</dt><dd>{review.repository}</dd></div><div><dt>Branch</dt><dd>{review.branch}</dd></div><div><dt>Base commit</dt><dd><code>{review.baseCommitSha.slice(0, 12)}</code></dd></div></dl>
    <ul className="site-review-files">{review.fileChanges.map((file) => <li key={file.path}><code>{file.path}</code><span>{file.operation}</span></li>)}</ul>
    <label className="typed-confirmation"><span>Type PUBLISH to confirm the global impact</span><input value={publishing.highRiskConfirmation} onChange={(event) => publishing.setHighRiskConfirmation(event.target.value)} /></label>
    <div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={publishing.closeReview}>Cancel</button><button className="danger-command" type="button" disabled={publishing.highRiskConfirmation !== 'PUBLISH' || publishing.busy} onClick={() => void publishing.confirm()}><UploadCloud size={16} />Publish global change</button></div>
  </div></div>;
}

export function SiteEditor({ email, onNavigate, onSignOut, workspace, draft }: { uid: string; email: string | null; onNavigate: (route: AppRoute) => void; onSignOut: () => void; workspace: ReturnType<typeof useDraftWorkspace>; draft: SiteDraft }) {
  const [tab, setTab] = useState<Tab>('templates');
  const [localError, setLocalError] = useState<string | null>(null);
  const publishing = useGitHubSitePublishing({ draft, flush: workspace.flush, updateDraft: workspace.updateDraft, recordPublicationAudit: workspace.recordPublicationAudit });
  const validation = useMemo(() => validateSiteBundle(draft.data.site, { recipeSlugs: draft.data.site.recipes.map((item) => item.slug), pageSlugs: draft.data.site.pages.map((item) => item.slug), categorySlugs: draft.data.site.categories.map((item) => String(item.slug)) }), [draft.data.site]);
  const update = (site: SiteBundle) => workspace.updateDraft((current: AnyDraft) => current.contentType === 'site' ? { ...current, status: 'draft', data: { ...current.data, site: clone(site) } } : current);
  const area = tab === 'globals' ? 'global-blocks' : tab === 'taxonomies' ? 'taxonomies' : tab;
  function openContent() {
    const content = workspace.drafts.find((record) => isRecipeDraft(record.draft));
    if (content) void workspace.selectDraft(content.draft.id); else void workspace.newDraft();
  }
  return <main className="site-editor-shell">
    <div className="site-safety-controls"><UndoRedoControls workspace={workspace} /><PublicationHistory workspace={workspace} /><ExportDraftButton workspace={workspace} /></div>
    <header className="site-editor-topbar"><div className="site-editor-title"><button className="icon-command" type="button" title="Back to content" onClick={openContent}><ArrowLeft size={17} /></button><div><strong>Site management</strong><span>{workspace.saveLabel}</span></div></div><div className="site-editor-actions"><button className="secondary-command" type="button" disabled={publishing.busy} onClick={() => { if (!draft.data.sources.length || window.confirm('Reload the GitHub baseline and replace this site draft?')) void publishing.reloadBaseline(); }}><CloudDownload size={16} />Reload</button><button className={`github-connection-button${publishing.connection?.repositoryVerified ? ' connected' : ''}`} type="button" onClick={publishing.openConnection}><GitFork size={16} /><span>{publishing.connection?.repositoryVerified ? 'GitHub ready' : 'Connect GitHub'}</span></button><button className="publish-button" type="button" disabled={publishing.busy || !publishing.changedPaths.length || !validation.valid} onClick={() => void publishing.prepare(area)}>{publishing.busy ? <LoaderCircle className="draft-spinner" size={16} /> : <UploadCloud size={16} />}Review {publishing.changedPaths.length || ''}</button><button className="icon-command" type="button" title="Public view" onClick={() => onNavigate('view')}><ExternalLink size={16} /></button><details className="account-menu"><summary aria-label="Editor account" title="Editor account"><Settings2 size={17} /></summary><div><strong>{email ?? 'Approved editor'}</strong><button type="button" onClick={onSignOut}><LogOut size={15} />Sign out</button></div></details></div></header>
    <nav className="site-editor-tabs" aria-label="Site management sections">{TABS.map((item) => <button className={tab === item.id ? 'active' : ''} type="button" key={item.id} onClick={() => setTab(item.id)}>{item.id === 'theme' ? <Palette size={15} /> : item.id === 'taxonomies' ? <Tags size={15} /> : item.id === 'templates' ? <Layers3 size={15} /> : <Settings2 size={15} />}{item.label}</button>)}</nav>
    {(localError || publishing.error || !validation.valid) && <div className="site-editor-error"><AlertTriangle size={17} /><span>{localError ?? publishing.error ?? validation.errors.join(' ')}</span><button className="icon-command" type="button" title="Dismiss" onClick={() => { setLocalError(null); publishing.setError(null); }}><X size={15} /></button></div>}
    {!draft.data.sources.length && <div className="site-baseline-warning"><CloudDownload size={18} /><span><strong>GitHub baseline required before publishing.</strong> Connect GitHub to load current blob identities; local edits remain in Firestore recovery.</span></div>}
    <div className="site-editor-content">{tab === 'templates' && <TemplatesPanel site={draft.data.site} update={update} setError={setLocalError} />}{tab === 'globals' && <GlobalsPanel site={draft.data.site} update={update} setError={setLocalError} />}{tab === 'navigation' && <NavigationPanel site={draft.data.site} update={update} />}{tab === 'taxonomies' && <TaxonomiesPanel site={draft.data.site} update={update} setError={setLocalError} />}{tab === 'theme' && <ThemePanel site={draft.data.site} update={update} />}{tab === 'settings' && <SettingsPanel site={draft.data.site} update={update} />}</div>
    <HighRiskSiteReview publishing={publishing} draft={draft} />
    <GitHubConnectionDialog publishing={publishing} />
    {publishing.review && <div className="draft-dialog-backdrop"><div className="draft-dialog site-publish-review" role="alertdialog" aria-modal="true"><UploadCloud size={23} /><h2>Publish site changes</h2><ImpactNote><span><strong>{publishing.review.fileChanges.length} files will change in one commit.</strong> {tab === 'theme' ? 'This affects the entire website.' : 'Linked content and routes may change after the site rebuild.'}</span></ImpactNote><ul className="site-review-files">{publishing.review.fileChanges.map((file) => <li key={file.path}><code>{file.path}</code><span>{file.operation}</span></li>)}</ul><p>{draft.data.site.recipes.length} recipes and {draft.data.site.pages.length} pages were checked against this site draft.</p><div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={publishing.closeReview}>Cancel</button><button className="primary-command" type="button" onClick={() => void publishing.confirm()}><UploadCloud size={16} />Publish one commit</button></div></div></div>}
    {publishing.result && <div className="draft-dialog-backdrop"><div className="draft-dialog" role="dialog" aria-modal="true"><Check size={24} /><h2>Site configuration published</h2><p>Commit <code>{publishing.result.commitSha.slice(0, 12)}</code> is ready for the website build.</p><div className="draft-dialog-actions"><button className="secondary-command" type="button" onClick={() => void publishing.openActionsPage()}><ExternalLink size={16} />GitHub Actions</button><button className="primary-command" type="button" onClick={publishing.closeResult}>Done</button></div></div></div>}
  </main>;
}
