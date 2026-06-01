import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = new URL('https://artagatitului.godaddysites.com/');
const OUTPUT_DIR = path.resolve('site-audit');
const SEED_PATHS = [
  '/',
  '/portofoliu',
  '/fel-principal',
  '/fel-secundar',
  '/desert',
  '/rontaieli',
  '/salate',
  '/bauturi',
  '/mic-dejun',
  '/randomizer',
];

const SKIP_EXTENSIONS = /\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|mp4|pdf|png|svg|webmanifest|webp|woff2?)$/i;

function decodeHtml(value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    }

    return named[entity.toLowerCase()] ?? _;
  });
}

function normalizeUrl(input, baseUrl = BASE) {
  const cleanInput = decodeHtml(input).trim();

  if (
    !cleanInput ||
    cleanInput.startsWith('#') ||
    cleanInput.startsWith('mailto:') ||
    cleanInput.startsWith('tel:') ||
    cleanInput.startsWith('javascript:')
  ) {
    return null;
  }

  const url = new URL(cleanInput, baseUrl);
  if (url.origin !== BASE.origin) return null;
  if (SKIP_EXTENSIONS.test(url.pathname)) return null;

  url.hash = '';
  url.search = '';

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}

function extractLinks(html, pageUrl) {
  const links = new Set();
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match;

  while ((match = hrefPattern.exec(html))) {
    const normalized = normalizeUrl(match[1] ?? match[2] ?? match[3], pageUrl);
    if (normalized) links.add(normalized);
  }

  return [...links].sort();
}

function extractTitle(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  return decodeHtml(title.replace(/\s+/g, ' ').trim());
}

function bodyHtml(html) {
  return html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
}

function textLinesFromHtml(html) {
  let body = bodyHtml(html);

  body = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<span\b(?=[^>]*\bdata-ux=["']scaler["'])[^>]*>[\s\S]*?<\/span>/gi, ' ')
    .replace(/<([a-z0-9]+)\b(?=[^>]*\baria-hidden=["']true["'])[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  body = body
    .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:a|article|aside|blockquote|button|div|footer|h[1-6]|header|li|main|nav|p|section|span|td|th|tr|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const text = decodeHtml(body)
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const seen = new Set();
  const lines = [];

  for (const line of text.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }

  return lines;
}

async function fetchPage(url) {
  let response;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'Mozilla/5.0 (compatible; ArtaGatituluiTextInventory/1.0)',
        },
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  if (!response) throw lastError;

  const html = await response.text();
  return {
    contentType: response.headers.get('content-type') ?? '',
    html,
    ok: response.ok,
    status: response.status,
  };
}

function pageSlug(url) {
  const { pathname } = new URL(url);
  return pathname === '/' ? 'home' : pathname.replace(/^\/+/, '').replace(/[^a-z0-9-]+/gi, '-');
}

function toMarkdown(pages) {
  const lines = [
    '# Arta Gatitului - GoDaddy Site Text Inventory',
    '',
    `Source: ${BASE.origin}/`,
    `Extracted: ${new Date().toISOString()}`,
    '',
    `Pages found: ${pages.length}`,
    '',
    '## Pages',
    '',
    ...pages.map((page, index) => `${index + 1}. [${page.title || page.url}](${page.url}) - ${page.lines.length} unique text lines`),
    '',
  ];

  for (const page of pages) {
    lines.push(`## ${page.title || page.url}`);
    lines.push('');
    lines.push(`URL: ${page.url}`);
    lines.push(`HTTP: ${page.status}`);
    lines.push('');
    lines.push('### Text');
    lines.push('');

    if (page.lines.length === 0) {
      lines.push('_No visible text extracted._');
    } else {
      for (const textLine of page.lines) {
        lines.push(`- ${textLine}`);
      }
    }

    lines.push('');
    lines.push('### Internal Links');
    lines.push('');

    if (page.links.length === 0) {
      lines.push('_No internal links found._');
    } else {
      for (const link of page.links) {
        lines.push(`- ${link}`);
      }
    }

    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

const CHROME_LINES = new Set([
  'Arta Gatitului',
  'Home',
  'Portofoliu',
  'Fel principal',
  'Fel secundar',
  'Desert',
  'Rontaieli',
  'Salate',
  'Bauturi',
  'Mic dejun',
  'Randomizer',
  'Generate Random',
  'Powered by',
  'This website uses cookies.',
  'We use cookies to analyze website traffic and optimize your website experience. By accepting our use of cookies, your data will be aggregated with all other user data.',
  'Decline',
  'Accept',
  'Back',
]);

const SITE_PAGE_PATHS = new Set([
  '/',
  '/portofoliu',
  '/fel-principal',
  '/fel-secundar',
  '/desert',
  '/rontaieli',
  '/salate',
  '/bauturi',
  '/mic-dejun',
  '/randomizer',
]);

function pageTitleBase(page) {
  return (page.title || '')
    .replace(/\s*\|\s*Arta Gatitului\s*$/i, '')
    .trim();
}

function contentLines(page) {
  const title = pageTitleBase(page);

  return page.lines.filter((line) => {
    if (/^Copyright\s+.+Arta Gatitului - All Rights Reserved\.$/i.test(line)) return false;
    if (CHROME_LINES.has(line) && line !== title) return false;
    return true;
  });
}

function toContentMarkdown(pages, { recipesOnly = false } = {}) {
  const selectedPages = recipesOnly
    ? pages.filter((page) => !SITE_PAGE_PATHS.has(new URL(page.url).pathname))
    : pages;

  const lines = [
    recipesOnly
      ? '# Arta Gatitului - GoDaddy Recipe Text Only'
      : '# Arta Gatitului - GoDaddy Clean Page Text',
    '',
    `Source: ${BASE.origin}/`,
    `Extracted: ${new Date().toISOString()}`,
    '',
    `Pages included: ${selectedPages.length}`,
    '',
  ];

  for (const page of selectedPages) {
    lines.push(`## ${pageTitleBase(page) || page.url}`);
    lines.push('');
    lines.push(`URL: ${page.url}`);
    lines.push('');

    const linesForPage = contentLines(page);
    if (linesForPage.length === 0) {
      lines.push('_No page-specific text extracted after removing repeated site chrome._');
    } else {
      for (const textLine of linesForPage) {
        lines.push(`- ${textLine}`);
      }
    }

    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let pages;

  if (process.argv.includes('--from-json')) {
    const jsonPath = path.join(OUTPUT_DIR, 'godaddy-page-text-inventory.json');
    const saved = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    pages = saved.pages;
  } else {
    const queue = SEED_PATHS.map((seed) => normalizeUrl(seed)).filter(Boolean);
    const queued = new Set(queue);
    const crawled = new Set();
    pages = [];

    while (queue.length > 0) {
      const url = queue.shift();
      if (!url || crawled.has(url)) continue;
      crawled.add(url);

      const fetched = await fetchPage(url);
      if (!fetched.contentType.includes('text/html')) continue;

      const links = extractLinks(fetched.html, new URL(url));
      for (const link of links) {
        if (!queued.has(link) && !crawled.has(link)) {
          queued.add(link);
          queue.push(link);
        }
      }

      pages.push({
        url,
        status: fetched.status,
        ok: fetched.ok,
        title: extractTitle(fetched.html),
        links,
        lines: textLinesFromHtml(fetched.html),
      });
    }

    pages.sort((a, b) => new URL(a.url).pathname.localeCompare(new URL(b.url).pathname));
  }

  const markdown = toMarkdown(pages);
  const cleanMarkdown = toContentMarkdown(pages);
  const recipeMarkdown = toContentMarkdown(pages, { recipesOnly: true });
  const json = JSON.stringify({ source: BASE.origin, extractedAt: new Date().toISOString(), pages }, null, 2);

  await fs.writeFile(path.join(OUTPUT_DIR, 'godaddy-page-text-inventory.md'), markdown, 'utf8');
  await fs.writeFile(path.join(OUTPUT_DIR, 'godaddy-clean-page-text.md'), cleanMarkdown, 'utf8');
  await fs.writeFile(path.join(OUTPUT_DIR, 'godaddy-recipes-only.md'), recipeMarkdown, 'utf8');
  if (!process.argv.includes('--from-json')) {
    await fs.writeFile(path.join(OUTPUT_DIR, 'godaddy-page-text-inventory.json'), `${json}\n`, 'utf8');
  }

  console.log(`Pages found: ${pages.length}`);
  for (const page of pages) {
    console.log(`${page.url} (${page.lines.length} text lines)`);
  }
  console.log(`\nWrote ${path.join(OUTPUT_DIR, 'godaddy-page-text-inventory.md')}`);
  console.log(`Wrote ${path.join(OUTPUT_DIR, 'godaddy-clean-page-text.md')}`);
  console.log(`Wrote ${path.join(OUTPUT_DIR, 'godaddy-recipes-only.md')}`);
  console.log(`Wrote ${path.join(OUTPUT_DIR, 'godaddy-page-text-inventory.json')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
