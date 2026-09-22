import { loadContent } from './build/content-loader.mjs';
import { OUTPUT_ROOT } from './build/config.mjs';
import { validateGeneratedOutput } from './validation/generated-output.mjs';

const result = await validateGeneratedOutput({ outputRoot: OUTPUT_ROOT, content: await loadContent() });
if (!result.valid) {
  console.error('Generated output validation failed');
  result.issues.forEach((issue) => console.error(`- ${issue}`));
  process.exitCode = 1;
} else {
  console.log(`Generated output validation passed for ${result.routePlan.routes.length} routes.`);
}
