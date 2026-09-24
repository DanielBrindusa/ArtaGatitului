import {
  AlignLeft,
  Columns3,
  Grid3X3,
  Heading2,
  Image,
  LayoutPanelTop,
  Link,
  ListChecks,
  Minus,
  Rows3,
  Search,
  Sparkles,
  Text,
  type LucideIcon,
} from 'lucide-react';
import { BLOCK_TYPES, type BlockType } from '../../../src/shared/index.mjs';

const groups: Array<{ label: string; blocks: Array<{ type: BlockType; label: string; icon: LucideIcon }> }> = [
  {
    label: 'Layout',
    blocks: [
      { type: BLOCK_TYPES.SECTION, label: 'Section', icon: Rows3 },
      { type: BLOCK_TYPES.CONTAINER, label: 'Container', icon: LayoutPanelTop },
      { type: BLOCK_TYPES.COLUMNS, label: 'Columns', icon: Columns3 },
      { type: BLOCK_TYPES.GRID, label: 'Grid', icon: Grid3X3 },
    ],
  },
  {
    label: 'Content',
    blocks: [
      { type: BLOCK_TYPES.HEADING, label: 'Heading', icon: Heading2 },
      { type: BLOCK_TYPES.RICH_TEXT, label: 'Rich text', icon: Text },
      { type: BLOCK_TYPES.IMAGE, label: 'Image', icon: Image },
      { type: BLOCK_TYPES.BUTTON, label: 'Button', icon: Link },
      { type: BLOCK_TYPES.DIVIDER, label: 'Divider', icon: Minus },
      { type: BLOCK_TYPES.SPACER, label: 'Spacer', icon: AlignLeft },
      { type: BLOCK_TYPES.HERO, label: 'Hero', icon: Sparkles },
    ],
  },
  {
    label: 'Discovery',
    blocks: [
      { type: BLOCK_TYPES.SEARCH, label: 'Search', icon: Search },
      { type: BLOCK_TYPES.RECIPE_GRID, label: 'Recipe grid', icon: Grid3X3 },
      { type: BLOCK_TYPES.FEATURED_RECIPES, label: 'Featured', icon: ListChecks },
      { type: BLOCK_TYPES.LATEST_RECIPES, label: 'Latest', icon: Rows3 },
      { type: BLOCK_TYPES.CATEGORY_GRID, label: 'Categories', icon: Grid3X3 },
      { type: BLOCK_TYPES.RANDOM_RECIPE, label: 'Random recipe', icon: Sparkles },
    ],
  },
];

export function PageBlockLibrary({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <div className="block-library-content">
      <div className="panel-heading"><div><span className="workspace-kicker">Insert</span><h2>Block library</h2></div><AlignLeft aria-hidden="true" size={18} /></div>
      <p className="panel-note">Blocks are added to the selected compatible container.</p>
      {groups.map((group) => (
        <section className="library-group" key={group.label}>
          <h3>{group.label}</h3>
          <div className="block-library-grid">
            {group.blocks.map(({ type, label, icon: Icon }) => (
              <button key={type} type="button" title={`Add ${label}`} onClick={() => onAdd(type)}>
                <Icon aria-hidden="true" size={18} /><span>{label}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
