import categories from '../../../src/content/categories.json';
import tagGroups from '../../../src/data/tag-groups.json';

export const knownCategories = categories
  .filter((category) => category.status === 'published')
  .map((category) => category.title);

export const knownTagGroups = Object.fromEntries(
  Object.entries(tagGroups).map(([group, config]) => [group, config.options]),
) as Record<string, string[]>;

export const knownTags = Array.from(new Set(Object.values(knownTagGroups).flat()))
  .sort((left, right) => left.localeCompare(right, 'ro'));
