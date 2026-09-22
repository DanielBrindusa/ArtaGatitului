import fs from 'node:fs/promises';
import path from 'node:path';
import { OUTPUT_ROOT, ROOT } from './build/config.mjs';
import { loadContent } from './build/content-loader.mjs';
import { validateGeneratedOutput, REQUIRED_PUBLIC_FILES } from './validation/generated-output.mjs';
import { buildRoutePlan, validateRoutePlan } from './build/routes.mjs';

export const PAGES_OUTPUT_DIR = path.join(ROOT, 'dist', 'site');

function assertSafeOutputDirectory(outputDir) {
  const resolvedRoot = path.resolve(ROOT);
  const resolvedOutput = path.resolve(outputDir);
  const expected = path.join(resolvedRoot, 'dist', 'site');
  if (resolvedOutput !== expected || !resolvedOutput.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to replace unexpected Pages output directory: ${resolvedOutput}`);
  }
}

async function copyFile(relativePath, outputDir) {
  const source = path.join(OUTPUT_ROOT, ...relativePath.split('/'));
  const destination = path.join(outputDir, ...relativePath.split('/'));
  const sourceStat = await fs.lstat(source);
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
    throw new Error(`Pages artifact input must be a regular file: ${relativePath}`);
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function listFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Pages assets must not contain symbolic links: assets/${relativePath}`);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath, relativePath));
    else if (entry.isFile()) files.push(`assets/${relativePath}`);
  }
  return files;
}

async function main() {
  assertSafeOutputDirectory(PAGES_OUTPUT_DIR);
  const content = await loadContent();
  const routePlan = validateRoutePlan(buildRoutePlan(content));
  const files = new Set([
    ...REQUIRED_PUBLIC_FILES,
    ...routePlan.routes.map((route) => route.filePath),
    ...await listFiles(path.join(OUTPUT_ROOT, 'assets')),
  ]);

  await fs.rm(PAGES_OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(PAGES_OUTPUT_DIR, { recursive: true });
  for (const relativePath of [...files].sort()) await copyFile(relativePath, PAGES_OUTPUT_DIR);
  await fs.writeFile(path.join(PAGES_OUTPUT_DIR, '.nojekyll'), '', 'utf8');

  const validation = await validateGeneratedOutput({ outputRoot: PAGES_OUTPUT_DIR, content });
  if (!validation.valid) {
    throw new Error(`Pages artifact validation failed:\n- ${validation.issues.join('\n- ')}`);
  }
  console.log(`Packaged ${files.size + 1} public files in ${path.relative(ROOT, PAGES_OUTPUT_DIR)}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
