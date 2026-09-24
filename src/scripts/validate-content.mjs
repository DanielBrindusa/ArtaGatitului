import { validateContentRepository } from './validation/content.mjs';

const result = await validateContentRepository();

console.log('Content validation summary');
console.log(`- Categories: ${result.categoryCount}`);
console.log(`- Recipe files: ${result.recipeFileCount}`);
console.log(`- Page files: ${result.pageFileCount}`);
console.log(`- Parsed recipes: ${result.parsedRecipeCount}`);
console.log(`- Duplicate slugs: ${result.duplicateSlugCount}`);
console.log(`- Recipes with optional null fields: ${result.recipesWithNulls.length}`);

if (result.warnings.length) {
  console.log('\nWarnings');
  result.warnings.forEach((warning) => console.log(`- ${warning}`));
}

if (result.recipesWithNulls.length) {
  console.log('\nOptional null fields');
  result.recipesWithNulls.forEach((entry) => console.log(`- ${entry.slug}: ${entry.fields.join(', ')}`));
}

if (result.issues.length) {
  console.log('\nValidation failed');
  result.issues.forEach((issue) => console.log(`- ${issue}`));
  process.exitCode = 1;
} else {
  console.log('\nValidation passed');
}
