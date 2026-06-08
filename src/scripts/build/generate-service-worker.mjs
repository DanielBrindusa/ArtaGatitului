import path from 'node:path';
import { ROOT } from './config.mjs';
import { writeTextFile } from './html-utils.mjs';

export async function generateServiceWorker(content, renderers) {
  await writeTextFile(
    path.join(ROOT, 'service-worker.js'),
    renderers.serviceWorkerFile(content),
  );
}
