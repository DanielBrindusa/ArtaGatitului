import {
  AlignLeft,
  BarChart3,
  ChefHat,
  CircleEllipsis,
  Clock3,
  Heading2,
  Image,
  Link,
  ListChecks,
  Minus,
  Rows3,
  Sparkles,
  Star,
  Text,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { BLOCK_TYPES, type BlockType } from '../../../src/shared/index.mjs';
import type { RecipeDraft } from '../drafts/draftModel.mjs';
import { SINGLETON_RECIPE_BLOCK_TYPES } from './editorModel.mjs';

const recipeBlocks: Array<{ type: BlockType; label: string; icon: LucideIcon }> = [
  { type: BLOCK_TYPES.RECIPE_HERO, label: 'Recipe hero', icon: ChefHat },
  { type: BLOCK_TYPES.RECIPE_METADATA, label: 'Metadata', icon: Clock3 },
  { type: BLOCK_TYPES.INGREDIENTS, label: 'Ingredients', icon: ListChecks },
  { type: BLOCK_TYPES.BEFORE_STARTING, label: 'Before starting', icon: Sparkles },
  { type: BLOCK_TYPES.EQUIPMENT, label: 'Equipment', icon: Utensils },
  { type: BLOCK_TYPES.INSTRUCTIONS, label: 'Instructions', icon: Rows3 },
  { type: BLOCK_TYPES.RATING, label: 'Rating', icon: Star },
  { type: BLOCK_TYPES.RELATED_RECIPES, label: 'Related recipes', icon: BarChart3 },
];

const basicBlocks: Array<{ type: BlockType; label: string; icon: LucideIcon }> = [
  { type: BLOCK_TYPES.HEADING, label: 'Heading', icon: Heading2 },
  { type: BLOCK_TYPES.TEXT, label: 'Text', icon: Text },
  { type: BLOCK_TYPES.IMAGE, label: 'Image', icon: Image },
  { type: BLOCK_TYPES.DIVIDER, label: 'Divider', icon: Minus },
  { type: BLOCK_TYPES.SPACER, label: 'Spacer', icon: CircleEllipsis },
  { type: BLOCK_TYPES.BUTTON, label: 'Button', icon: Link },
];

function BlockGroup({
  label,
  blocks,
  draft,
  onAdd,
}: {
  label: string;
  blocks: Array<{ type: BlockType; label: string; icon: LucideIcon }>;
  draft: RecipeDraft;
  onAdd: (type: BlockType) => void;
}) {
  return (
    <section className="library-group" aria-labelledby={`library-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <h3 id={`library-${label.replace(/\s+/g, '-').toLowerCase()}`}>{label}</h3>
      <div className="block-library-grid">
        {blocks.map(({ type, label: blockLabel, icon: Icon }) => {
          const alreadyPresent = SINGLETON_RECIPE_BLOCK_TYPES.includes(type)
            && draft.layout.blocks.some((block) => block.type === type);
          return (
            <button key={type} type="button" disabled={alreadyPresent} title={alreadyPresent ? `${blockLabel} is already in the layout` : `Add ${blockLabel}`} onClick={() => onAdd(type)}>
              <Icon aria-hidden="true" size={18} />
              <span>{blockLabel}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
export function BlockLibrary({ draft, onAdd }: { draft: RecipeDraft; onAdd: (type: BlockType) => void }) {
  return (
    <div className="block-library-content">
      <div className="panel-heading">
        <div><span className="workspace-kicker">Insert</span><h2>Block library</h2></div>
        <AlignLeft aria-hidden="true" size={18} />
      </div>
      <BlockGroup label="Recipe blocks" blocks={recipeBlocks} draft={draft} onAdd={onAdd} />
      <BlockGroup label="Basic content" blocks={basicBlocks} draft={draft} onAdd={onAdd} />
    </div>
  );
}
