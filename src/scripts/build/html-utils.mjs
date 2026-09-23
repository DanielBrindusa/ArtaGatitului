import fs from 'node:fs/promises';
import path from 'node:path';
export { escapeHtml, slugify } from '../../shared/utils/html.mjs';

export async function writeTextFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

export async function writeBinaryFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}
