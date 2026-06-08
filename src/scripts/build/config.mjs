import path from 'node:path';

export const ROOT = process.cwd();
export const BUILD_VERSION = process.env.ARTA_BUILD_VERSION || Date.now().toString(36);
export const SITE_NAME = 'Arta Gătitului';
export const HERO_IMAGE = 'https://img1.wsimg.com/isteam/stock/19687/:/rs=w:1800,m';
export const SOURCE_ICON_PATH = path.join(ROOT, 'icon.png');
export const DEFAULT_SITE_URL = 'https://YOUR-GITHUB-USERNAME.github.io/ArtaGatitului/';

function normalizeSiteUrl(value) {
  const clean = String(value || DEFAULT_SITE_URL).trim();
  return clean.endsWith('/') ? clean : `${clean}/`;
}

export const SITE_CONFIG = {
  siteName: SITE_NAME,
  defaultLanguage: 'ro',
  defaultLocale: 'ro_RO',
  siteUrl: normalizeSiteUrl(process.env.ARTA_SITE_URL || DEFAULT_SITE_URL),
  defaultDescription: 'Rețete românești și idei de gătit pentru acasă, organizate pe categorii, ingrediente și poftă.',
  defaultImage: HERO_IMAGE,
  authorName: 'Arta Gătitului',
  publisherName: 'Arta Gătitului',
  routes: {
    home: '',
    recipes: 'retete/',
    categories: 'categorie/',
    categoryAliases: '',
    search: 'cauta.html',
    ingredientMatcher: 'ce-pot-gati.html',
    categoryIndex: 'categorii.html',
    recipeBuilder: 'adauga-reteta.html',
    randomizer: 'randomizer/',
    portfolio: 'portofoliu/',
    soon: 'soon-to-come/',
    offline: 'offline.html',
  },
};

export const SITE_URL = SITE_CONFIG.siteUrl.replace(/\/+$/, '');

export const PATHS = {
  contentRoot: path.join(ROOT, 'src', 'content'),
  recipesDir: path.join(ROOT, 'src', 'content', 'recipes'),
  categoriesFile: path.join(ROOT, 'src', 'content', 'categories.json'),
  aliasesFile: path.join(ROOT, 'src', 'content', 'aliases.json'),
  tagGroupsFile: path.join(ROOT, 'src', 'data', 'tag-groups.json'),
  ingredientAliasesFile: path.join(ROOT, 'src', 'data', 'ingredient-aliases.json'),
  assetsJsDir: path.join(ROOT, 'assets', 'js'),
  assetsCssDir: path.join(ROOT, 'assets', 'css'),
  assetsDataDir: path.join(ROOT, 'assets', 'data'),
  iconsDir: path.join(ROOT, 'assets', 'icons'),
};

export const DEFAULT_SOON_SECTION = {
  lines: [
    'Rețete noi apar periodic pe site.',
    'Între timp poți explora categoriile existente sau poți folosi Randomizer-ul pentru idei rapide.',
  ],
};
