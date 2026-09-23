import {
  BLOCK_TYPES,
  normalizeRecipe,
  type ContentBlock,
} from '../../../src/shared/index.mjs';

export const demoRecipe = normalizeRecipe({
  id: 'preview-omleta-gradina',
  slug: 'preview-omleta-gradina',
  title: 'Omletă de grădină',
  description: 'Un exemplu local folosit numai pentru verificarea rendererului comun.',
  category: 'Mic dejun',
  ingredients: [
    '3 ouă',
    'O mână de baby spanac',
    '6 roșii cherry',
    '30 g brânză maturată',
    'Sare și piper',
  ],
  steps: [
    'Bate ouăle cu sare și piper.',
    'Înmoaie spanacul într-o tigaie încinsă.',
    'Adaugă ouăle, roșiile și brânza, apoi gătește până se leagă.',
  ],
  beforeStart: [
    'Spală și usucă legumele.',
    'Pregătește toate ingredientele lângă plită.',
  ],
  tags: {
    complexity: ['Ușor'],
    time: ['Sub 15 minute'],
    context: ['Mic dejun'],
    equipment: ['La tigaie'],
  },
  equipment: ['Tigaie antiaderentă', 'Tel'],
  prepTimeMinutes: 5,
  cookTimeMinutes: 8,
  totalTimeMinutes: 13,
  servings: 2,
  status: 'published',
  closing: 'Poftă bună!',
  ratingSummary: null,
}, 'cms-preview');

export const demoRecipeBlocks: ContentBlock[] = [
  {
    id: 'preview-hero',
    type: BLOCK_TYPES.RECIPE_HERO,
    data: {},
    layout: { width: 'wide' },
  },
  {
    id: 'preview-metadata',
    type: BLOCK_TYPES.RECIPE_METADATA,
    data: {},
    layout: { width: 'wide' },
  },
  {
    id: 'preview-before-starting',
    type: BLOCK_TYPES.BEFORE_STARTING,
    data: {},
    layout: { width: 'wide' },
  },
  {
    id: 'preview-recipe-body',
    type: BLOCK_TYPES.SECTION,
    data: {
      blocks: [
        {
          id: 'preview-ingredients',
          type: BLOCK_TYPES.INGREDIENTS,
          data: {},
        },
        {
          id: 'preview-instructions',
          type: BLOCK_TYPES.INSTRUCTIONS,
          data: {},
        },
      ],
    },
    layout: { width: 'wide', columns: 2, gap: 'lg' },
    responsive: {
      mobile: { columns: 1, gap: 'md' },
    },
  },
  {
    id: 'preview-rating',
    type: BLOCK_TYPES.RATING,
    data: {},
    layout: { width: 'wide' },
  },
];
