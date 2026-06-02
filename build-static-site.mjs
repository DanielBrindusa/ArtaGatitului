import fs from 'node:fs/promises';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = process.cwd();
const INVENTORY_PATH = path.join(ROOT, 'site-audit', 'godaddy-page-text-inventory.json');
const RECIPES_MD_PATH = path.join(ROOT, 'site-audit', 'godaddy-recipes-only.md');
const SOURCE_ICON_PATH = path.join(ROOT, 'icon.png');
const BUILD_VERSION = Date.now().toString(36);

const SITE_NAME = 'Arta Gătitului';
const HERO_IMAGE = 'https://img1.wsimg.com/isteam/stock/19687/:/rs=w:1800,m';
const CATEGORY_PAGES = {
  '/fel-principal': { name: 'Fel principal', slug: 'fel-principal', description: 'Supe, ciorbe și mâncăruri consistente pentru masa principală.' },
  '/fel-secundar': { name: 'Fel secundar', slug: 'fel-secundar', description: 'Rețete calde, garnituri și feluri care completează masa.' },
  '/desert': { name: 'Desert', slug: 'desert', description: 'Dulciuri simple pentru familie și musafiri.' },
  '/rontaieli': { name: 'Rontaieli', slug: 'rontaieli', description: 'Gustări rapide, platouri și idei de ronțăit.' },
  '/salate': { name: 'Salate', slug: 'salate', description: 'Salate și creme reci, bune lângă pâine prăjită.' },
  '/bauturi': { name: 'Băuturi', slug: 'bauturi', description: 'Băuturi și idei care urmează să fie adăugate.' },
  '/mic-dejun': { name: 'Mic dejun', slug: 'mic-dejun', description: 'Idei pentru dimineți gustoase, rapide sau mai tihnite.' },
};

const LOCAL_FALLBACK_RECIPES = [
  {
    name: 'Tocăniță de pui cu ardei copți',
    slug: 'tocanita-de-pui-cu-ardei',
    category: 'Fel secundar',
    sourceUrl: 'https://artagatitului.godaddysites.com/tocanita-de-pui-cu-ardei',
    preparation: [
      'Gătește pulpele de pui până se rumenesc ușor.',
      'Adaugă ceapa, usturoiul, ardeii copți și bulionul.',
      'Lasă tocănița să fiarbă până când sosul se leagă.',
      'Servește cu pătrunjel și pâine ciabatta.',
    ],
    ingredients: [
      'pulpe de pui',
      'ardei capia',
      'ceapă',
      'usturoi',
      'bulion',
      'ulei de măsline',
      'pătrunjel',
      'busuioc',
      'curry',
      'piper',
      'sare',
      'pâine ciabatta',
    ],
  },
];

const RECIPE_ALIASES = {
  'cartofi-prajiti-cu-sos-de-iaurt-si-menta': 'cartofi-prajiti-cu-sos',
  'ciorba-de-fasole-cu-afumatura': 'ciorba-de-fasole',
  'conopida-cu-orez-si-sos-rosu': 'conopida-cu-orez-1',
  'piept-de-pui-cu-lamaie-si-cartofi-aurii': 'pui-cu-lamaie-si-cartofi',
  'tocanita-de-pui-cu-ardei-copti': 'tocanita-de-pui-cu-ardei',
};

const RECIPE_METADATA = {
  'ciorba-de-fasole': {
    beforeStart: [
      'Pune fasolea la înmuiat cu o zi înainte și aruncă apa înainte de fierbere.',
      'Pregătește o oală încăpătoare pentru schimbarea apei la primele clocote.',
      'Curăță și taie ceapa, ardeiul și morcovul înainte să pornești focul.',
      'Pregătește afumătura, pasta de tomate și leușteanul pentru momentul potrivit.',
    ],
    tags: {
      taste: ['Sărat', 'Sățios', 'Aromat', 'Rustic'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      time: ['Necesită timp de așteptare', 'Bună pentru pregătit din timp'],
      context: ['Prânz', 'Cină', 'Pentru familie', 'Comfort food'],
      diet: ['Cu carne'],
      equipment: ['La oală'],
      technique: ['Fierbere', 'Sotare'],
    },
  },
  'supa-de-pui-cu-galuste': {
    beforeStart: [
      'Curăță legumele și pregătește o oală mare înainte să pui puiul la fiert.',
      'Ține la îndemână o spumieră ca să cureți supa în timpul fierberii.',
      'Pregătește separat bolul pentru compoziția de găluște.',
      'Citește pașii pentru momentul în care se adaugă găluștele și pătrunjelul.',
    ],
    tags: {
      taste: ['Sărat', 'Aromat', 'Ușor'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      context: ['Prânz', 'Cină', 'Pentru familie', 'Comfort food'],
      diet: ['Cu carne'],
      equipment: ['La oală'],
      technique: ['Fierbere'],
    },
  },
  'carne-cu-varza-murata': {
    beforeStart: [
      'Taie carnea de porc în cuburi aproximativ egale.',
      'Pregătește tigaia și apa măsurată înainte să pornești focul.',
      'Scurge varza murată dacă este foarte zemoasă.',
      'Lasă loc în tigaie ca bucățile de carne să se rumenească uniform.',
    ],
    tags: {
      taste: ['Sărat', 'Acrișor', 'Sățios', 'Rustic'],
      complexity: ['Ușor', 'Risc mic de greșeală'],
      context: ['Prânz', 'Cină', 'Comfort food'],
      diet: ['Cu carne', 'Fără lactate', 'Fără ou'],
      equipment: ['La tigaie'],
      technique: ['Prăjire', 'La tigaie'],
    },
  },
  'cartofi-prajiti-cu-sos': {
    beforeStart: [
      'Curăță și taie cartofii înainte să încălzești apa sau uleiul.',
      'Pregătește ingredientele pentru sos într-un bol separat.',
      'Lasă cartofii să se răcească după opărire, ca să se prăjească mai bine.',
      'Pregătește o farfurie cu șervețel pentru cartofii scoși din ulei.',
      'Nu aglomera tigaia când prăjești cartofii.',
    ],
    tags: {
      taste: ['Crocant', 'Cremos', 'Acrișor', 'Fresh', 'Sățios'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      context: ['Gustare', 'Prânz', 'Pentru weekend'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['La tigaie', 'La oală'],
      technique: ['Fierbere', 'Prăjire', 'La tigaie'],
    },
  },
  'chiftele-de-pui': {
    beforeStart: [
      'Fierbe pulpele de pui înainte să pregătești compoziția.',
      'Pregătește un bol pentru carne, ouă, făină și condimente.',
      'Păstrează puțină supă de la fierbere pentru compoziție.',
      'Încălzește uleiul la foc mediu și pregătește o farfurie pentru chiftelele prăjite.',
    ],
    tags: {
      taste: ['Sărat', 'Sățios'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      time: ['Sub 60 minute'],
      context: ['Prânz', 'Cină', 'Pentru familie'],
      diet: ['Cu carne'],
      equipment: ['La oală', 'La tigaie'],
      technique: ['Fierbere', 'Prăjire', 'La tigaie'],
    },
  },
  'conopida-cu-orez-1': {
    beforeStart: [
      'Spală conopida și taie-o în bucăți medii înainte să încălzești uleiul.',
      'Pregătește farfuria cu pesmet și bolul cu ou bătut.',
      'Curăță și toacă ceapa și usturoiul pentru sos înainte de gătire.',
      'Pregătește blenderul de mână pentru omogenizarea sosului.',
      'Ține la îndemână o farfurie pentru bucățile de conopidă prăjite.',
    ],
    tags: {
      taste: ['Crocant', 'Condimentat', 'Cremos', 'Sățios'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      context: ['Prânz', 'Cină', 'Pentru weekend'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['La tigaie', 'Necesită blender'],
      technique: ['Prăjire', 'Sotare', 'La tigaie'],
    },
  },
  'dovlecel-pane': {
    beforeStart: [
      'Feliază dovlecelul în rondele înainte să încălzești tigaia.',
      'Pregătește separat farfuria cu făină și bolul cu ou bătut.',
      'Încălzește uleiul la foc mediu și verifică să nu fie prea încins.',
      'Pregătește o farfurie pentru rondelele prăjite.',
    ],
    tags: {
      taste: ['Crocant', 'Sărat', 'Ușor'],
      complexity: ['Ușor', 'Necesită atenție'],
      time: ['Sub 30 minute'],
      context: ['Gustare', 'Prânz', 'Pentru zile aglomerate'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['La tigaie'],
      technique: ['Prăjire', 'La tigaie'],
    },
  },
  'fajitas-de-pui': {
    beforeStart: [
      'Taie puiul și legumele înainte să pornești focul.',
      'Condimentează puiul într-un bol separat.',
      'Pregătește tigaia și uleiul de măsline pentru sotare.',
      'Ține zeama de lămâie și usturoiul la îndemână pentru final.',
    ],
    tags: {
      taste: ['Condimentat', 'Sățios', 'Fresh'],
      complexity: ['Complexitate medie', 'Risc mic de greșeală'],
      time: ['Sub 60 minute'],
      context: ['Prânz', 'Cină', 'Pentru familie'],
      diet: ['Cu carne'],
      equipment: ['La tigaie'],
      technique: ['Sotare', 'La tigaie'],
    },
  },
  'gulas-cu-spaetzle': {
    beforeStart: [
      'Curăță ceapa, cartofii și usturoiul înainte să încălzești oala.',
      'Taie carnea în cuburi și ține condimentele pregătite.',
      'Spală cartofii tăiați și lasă-i în apă până îi adaugi.',
      'Pregătește apa și pasta de gulaș pentru etapa de fierbere.',
    ],
    tags: {
      taste: ['Sățios', 'Condimentat', 'Aromat', 'Rustic'],
      complexity: ['Complexitate medie'],
      context: ['Prânz', 'Cină', 'Comfort food'],
      diet: ['Cu carne'],
      equipment: ['La oală'],
      technique: ['Sotare', 'Fierbere'],
    },
  },
  'mancare-de-mazare-cu-pui': {
    beforeStart: [
      'Taie pieptul de pui în cuburi medii.',
      'Pregătește legumele, mărarul și condimentele înainte să încălzești oala.',
      'Măsoară făina și smântâna pentru compoziția adăugată spre final.',
      'Ține o linguriță la îndemână pentru adăugarea treptată a compoziției.',
    ],
    tags: {
      taste: ['Cremos', 'Sățios', 'Aromat'],
      complexity: ['Complexitate medie'],
      time: ['Sub 60 minute'],
      context: ['Prânz', 'Cină', 'Pentru familie'],
      diet: ['Cu carne'],
      equipment: ['La oală'],
      technique: ['Sotare', 'Fierbere'],
    },
  },
  'peste-cu-cartofi-natur': {
    beforeStart: [
      'Usucă peștele cu prosoape de hârtie înainte de marinare.',
      'Pregătește marinada și lasă peștele la rece cel puțin 3 ore.',
      'Preîncălzește cuptorul înainte să pui peștele în tavă.',
      'Curăță și taie cartofii pentru fierbere cât timp se pregătește peștele.',
    ],
    tags: {
      taste: ['Acrișor', 'Ușor', 'Aromat'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      time: ['Necesită timp de așteptare', 'Bună pentru pregătit din timp'],
      context: ['Prânz', 'Cină', 'Pentru weekend'],
      diet: ['Cu carne'],
      equipment: ['Necesită cuptor', 'Necesită tavă', 'La oală'],
      technique: ['Marinare', 'Coacere', 'Fierbere', 'La cuptor'],
    },
  },
  'pui-cu-lamaie-si-cartofi': {
    beforeStart: [
      'Taie puiul și pregătește farfuriile pentru făină și ou cu parmezan.',
      'Spală cartofii și pregătește condimentele înainte să începi gătirea.',
      'Rade parmezanul și toacă ceapa verde înainte să pornești focul.',
      'Pregătește lămâia, untul și usturoiul pentru sos.',
    ],
    tags: {
      taste: ['Acrișor', 'Crocant', 'Sățios', 'Aromat'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      context: ['Prânz', 'Cină', 'Pentru familie'],
      diet: ['Cu carne'],
      equipment: ['La tigaie'],
      technique: ['Prăjire', 'La tigaie'],
    },
  },
  'pui-dulce-acrisor-cu-orez': {
    beforeStart: [
      'Taie puiul și pregătește făina și oul pentru acoperire.',
      'Amestecă sosul dulce-acrișor înainte să pornești gătirea.',
      'Întinde foaia de copt în tavă.',
      'Preîncălzește cuptorul la temperatura indicată în rețetă.',
      'Pregătește orezul și apa pentru fierbere.',
    ],
    tags: {
      taste: ['Dulce', 'Acrișor', 'Sățios'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      context: ['Prânz', 'Cină', 'Pentru familie'],
      diet: ['Cu carne'],
      equipment: ['Necesită cuptor', 'Necesită tavă', 'La oală'],
      technique: ['Coacere', 'Fierbere', 'La cuptor'],
    },
  },
  'pulpe-de-pui-cu-orzo': {
    beforeStart: [
      'Condimentează pulpele înainte să încălzești tigaia.',
      'Taie ciupercile, toacă pătrunjelul și rade parmezanul dinainte.',
      'Pregătește orzo-ul și lichidul necesar pentru gătire.',
      'Ține untul, uleiul și usturoiul la îndemână pentru începutul gătirii.',
    ],
    tags: {
      taste: ['Cremos', 'Sățios', 'Aromat'],
      complexity: ['Complexitate medie'],
      context: ['Prânz', 'Cină', 'Pentru familie'],
      diet: ['Cu carne'],
      equipment: ['La tigaie'],
      technique: ['Sotare', 'La tigaie'],
    },
  },
  'rata-la-cuptor-umpluta': {
    beforeStart: [
      'Spală și usucă bine rața înainte de marinare.',
      'Planifică marinarea din timp, deoarece rața stă condimentată aproximativ 24 de ore.',
      'Curăță ceapa, usturoiul, cartofii și fructele pentru umplutură și garnitură.',
      'Pregătește tava și preîncălzește cuptorul înainte de coacere.',
      'Spală orezul și pregătește ingredientele pentru umplutură înainte să umpli rața.',
    ],
    tags: {
      taste: ['Sățios', 'Aromat', 'Rustic'],
      complexity: ['Complexitate ridicată', 'Necesită atenție'],
      time: ['Necesită timp de așteptare', 'Bună pentru pregătit din timp'],
      context: ['Cină', 'Pentru musafiri', 'Pentru weekend'],
      diet: ['Cu carne'],
      equipment: ['Necesită cuptor', 'Necesită tavă'],
      technique: ['Marinare', 'Coacere', 'La cuptor'],
    },
  },
  'snitel-pufos-de-pui': {
    beforeStart: [
      'Taie și bate pieptul de pui înainte să pregătești tigaia.',
      'Pregătește farfuria cu făină și bolul cu ou bătut.',
      'Încălzește uleiul la foc mediu ca șnițelul să se rumenească fără să se ardă.',
      'Pregătește o farfurie pentru bucățile prăjite.',
    ],
    tags: {
      taste: ['Crocant', 'Sărat', 'Sățios'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      time: ['Sub 30 minute'],
      context: ['Prânz', 'Cină', 'Pentru familie'],
      diet: ['Cu carne'],
      equipment: ['La tigaie'],
      technique: ['Prăjire', 'La tigaie'],
    },
  },
  shakshuka: {
    beforeStart: [
      'Taie ardeii și ceapa înainte să încălzești tigaia.',
      'Pregătește usturoiul, conserva de roșii, bulionul și condimentele.',
      'Toacă pătrunjelul și pregătește feta pentru final.',
      'Citește pașii pentru momentul în care se adaugă ouăle, ca să nu le gătești prea mult.',
    ],
    tags: {
      taste: ['Sățios', 'Condimentat', 'Aromat'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      time: ['Sub 60 minute'],
      context: ['Mic dejun', 'Prânz', 'Cină', 'Comfort food'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['La tigaie'],
      technique: ['Sotare', 'Fierbere', 'La tigaie'],
    },
  },
  'steak-de-vita': {
    beforeStart: [
      'Scoate carnea din frigider cu 20-30 minute înainte.',
      'Tamponează steak-ul cu șervețele, ca suprafața să fie uscată.',
      'Pregătește tigaia aleasă, cleștele și un loc pentru odihnirea cărnii.',
      'Citește pașii și setează calculatorul înainte să pui carnea în tigaie.',
      'Pregătește un timer sau folosește timerul din pagină.',
    ],
    tags: {
      taste: ['Sățios', 'Aromat'],
      complexity: ['Necesită atenție'],
      context: ['Cină', 'Pentru weekend'],
      diet: ['Cu carne'],
      equipment: ['La tigaie', 'Necesită termometru'],
      technique: ['La tigaie', 'Marinare'],
    },
  },
  'tocanita-de-cartofi': {
    beforeStart: [
      'Curăță ceapa, cartofii și usturoiul înainte să încălzești oala.',
      'Taie carnea în cuburi și pregătește mixul de legume.',
      'Spală cartofii tăiați și ține-i în apă până îi adaugi.',
      'Pregătește condimentele și pătrunjelul pentru final.',
    ],
    tags: {
      taste: ['Sățios', 'Rustic', 'Aromat'],
      complexity: ['Complexitate medie'],
      context: ['Prânz', 'Cină', 'Pentru familie', 'Comfort food'],
      diet: ['Cu carne'],
      equipment: ['La oală'],
      technique: ['Sotare', 'Fierbere'],
    },
  },
  'tocanita-de-pui-cu-ardei': {
    beforeStart: [
      'Pregătește pulpele de pui și taie legumele înainte să începi gătirea.',
      'Ține ardeii copți, bulionul și condimentele la îndemână.',
      'Pregătește oala sau tigaia adâncă pentru tocăniță.',
      'Toacă pătrunjelul pentru servire înainte de final.',
    ],
    tags: {
      taste: ['Sățios', 'Aromat', 'Condimentat'],
      complexity: ['Ușor', 'Risc mic de greșeală'],
      context: ['Prânz', 'Cină', 'Pentru familie'],
      diet: ['Cu carne'],
      equipment: ['La oală'],
      technique: ['Sotare', 'Fierbere'],
    },
  },
  'placinta-cu-dovleac': {
    beforeStart: [
      'Citește rețeta complet înainte să începi, fiindcă dovleacul se coace înainte de umplere.',
      'Preîncălzește cuptorul pentru coacerea dovleacului.',
      'Măsoară condimentele, zahărul și ingredientele pentru umplutură.',
      'Pregătește aluatul rece, tava și hârtia de copt.',
      'Bate oul pentru uns plăcintelele înainte să le bagi la cuptor.',
    ],
    tags: {
      taste: ['Dulce', 'Aromat', 'Fin'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      context: ['Pentru weekend', 'Pentru musafiri'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['Necesită cuptor', 'Necesită tavă'],
      technique: ['Coacere', 'La cuptor'],
    },
  },
  'charcuterie-board': {
    beforeStart: [
      'Pregătește blatul sau platoul pe care vei așeza ingredientele.',
      'Spală și usucă roșiile, castravetele, ardeiul și salata.',
      'Feliază brânzeturile, salamul și legumele înainte de asamblare.',
      'Ține grisinele și biscuiții separat până la servire, ca să rămână crocante.',
    ],
    tags: {
      taste: ['Sărat', 'Fresh', 'Ușor'],
      complexity: ['Începător', 'Ușor', 'Risc mic de greșeală'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Gustare', 'Pentru musafiri', 'Pentru weekend'],
      diet: ['Cu carne'],
      technique: ['Fără gătire'],
    },
  },
  'fructe-cu-nutella': {
    beforeStart: [
      'Spală și usucă fructele înainte să le feliezi.',
      'Răcește fructele dacă vrei gustarea mai fresh.',
      'Pregătește un cuțit mic și un bol sau o farfurie pentru servire.',
      'Scoate Nutella la îndemână ca să porționezi ușor cantitatea dorită.',
    ],
    tags: {
      taste: ['Dulce', 'Fresh', 'Ușor'],
      complexity: ['Începător', 'Ușor', 'Risc mic de greșeală'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Gustare', 'Pentru zile aglomerate'],
      diet: ['Fără carne', 'Vegetarian'],
      technique: ['Fără gătire'],
    },
  },
  'mar-cu-unt-de-arahide': {
    beforeStart: [
      'Spală mărul înainte să îl feliezi.',
      'Pregătește un cuțit și o farfurie pentru servire.',
      'Amestecă untul de arahide dacă s-a separat în borcan.',
      'Taie feliile chiar înainte de servire ca să rămână proaspete.',
    ],
    tags: {
      taste: ['Dulce', 'Fresh', 'Ușor'],
      complexity: ['Începător', 'Ușor', 'Risc mic de greșeală'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Gustare', 'Pentru zile aglomerate'],
      diet: ['Fără carne', 'Vegetarian', 'Fără lactate', 'Fără ou'],
      technique: ['Fără gătire'],
    },
  },
  'paine-prajita-unt-arahide': {
    beforeStart: [
      'Pregătește pâinea și untul de arahide înainte să prăjești feliile.',
      'Spală și taie fructele în rondele.',
      'Prăjește pâinea doar cât să devină crocantă, nu arsă.',
      'Asamblează feliile imediat după prăjire.',
    ],
    tags: {
      taste: ['Dulce', 'Crocant', 'Ușor'],
      complexity: ['Începător', 'Ușor', 'Risc mic de greșeală'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Mic dejun', 'Gustare', 'Pentru zile aglomerate'],
      diet: ['Fără carne', 'Vegetarian'],
    },
  },
  'salata-de-ciuperci': {
    beforeStart: [
      'Curăță, spală și taie ciupercile înainte să încălzești tigaia.',
      'Rade parmezanul și pregătește usturoiul.',
      'Lasă compoziția de ciuperci să se răcească înainte să adaugi maioneza și iaurtul.',
      'Pregătește pâinea prăjită și roșiile cherry pentru servire.',
    ],
    tags: {
      taste: ['Cremos', 'Sărat', 'Sățios'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      time: ['Necesită timp de așteptare', 'Bună pentru pregătit din timp'],
      context: ['Gustare', 'Prânz', 'Pentru familie'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['La tigaie'],
      technique: ['Sotare', 'La tigaie'],
    },
  },
  'avocado-cu-bacon': {
    beforeStart: [
      'Pregătește oala pentru ouă și tigaia pentru bacon.',
      'Spală roșiile și ceapa verde înainte să le toci.',
      'Alege un avocado copt, ca pasta să iasă cremoasă.',
      'Pregătește pâinea pentru prăjire înainte de asamblare.',
    ],
    tags: {
      taste: ['Sărat', 'Cremos', 'Crocant', 'Sățios'],
      complexity: ['Ușor'],
      time: ['Sub 30 minute'],
      context: ['Mic dejun', 'Pentru weekend'],
      diet: ['Cu carne'],
      equipment: ['La oală', 'La tigaie'],
      technique: ['Fierbere', 'Prăjire', 'La tigaie'],
    },
  },
  'bagheta-bistro': {
    beforeStart: [
      'Taie bagheta pe lungime fără să rupi complet bucățile.',
      'Spală și usucă frunzele de salată.',
      'Pregătește untul, brânza, șunca și iaurtul înainte de asamblare.',
      'Asamblează bagheta aproape de servire ca să rămână proaspătă.',
    ],
    tags: {
      taste: ['Sărat', 'Fresh', 'Ușor'],
      complexity: ['Începător', 'Ușor', 'Risc mic de greșeală'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Mic dejun', 'Gustare', 'Pentru zile aglomerate'],
      diet: ['Cu carne'],
      technique: ['Fără gătire'],
    },
  },
  'clatite-cu-mere': {
    beforeStart: [
      'Măsoară ingredientele uscate și lichide înainte să faci aluatul.',
      'Spală, curăță și rade mărul pe răzătoarea fină.',
      'Pregătește tigaia de clătite și încălzește-o la foc potrivit.',
      'Taie fructele pentru servire înainte să începi coacerea clătitelor.',
    ],
    tags: {
      taste: ['Dulce', 'Aromat'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      time: ['Sub 30 minute'],
      context: ['Mic dejun', 'Pentru weekend'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['La tigaie'],
      technique: ['La tigaie'],
    },
  },
  'gris-cu-lapte-si-cocos': {
    beforeStart: [
      'Măsoară laptele, grișul și zahărul înainte să pornești focul.',
      'Pregătește o oală medie și o lingură pentru amestecat constant.',
      'Ține toppingurile pregătite pentru servire.',
      'Folosește foc mic-mediu ca să nu se prindă laptele.',
    ],
    tags: {
      taste: ['Dulce', 'Cremos', 'Fin'],
      complexity: ['Începător', 'Ușor', 'Risc mic de greșeală'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Mic dejun', 'Pentru zile aglomerate', 'Comfort food'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['La oală'],
      technique: ['Fierbere'],
    },
  },
  'omleta-cu-spanac': {
    beforeStart: [
      'Bate ouăle cu sare și piper înainte să încălzești tigaia.',
      'Spală spanacul și legumele pentru servire.',
      'Pregătește brânza, măslinele și roșiile înainte de gătire.',
      'Încălzește tigaia la foc mic-mediu pentru o omletă mai controlată.',
    ],
    tags: {
      taste: ['Sărat', 'Ușor', 'Fresh'],
      complexity: ['Ușor', 'Risc mic de greșeală'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Mic dejun', 'Pentru zile aglomerate'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['La tigaie'],
      technique: ['La tigaie', 'Prăjire'],
    },
  },
  'ou-posat-cu-avocado': {
    beforeStart: [
      'Pregătește cratița cu apă și cana cu folie alimentară înainte să începi.',
      'Unge folia cu puțin ulei ca oul să se desprindă mai ușor.',
      'Taie somonul, castravetele și ceapa înainte de asamblare.',
      'Pisează avocado cu lămâie și sare aproape de servire.',
      'Pregătește pâinea pentru prăjire înainte să scoți oul din apă.',
    ],
    tags: {
      taste: ['Fresh', 'Cremos', 'Sățios'],
      complexity: ['Complexitate medie', 'Necesită atenție'],
      time: ['Sub 30 minute'],
      context: ['Mic dejun', 'Pentru weekend'],
      diet: ['Cu carne'],
      equipment: ['La oală'],
      technique: ['Fierbere'],
    },
  },
  'ovaz-cu-lapte': {
    beforeStart: [
      'Măsoară laptele, ovăzul și zahărul înainte să pornești focul.',
      'Pregătește o oală medie și o lingură pentru amestecat.',
      'Ține fructele, gemul sau siropul pregătite pentru servire.',
      'Amestecă des ca ovăzul să nu se lipească de fundul oalei.',
    ],
    tags: {
      taste: ['Dulce', 'Cremos', 'Fin'],
      complexity: ['Începător', 'Ușor', 'Risc mic de greșeală'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Mic dejun', 'Pentru zile aglomerate', 'Comfort food'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['La oală'],
      technique: ['Fierbere'],
    },
  },
  'ovaz-peste-noapte': {
    beforeStart: [
      'Pregătește un borcan mediu curat, cu capac.',
      'Măsoară laptele, iaurtul, mierea, ovăzul și semințele de chia.',
      'Amestecă bine baza înainte să adaugi ovăzul.',
      'Planifică rețeta cu o seară înainte, deoarece stă la frigider peste noapte.',
    ],
    tags: {
      taste: ['Dulce', 'Cremos', 'Fresh'],
      complexity: ['Începător', 'Ușor', 'Risc mic de greșeală'],
      time: ['Necesită timp de așteptare', 'Bună pentru pregătit din timp'],
      context: ['Mic dejun', 'Pentru zile aglomerate'],
      diet: ['Fără carne', 'Vegetarian'],
      technique: ['Fără gătire'],
    },
  },
  'sandwitch-cu-mozzarella': {
    beforeStart: [
      'Prăjește feliile de pâine înainte de asamblare.',
      'Taie roșia și mozzarella în felii egale.',
      'Pregătește șunca, spanacul, crema de brânză și guacamole-ul.',
      'Asamblează sandwich-ul aproape de servire ca pâinea să rămână crocantă.',
    ],
    tags: {
      taste: ['Sărat', 'Fresh', 'Cremos'],
      complexity: ['Începător', 'Ușor', 'Risc mic de greșeală'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Mic dejun', 'Gustare', 'Pentru zile aglomerate'],
      diet: ['Cu carne'],
    },
  },
  'sandwitch-cu-ton': {
    beforeStart: [
      'Prăjește feliile de pâine înainte să pregătești compoziția.',
      'Scurge bine tonul de lichid.',
      'Taie ceapa, ardeiul și castraveții murați în cuburi mici.',
      'Pregătește maioneza, lămâia și Tabasco-ul pentru ajustarea gustului.',
    ],
    tags: {
      taste: ['Sărat', 'Acrișor', 'Fresh', 'Sățios'],
      complexity: ['Începător', 'Ușor', 'Risc mic de greșeală'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Mic dejun', 'Gustare', 'Pentru zile aglomerate'],
      diet: ['Cu carne'],
    },
  },
  'toast-cu-ou-si-avocado': {
    beforeStart: [
      'Încălzește tigaia la foc mic-mediu înainte să adaugi ouăle.',
      'Prăjește pâinea înainte de asamblare.',
      'Bate ouăle cu sare și piper într-un bol mic.',
      'Taie avocado și pregătește semințele și legumele pentru servire.',
    ],
    tags: {
      taste: ['Cremos', 'Sățios', 'Fresh'],
      complexity: ['Ușor'],
      time: ['Sub 15 minute', 'Rețetă rapidă'],
      context: ['Mic dejun', 'Pentru zile aglomerate'],
      diet: ['Fără carne', 'Vegetarian'],
      equipment: ['La tigaie'],
      technique: ['La tigaie'],
    },
  },
};

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|\s|-)([a-z])/g, (match) => match.toUpperCase());
}

function displayRecipeName(name) {
  const text = String(name || '').trim();
  if (!text) return text;
  return text === text.toUpperCase() ? titleCase(text) : text;
}

function readRecipeSections(markdown) {
  return markdown
    .split(/\n## /)
    .slice(1)
    .map((section) => {
      const lines = section.split('\n');
      const heading = lines.shift().trim();
      const urlLine = lines.find((line) => line.startsWith('URL: '));
      const bulletLines = lines
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2).trim())
        .filter(Boolean);

      return {
        heading,
        url: urlLine ? urlLine.slice(5).trim() : '',
        lines: bulletLines,
      };
    });
}

function splitRecipe(section) {
  const slug = new URL(section.url).pathname.replace(/^\/+/, '');
  const actualTitle = displayRecipeName(section.lines[0] || section.heading);
  const prepIndex = section.lines.indexOf('Mod de preparare');
  const ingredientsIndex = section.lines.indexOf('Ingrediente');
  const poftaIndex = section.lines.indexOf('Pofta buna!');
  const preparationEnd = ingredientsIndex >= 0 ? ingredientsIndex : section.lines.length;

  const preparation = prepIndex >= 0
    ? section.lines.slice(prepIndex + 1, preparationEnd).filter((line) => line !== 'Pofta buna!')
    : [];

  let ingredients = ingredientsIndex >= 0
    ? section.lines.slice(ingredientsIndex + 1)
    : [];

  const extras = [];
  const steakCalculatorIndex = ingredients.findIndex((line) => line.toLowerCase().includes('calculator gatire steak'));
  if (steakCalculatorIndex >= 0) {
    extras.push({
      type: 'steak-calculator',
      title: ingredients[steakCalculatorIndex],
    });
    ingredients = ingredients.slice(0, steakCalculatorIndex);
  }

  return {
    name: actualTitle,
    slug,
    category: '',
    sourceUrl: section.url,
    description: makeDescription(actualTitle, preparation, ingredients),
    preparation,
    ingredients,
    closing: poftaIndex >= 0 ? 'Poftă bună!' : '',
    extras,
  };
}

function makeDescription(name, preparation, ingredients) {
  const firstStep = preparation.find((line) => !isSubheading(line));
  if (firstStep) return firstStep;
  const preview = ingredients.filter((line) => !isSubheading(line)).slice(0, 3).join(', ');
  return preview ? `${name} cu ${preview}.` : `${name}.`;
}

function isSubheading(line) {
  return /:$/.test(line) || /^[A-ZĂÂÎȘȚ0-9\s/-]{3,}$/.test(line);
}

function buildCategoryMap(inventory) {
  const map = new Map();
  for (const [pagePath, category] of Object.entries(CATEGORY_PAGES)) {
    const page = inventory.pages.find((entry) => new URL(entry.url).pathname === pagePath);
    if (!page) continue;

    for (const link of page.links) {
      const slug = new URL(link).pathname.replace(/^\/+/, '');
      if (!slug || slug === 'soon-to-come' || CATEGORY_PAGES[`/${slug}`] || slug === 'portofoliu' || slug === 'randomizer') continue;
      map.set(slug, category.name);
    }
  }
  return map;
}

function mergeRecipes(parsedRecipes, categoryMap) {
  const recipesBySlug = new Map();

  for (const recipe of parsedRecipes) {
    if (recipe.slug === 'soon-to-come') continue;
    recipe.category = categoryMap.get(recipe.slug) || 'Fel secundar';
    recipesBySlug.set(recipe.slug, recipe);
  }

  for (const fallback of LOCAL_FALLBACK_RECIPES) {
    if (!recipesBySlug.has(fallback.slug)) {
      recipesBySlug.set(fallback.slug, {
        ...fallback,
        description: fallback.description || makeDescription(fallback.name, fallback.preparation, fallback.ingredients),
        closing: fallback.closing || 'Poftă bună!',
        extras: fallback.extras || [],
      });
    }
  }

  const categoryOrder = Object.values(CATEGORY_PAGES).map((category) => category.name);
  return [...recipesBySlug.values()].sort((a, b) => {
    const categoryDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    return categoryDiff || a.name.localeCompare(b.name, 'ro');
  }).map(enrichRecipeMetadata);
}

function mergeTagGroups(...groups) {
  return groups.reduce((merged, group) => {
    if (!group || typeof group !== 'object') return merged;
    for (const [key, values] of Object.entries(group)) {
      const clean = Array.isArray(values) ? values.map((value) => String(value || '').trim()).filter(Boolean) : [];
      if (!clean.length) continue;
      merged[key] = Array.from(new Set([...(merged[key] || []), ...clean]));
    }
    return merged;
  }, {});
}

function enrichRecipeMetadata(recipe) {
  const metadata = RECIPE_METADATA[recipe.slug] || {};
  const beforeStart = Array.isArray(recipe.beforeStart) && recipe.beforeStart.length
    ? recipe.beforeStart
    : metadata.beforeStart || [];
  const tags = mergeTagGroups(metadata.tags, recipe.tags);
  return {
    ...recipe,
    beforeStart,
    tags,
  };
}

function dataFile(categories, recipes) {
  const data = {
    categories,
    heroImage: HERO_IMAGE,
    recipes: recipes.map((recipe) => ({
      name: recipe.name,
      slug: recipe.slug,
      category: recipe.category,
      description: recipe.description,
      ingredients: recipe.ingredients,
      preparation: recipe.preparation,
      beforeStart: recipe.beforeStart || [],
      closing: recipe.closing,
      extras: recipe.extras,
      sourceUrl: recipe.sourceUrl,
      tags: recipe.tags || {},
      ratingSummary: recipe.ratingSummary || null,
      keywords: Array.from(new Set([
        ...recipe.name.split(/\s+/),
        ...recipe.category.split(/\s+/),
        ...recipe.ingredients.flatMap((line) => line.split(/\s+/)),
        ...Object.values(recipe.tags || {}).flatMap((items) => Array.isArray(items) ? items.flatMap((item) => String(item).split(/\s+/)) : []),
      ].map(slugify).filter(Boolean))),
    })),
    aliases: RECIPE_ALIASES,
  };

  return `window.ARTA_DATA = ${JSON.stringify(data, null, 2)};\n`;
}

function nav(root) {
  const primaryLinks = [
    ['Portofoliu', 'portofoliu/'],
    ['Ce pot găti?', 'ce-pot-gati.html'],
    ['Randomizer', 'randomizer/'],
    ['Caută', 'cauta.html'],
  ];
  const menuLinks = [
    ['Categorii', 'categorii.html'],
    ['Fel principal', 'fel-principal/'],
    ['Fel secundar', 'fel-secundar/'],
    ['Desert', 'desert/'],
    ['Rontaieli', 'rontaieli/'],
    ['Salate', 'salate/'],
    ['Băuturi', 'bauturi/'],
    ['Mic dejun', 'mic-dejun/'],
  ];

  return `
    <header class="site-header">
      <div class="nav-wrap">
        <a class="logo" href="${root}index.html" aria-label="${SITE_NAME}">
          <span class="logo-mark">AG</span>
          <span>${SITE_NAME}</span>
        </a>
        <nav class="nav-primary" aria-label="Navigație principală">
          ${primaryLinks.map(([label, href]) => `<a href="${root}${href}">${label}</a>`).join('\n          ')}
        </nav>
        <div class="nav-tools" aria-label="Instrumente rapide">
          <button class="nav-tool" type="button" data-open-command aria-label="Caută rapid rețete, categorii sau etichete">
            <span aria-hidden="true">K</span>
            <span>Rapid</span>
          </button>
          <button class="nav-tool" type="button" data-theme-toggle aria-expanded="false" aria-controls="themePanel">
            <span aria-hidden="true">A</span>
            <span>Aspect</span>
          </button>
        </div>
        <button class="mobile-menu-btn" type="button" aria-expanded="false" aria-controls="siteNav" aria-label="Deschide meniul de categorii">
          <span aria-hidden="true">☰</span>
          <span>Categorii</span>
        </button>
        <nav class="nav-links" id="siteNav" aria-label="Categorii rețete">
          ${menuLinks.map(([label, href]) => `<a href="${root}${href}">${label}</a>`).join('\n          ')}
        </nav>
      </div>
    </header>`;
}

function footer(root) {
  return `
    <footer class="footer">
      <p>Copyright © <span id="year"></span> ${SITE_NAME} - Toate drepturile rezervate.</p>
      <p class="footer-tools"><a href="${root}adauga-reteta.html">Creator rețetă</a></p>
    </footer>`;
}

function page({ title, description, root = '', bodyAttrs = '', main }) {
  const documentTitle = title === SITE_NAME ? SITE_NAME : `${title} | ${SITE_NAME}`;
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(documentTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#0f1117">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="${SITE_NAME}">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="manifest" href="${root}manifest.json">
  <link rel="icon" type="image/png" href="${root}assets/icons/icon.png">
  <link rel="apple-touch-icon" href="${root}assets/icons/icon.png">
  <script>
    try {
      const savedTheme = localStorage.getItem('arta-gatitului-theme');
      if (savedTheme) document.documentElement.dataset.theme = savedTheme;
    } catch {}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Source+Sans+3:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${root}assets/css/style.css?v=${BUILD_VERSION}">
</head>
<body${bodyAttrs ? ` ${bodyAttrs}` : ''}>
<a class="skip-link" href="#main-content">Sari la conținut</a>
${nav(root)}
<div class="install-toast" id="installPrompt" hidden>
  <p>Instalează Arta Gătitului pe telefon pentru acces rapid la rețete.</p>
  <p class="install-help" data-install-help hidden></p>
  <div>
    <button class="btn" type="button" data-install-action>Instalează</button>
    <button class="btn secondary" type="button" data-install-dismiss>Mai târziu</button>
  </div>
</div>
<div class="scroll-progress" data-scroll-progress aria-hidden="true"><span></span></div>
<div class="offline-badge" id="offlineBadge" hidden aria-live="polite">Offline</div>
<div class="theme-panel" id="themePanel" hidden aria-hidden="true">
  <p class="eyebrow">Aspect</p>
  <div class="theme-options" role="group" aria-label="Alege tema site-ului">
    <button type="button" data-theme-choice="" aria-pressed="true">Cald</button>
    <button type="button" data-theme-choice="cream" aria-pressed="false">Crem</button>
    <button type="button" data-theme-choice="contrast" aria-pressed="false">Contrast</button>
    <button type="button" data-theme-choice="night" aria-pressed="false">Noapte</button>
  </div>
</div>
<div class="command-palette" id="commandPalette" hidden aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="commandPaletteTitle">
  <button class="command-backdrop" type="button" data-command-backdrop aria-label="Închide căutarea rapidă"></button>
  <section class="command-dialog" role="document">
    <div class="command-head">
      <h2 id="commandPaletteTitle">Caută rapid</h2>
      <button class="mini-btn" type="button" data-command-close aria-label="Închide">×</button>
    </div>
    <label class="sr-only" for="commandPaletteInput">Caută rapid rețete, categorii sau etichete</label>
    <input id="commandPaletteInput" type="search" placeholder="Caută rapid rețete, categorii sau etichete..." autocomplete="off">
    <div id="commandPaletteResults" class="command-results" role="listbox" aria-live="polite"></div>
  </section>
</div>
${main}
${footer(root)}
<script>document.getElementById('year').textContent = new Date().getFullYear();</script>
<script>window.ARTA_ROOT = "${root}";</script>
<script src="${root}assets/js/recipes.js?v=${BUILD_VERSION}"></script>
<script src="${root}assets/js/site.js?v=${BUILD_VERSION}"></script>
</body>
</html>
`;
}

function homePage() {
  return page({
    title: SITE_NAME,
    description: 'Viață ocupată, mâncare sănătoasă. Rețete organizate pe categorii și căutare după ingrediente.',
    main: `
      <main id="main-content">
        <section class="hero hero-home">
          <div class="hero-inner">
            <p class="eyebrow">Ce gătim azi?</p>
            <h1>${SITE_NAME}</h1>
            <p class="lead">Rețetele tale într-o aplicație statică rapidă, cu căutare vie, categorii clare și idei bune pentru orice masă.</p>
            <form class="hero-search" action="cauta.html" method="get" role="search">
              <label class="sr-only" for="homeSearch">Caută după ingredient, rețetă sau etichetă</label>
              <input id="homeSearch" name="q" type="search" placeholder="Caută după ingredient, rețetă sau etichetă" autocomplete="off">
              <button class="btn" type="submit">Caută</button>
            </form>
            <div class="hero-actions">
              <button class="btn" type="button" id="surpriseRecipeButton">Surprinde-mă cu o rețetă</button>
              <a class="btn secondary" href="ce-pot-gati.html">Ce pot găti?</a>
            </div>
            <div class="hero-chips" aria-label="Sugestii rapide">
              <a href="mic-dejun/">Mic dejun</a>
              <a href="fel-principal/">Fel principal</a>
              <a href="desert/">Desert</a>
              <a href="cauta.html?q=rapid">Rapid</a>
              <a href="cauta.html?q=cremos">Cremos</a>
            </div>
          </div>
        </section>

        <section class="section compact">
          <div class="section-head">
            <div>
              <p class="eyebrow">Categorii</p>
              <h2>Alege după poftă</h2>
            </div>
          </div>
          <div id="categoryGrid" class="grid categories"></div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <p class="eyebrow">Rețete</p>
              <h2>Rețete pentru acasă</h2>
            </div>
          </div>
          <div id="featuredRecipes" class="grid cards"></div>
        </section>
      </main>`,
  });
}

function categoriesIndexPage() {
  return page({
    title: 'Categorii',
    description: 'Toate categoriile și rețetele din Arta Gătitului.',
    main: `
      <main class="section" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Categorii</p>
          <h1>Toate categoriile</h1>
          <p>Răsfoiește rețetele după tipul mesei sau caută direct după ingredient.</p>
        </div>
        <div id="categoryGrid" class="grid categories"></div>

        <section class="subsection">
          <div class="section-head">
            <div>
              <p class="eyebrow">Index</p>
              <h2>Toate rețetele</h2>
            </div>
          </div>
          <div id="allRecipes" class="grid cards"></div>
        </section>
      </main>`,
  });
}

function searchPage() {
  return page({
    title: 'Caută rețete',
    description: 'Caută rețete după nume, categorie sau ingrediente.',
    main: `
      <main class="section" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Căutare</p>
          <h1>Caută rețete</h1>
          <p>Scrie un nume de rețetă, un ingredient sau alege o categorie.</p>
        </div>

        <section class="search-panel" aria-labelledby="searchPanelTitle">
          <div class="search-panel-head">
            <h2 id="searchPanelTitle">Găsește rapid ce vrei să gătești</h2>
            <p>Căutarea ignoră diacriticele, deci „galuste” găsește și „găluște”.</p>
          </div>
          <div class="search-row">
            <label class="field">
              <span>Caută după text</span>
              <input id="recipeSearchInput" type="search" placeholder="pui, cartofi, fasole, avocado..." autocomplete="off">
            </label>
            <label class="field">
              <span>Categorie</span>
              <select id="recipeCategoryFilter"></select>
            </label>
          </div>
        </section>

        <div id="recipeCount" class="count" aria-live="polite"></div>
        <div id="searchResults" class="grid cards"></div>
      </main>`,
  });
}

function ingredientMatcherPage() {
  return page({
    title: 'Ce pot găti?',
    description: 'Recomandări de rețete în funcție de ingredientele pe care le ai deja acasă.',
    main: `
      <main class="section ingredient-page" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Ingredient matcher</p>
          <h1>Ce pot găti cu ingredientele pe care le am?</h1>
          <p>Introdu ingredientele pe care le ai deja acasă, separate prin virgulă sau spațiu. Îți vom arăta rețetele pe care le poți prepara complet sau aproape complet.</p>
        </div>

        <section class="ingredient-panel" aria-labelledby="ingredientMatcherTitle">
          <div class="search-panel-head">
            <h2 id="ingredientMatcherTitle">Caută după ingrediente disponibile</h2>
            <p>Căutarea ignoră diacriticele și folosește cuvinte complete, deci „galuste” găsește „găluște”, iar „ou” nu se potrivește cu fragmente ascunse în cuvinte mai lungi.</p>
          </div>
          <form id="ingredientMatcherForm" class="ingredient-form">
            <label class="field ingredient-field">
              <span>Ingredientele tale</span>
              <textarea id="availableIngredients" rows="4" placeholder="ex. pui, cartofi, ou, lapte, usturoi" autocomplete="off"></textarea>
            </label>
            <div class="ingredient-actions">
              <button class="btn" type="submit">Vezi ce pot găti</button>
              <button class="btn secondary" type="button" id="resetIngredientMatcher">Resetează</button>
            </div>
          </form>
          <div id="ingredientChips" class="ingredient-chips" aria-label="Ingrediente detectate"></div>
          <p class="builder-callout ingredient-note">Pentru rezultate mai bune, adaugă în rețete ingrediente și cuvinte-cheie simple, de exemplu: ou, ouă, pui, cartofi.</p>
        </section>

        <div id="ingredientMatchSummary" class="count" aria-live="polite"></div>
        <div id="ingredientMatchResults" class="ingredient-results"></div>
      </main>`,
  });
}

function categoryPage(category, root = '../../') {
  return page({
    title: category.name,
    description: category.description,
    root,
    bodyAttrs: `data-category-slug="${category.slug}"`,
    main: `
      <main class="section" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Categorie</p>
          <h1 id="categoryTitle">${escapeHtml(category.name)}</h1>
          <p id="categoryDescription">${escapeHtml(category.description)}</p>
        </div>
        <div id="categoryRecipes" class="grid cards"></div>
      </main>`,
  });
}

function recipePage(recipe, root = '../../', slugOverride = recipe.slug) {
  return page({
    title: recipe.name,
    description: recipe.description,
    root,
    bodyAttrs: `data-recipe-slug="${slugOverride}"`,
    main: `
      <main class="section" id="main-content">
        <div id="recipeDetail"></div>
      </main>`,
  });
}

function portfolioPage() {
  return page({
    title: 'Portofoliu',
    description: 'Portofoliul de rețete Arta Gătitului.',
    root: '../',
    main: `
      <main class="section" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Portofoliu</p>
          <h1>Portofoliu</h1>
          <p>Vezi colecția de categorii și intră rapid în rețetele deja migrate.</p>
        </div>
        <div id="categoryGrid" class="grid categories"></div>
      </main>`,
  });
}

function randomizerPage() {
  return page({
    title: 'Randomizer',
    description: 'Generator aleatoriu de meniu complet.',
    root: '../',
    main: `
      <main class="section randomizer-page" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Randomizer</p>
          <h1>Generator meniu complet</h1>
          <p>Nu știi ce să gătești? Lasă site-ul să aleagă câte ceva pentru mic dejun, masă principală, desert și gustări.</p>
        </div>
        <section class="randomizer-panel" aria-live="polite">
          <button class="btn" type="button" id="randomRecipeButton">Generează alt meniu</button>
          <div id="randomRecipeResult" class="random-result"></div>
        </section>
      </main>`,
  });
}

function recipeBuilderPage() {
  return page({
    title: 'Adaugă rețetă',
    description: 'Creator vizual pentru rețete noi, cu previzualizare și export pentru proiect.',
    bodyAttrs: 'data-builder-page="true"',
    main: `
      <main class="section builder-page" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Instrument owner</p>
          <h1>Adaugă rețetă</h1>
          <p>Această pagină te ajută să creezi o rețetă fără să scrii cod. Previzualizarea se actualizează automat, iar exportul rămâne compatibil cu site-ul static de pe GitHub Pages.</p>
        </div>

        <section class="builder-help" aria-labelledby="builderHelpTitle">
          <div class="builder-help-intro">
            <h2 id="builderHelpTitle">Cum adaugi o rețetă nouă</h2>
            <p>Această pagină te ajută să creezi vizual o rețetă și să exportezi datele potrivite pentru proiect. Ea nu publică singură rețeta online, deoarece site-ul este static și rulează pe GitHub Pages.</p>
          </div>

          <div class="builder-guide-grid">
            <article class="builder-guide-card">
              <h3>1. Completează rețeta</h3>
              <ol class="clean">
                <li>Scrie titlul rețetei.</li>
                <li>Alege categoria exactă din listă.</li>
                <li>Adaugă descrierea scurtă.</li>
                <li>Adaugă ingredientele și pașii de preparare.</li>
                <li>Adaugă lista „Înainte să începi” și etichetele care descriu corect rețeta.</li>
                <li>Verifică previzualizarea din dreapta.</li>
              </ol>
            </article>

            <article class="builder-guide-card">
              <h3>2. Ce înseamnă slug / link</h3>
              <p>Slug-ul este partea din link a rețetei. Se generează automat din titlu, fără diacritice, fără spații și cu litere mici.</p>
              <p><strong>Exemplu:</strong> „Supă de pui cu găluște” devine <code>supa-de-pui-cu-galuste</code>, iar pagina generată va fi <code>retete/supa-de-pui-cu-galuste/index.html</code>.</p>
            </article>

            <article class="builder-guide-card">
              <h3>3. Ce copiezi în proiect</h3>
              <p>Copiază obiectul exportat și lipește-l în <code>LOCAL_FALLBACK_RECIPES</code> din <code>build-static-site.mjs</code>, la finalul listei.</p>
              <p>Păstrează virgula dintre obiecte. Nu edita direct <code>assets/js/recipes.js</code> ca sursă principală, fiindcă generatorul îl rescrie.</p>
            </article>

            <article class="builder-guide-card">
              <h3>4. Publicare pe GitHub Pages</h3>
              <ol class="clean">
                <li>Salvează modificarea în <code>build-static-site.mjs</code>.</li>
                <li>Rulează <code>node build-static-site.mjs</code> pe calculatorul tău.</li>
                <li>Urcă pe GitHub fișierele schimbate, inclusiv <code>assets/js/recipes.js</code>, <code>retete/&lt;slug&gt;/index.html</code> și <code>&lt;slug&gt;/index.html</code>.</li>
                <li>Așteaptă redeploy-ul GitHub Pages, apoi testează rețeta pe site.</li>
              </ol>
            </article>

            <article class="builder-guide-card">
              <h3>5. Greșeli frecvente</h3>
              <ul class="clean">
                <li>Lipsește virgula dintre rețete în <code>LOCAL_FALLBACK_RECIPES</code>.</li>
                <li>Slug-ul este duplicat.</li>
                <li>Categoria nu este una dintre categoriile existente.</li>
                <li>Au rămas rânduri goale la ingrediente sau pași.</li>
                <li>Ai modificat fișierul, dar nu ai rulat generatorul.</li>
                <li>GitHub Pages încă nu a terminat publicarea.</li>
              </ul>
            </article>

            <article class="builder-guide-card">
              <h3>6. Verificare finală</h3>
              <ul class="clean">
                <li>Rețeta apare în căutare.</li>
                <li>Rețeta apare în categoria corectă.</li>
                <li>Pagina rețetei se deschide corect.</li>
                <li>Checklist-ul și etichetele apar doar dacă ai completat acele câmpuri.</li>
                <li>Cardul arată bine pe mobil și desktop.</li>
                <li>Randomizer-ul o poate folosi dacă categoria este inclusă.</li>
              </ul>
            </article>
          </div>

          <div class="builder-callout">
            <strong>Notă despre căutare și „Ce pot găti?”:</strong> potrivirile funcționează pe cuvinte complete. Pentru rezultate mai bune, folosește ingrediente și cuvinte-cheie simple, de exemplu <code>ou</code>, <code>ouă</code>, <code>pui</code>, <code>cartofi</code>.
          </div>

          <div class="builder-callout">
            <strong>Notă despre etichete și evaluări:</strong> alege doar etichetele care descriu corect rețeta. Datele de evaluări publice se completează doar dacă ai valori reale; site-ul static nu inventează și nu agregă automat evaluări de la vizitatori.
          </div>
        </section>

        <div class="builder-layout">
          <form id="recipeBuilderForm" class="builder-card builder-editor" novalidate>
            <div class="section-head compact-head">
              <div>
                <p class="eyebrow">Editor</p>
                <h2>Date rețetă</h2>
              </div>
            </div>

            <div id="builderValidation" class="builder-validation" role="status" aria-live="polite"></div>

            <div class="builder-form-grid">
              <label class="field" data-builder-field="title">
                <span>Titlu rețetă *</span>
                <input id="builderTitle" type="text" autocomplete="off" required>
              </label>
              <label class="field" data-builder-field="slug">
                <span>Slug / URL *</span>
                <input id="builderSlug" type="text" autocomplete="off" required>
              </label>
              <label class="field" data-builder-field="category">
                <span>Categorie *</span>
                <select id="builderCategory" required></select>
              </label>
              <label class="field">
                <span>Timp pregătire</span>
                <input id="builderPrepTime" type="text" placeholder="ex. 20 min">
              </label>
              <label class="field">
                <span>Timp gătire</span>
                <input id="builderCookTime" type="text" placeholder="ex. 35 min">
              </label>
              <label class="field">
                <span>Porții / dificultate</span>
                <input id="builderServings" type="text" placeholder="ex. 4 porții, ușor">
              </label>
            </div>

            <label class="field builder-wide">
              <span>Descriere scurtă</span>
              <textarea id="builderDescription" rows="3" placeholder="O propoziție scurtă pentru card și pagina rețetei."></textarea>
            </label>

            <label class="field builder-wide">
              <span>Imagine URL / cale</span>
              <input id="builderImage" type="url" placeholder="opțional, ex. assets/images/reteta.jpg">
            </label>

            <section class="builder-list-section" aria-labelledby="ingredientsTitle">
              <div class="builder-list-head">
                <h3 id="ingredientsTitle">Ingrediente *</h3>
                <button class="btn secondary" type="button" data-add-row="ingredients">Adaugă ingredient</button>
              </div>
              <div id="builderIngredients" class="builder-list" data-list="ingredients"></div>
            </section>

            <section class="builder-list-section" aria-labelledby="beforeStartBuilderTitle">
              <div class="builder-list-head">
                <div>
                  <h3 id="beforeStartBuilderTitle">Înainte să începi</h3>
                  <p class="builder-note">Adaugă aici lucrurile pe care utilizatorul trebuie să le pregătească înainte să înceapă rețeta: preîncălzirea cuptorului, scoaterea ingredientelor din frigider, pregătirea vaselor etc.</p>
                </div>
                <button class="btn secondary" type="button" data-add-row="beforeStart">Adaugă verificare</button>
              </div>
              <div id="builderBeforeStart" class="builder-list" data-list="beforeStart"></div>
            </section>

            <section class="builder-list-section" aria-labelledby="stepsTitle">
              <div class="builder-list-head">
                <h3 id="stepsTitle">Pași de preparare *</h3>
                <button class="btn secondary" type="button" data-add-row="steps">Adaugă pas</button>
              </div>
              <div id="builderSteps" class="builder-list" data-list="steps"></div>
            </section>

            <label class="field builder-wide">
              <span>Note / tips</span>
              <textarea id="builderNotes" rows="3" placeholder="Opțional: trucuri, variante, observații pentru tine."></textarea>
            </label>

            <label class="field builder-wide">
              <span>Cuvinte cheie / tag-uri</span>
              <input id="builderKeywords" type="text" placeholder="ex. rapid, pui, cină">
            </label>

            <section class="builder-list-section" aria-labelledby="builderTagsTitle">
              <div class="builder-list-head">
                <div>
                  <h3 id="builderTagsTitle">Etichete / Caracteristici</h3>
                  <p class="builder-note">Alege doar etichetele care descriu corect rețeta. Etichetele ajută la căutare, filtrare și recomandări.</p>
                </div>
              </div>
              <div id="builderTags" class="builder-tags"></div>
            </section>

            <details class="builder-list-section builder-advanced">
              <summary>Date evaluări publice / agregate</summary>
              <p class="builder-note">Completează aceste valori doar dacă ai date reale. Nu sunt generate automat de site-ul static.</p>
              <div class="builder-form-grid">
                <label class="field">
                  <span>Evaluare generală medie</span>
                  <input id="builderOverallAverage" type="number" min="1" max="5" step="0.1" placeholder="ex. 4.6">
                </label>
                <label class="field">
                  <span>Gust mediu</span>
                  <input id="builderTasteAverage" type="number" min="1" max="5" step="0.1" placeholder="ex. 4.7">
                </label>
                <label class="field">
                  <span>Claritate medie</span>
                  <input id="builderClarityAverage" type="number" min="1" max="5" step="0.1" placeholder="ex. 4.5">
                </label>
                <label class="field">
                  <span>Complexitate medie</span>
                  <input id="builderComplexityAverage" type="number" min="1" max="5" step="0.1" placeholder="ex. 2.3">
                </label>
                <label class="field">
                  <span>Aș găti din nou (%)</span>
                  <input id="builderCookAgainPercent" type="number" min="0" max="100" step="1" placeholder="ex. 91">
                </label>
                <label class="field">
                  <span>Număr evaluări</span>
                  <input id="builderTotalRatings" type="number" min="0" step="1" placeholder="ex. 24">
                </label>
              </div>
            </details>

            <div class="builder-actions">
              <button class="btn" type="button" id="copyRecipeExport">Copiază datele rețetei</button>
              <button class="btn secondary" type="button" id="downloadRecipeJson">Descarcă JSON</button>
              <button class="btn secondary" type="button" id="saveRecipeDraft">Salvează ciornă local</button>
              <button class="btn secondary" type="button" id="loadRecipeDraft">Încarcă ciornă</button>
              <button class="btn secondary" type="button" id="resetRecipeBuilder">Resetează formularul</button>
            </div>
          </form>

          <aside class="builder-sidebar">
            <section class="builder-card">
              <p class="eyebrow">Previzualizare</p>
              <div id="recipeBuilderPreview" class="builder-preview"></div>
            </section>

            <section class="builder-card">
              <p class="eyebrow">Export</p>
              <h2>Date pentru proiect</h2>
              <p class="builder-note">Copiază blocul de mai jos și adaugă-l în <strong>LOCAL_FALLBACK_RECIPES</strong> din <strong>build-static-site.mjs</strong>. Apoi rulează <strong>node build-static-site.mjs</strong> ca să generezi pagina rețetei.</p>
              <textarea id="recipeExportOutput" class="export-area" rows="14" readonly></textarea>
              <label class="field import-field">
                <span>Importă JSON exportat</span>
                <input id="importRecipeJson" type="file" accept="application/json">
              </label>
              <p id="builderStatus" class="builder-status" aria-live="polite"></p>
            </section>
          </aside>
        </div>
      </main>`,
  });
}

function soonPage(section) {
  const lines = section.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n          ');
  return page({
    title: 'SOON TO COME...',
    description: 'Noi rețete apar periodic pe site.',
    root: '../',
    main: `
      <main class="section" id="main-content">
        <div class="soon-card">
          ${lines}
          <a class="btn" href="../randomizer/">Alege o rețetă aleatorie</a>
        </div>
      </main>`,
  });
}

function offlinePage() {
  return page({
    title: 'Offline',
    description: 'Mesaj offline pentru Arta Gătitului.',
    main: `
      <main class="section" id="main-content">
        <div class="soon-card">
          <p class="eyebrow">Offline</p>
          <h1>Ești offline</h1>
          <p>Unele pagini și rețete deja vizitate pot fi disponibile în continuare. Conectează-te la internet pentru cele mai noi rețete și pentru actualizări.</p>
          <div class="hero-actions">
            <a class="btn" href="index.html">Înapoi acasă</a>
            <a class="btn secondary" href="cauta.html">Caută în rețete</a>
          </div>
        </div>
      </main>`,
  });
}

function cssFile() {
  return `:root {
  --color-bg: #0f1117;
  --color-bg-soft: #151924;
  --color-surface: #181d29;
  --color-surface-alt: #202638;
  --color-text: #fff3e8;
  --color-text-muted: #d4bba8;
  --color-primary: #ff8a5b;
  --color-primary-hover: #ffb088;
  --color-primary-soft: rgba(255, 138, 91, .16);
  --color-secondary: #62d6a8;
  --color-secondary-hover: #8ff0c8;
  --color-border: rgba(255, 214, 186, .18);
  --color-focus: rgba(255, 138, 91, .58);
  --color-focus-soft: rgba(255, 138, 91, .22);
  --shadow-card: 0 22px 60px rgba(0, 0, 0, .42);
  --shadow-soft: 0 14px 38px rgba(0, 0, 0, .28);
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 8px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --container: 1180px;
}

:root[data-theme="cream"] {
  --color-bg: #18120f;
  --color-bg-soft: #211812;
  --color-surface: rgba(43, 31, 24, .94);
  --color-surface-alt: rgba(55, 40, 30, .94);
  --color-text: #fff7ee;
  --color-text-muted: #e8c8ad;
  --color-primary: #ff9a62;
  --color-primary-hover: #ffc09a;
  --color-primary-soft: rgba(255, 154, 98, .18);
  --color-secondary: #8be4b8;
  --color-secondary-hover: #b6f5d4;
  --color-border: rgba(255, 226, 202, .24);
  --color-focus: rgba(255, 192, 154, .72);
  --color-focus-soft: rgba(255, 192, 154, .24);
}

:root[data-theme="contrast"] {
  --color-bg: #050507;
  --color-bg-soft: #0c0c10;
  --color-surface: #101015;
  --color-surface-alt: #15151c;
  --color-text: #ffffff;
  --color-text-muted: #f3e4d7;
  --color-primary: #ffd166;
  --color-primary-hover: #ffe7a3;
  --color-primary-soft: rgba(255, 209, 102, .2);
  --color-secondary: #7fffd4;
  --color-secondary-hover: #c7fff0;
  --color-border: rgba(255, 255, 255, .34);
  --color-focus: rgba(127, 255, 212, .9);
  --color-focus-soft: rgba(127, 255, 212, .24);
}

:root[data-theme="night"] {
  --color-bg: #090d14;
  --color-bg-soft: #101827;
  --color-surface: rgba(16, 24, 39, .94);
  --color-surface-alt: rgba(24, 34, 52, .94);
  --color-text: #f4f7ff;
  --color-text-muted: #c7d3e9;
  --color-primary: #8bd3ff;
  --color-primary-hover: #bfe8ff;
  --color-primary-soft: rgba(139, 211, 255, .17);
  --color-secondary: #ffc078;
  --color-secondary-hover: #ffe0b6;
  --color-border: rgba(204, 222, 255, .2);
  --color-focus: rgba(139, 211, 255, .7);
  --color-focus-soft: rgba(139, 211, 255, .24);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  color-scheme: dark;
}

body {
  margin: 0;
  min-width: 320px;
  font-family: "Source Sans 3", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
  overflow-x: hidden;
  transition: background-color .24s ease, color .24s ease;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    linear-gradient(120deg, rgba(255, 138, 91, .13), transparent 36%, rgba(98, 214, 168, .1)),
    linear-gradient(180deg, rgba(15, 17, 23, .95), rgba(15, 17, 23, .995)),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, .025) 0, rgba(255, 255, 255, .025) 1px, transparent 1px, transparent 58px);
  background-size: 180% 180%, auto, auto;
  animation: ambientShift 18s ease-in-out infinite alternate;
}

body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 80;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255, 138, 91, .2), rgba(98, 214, 168, .08)),
    rgba(15, 17, 23, .46);
  opacity: 0;
  transform: translateY(100%);
  transition: opacity .28s ease, transform .34s cubic-bezier(.2, .7, .2, 1);
  backdrop-filter: blur(8px);
}

@keyframes ambientShift {
  from {
    background-position: 0% 0%, 0 0, 0 0;
  }

  to {
    background-position: 100% 18%, 0 0, 24px 0;
  }
}

@keyframes softReveal {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes subtlePulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: none;
  }

  50% {
    transform: scale(1.015);
    box-shadow: 0 0 0 8px var(--color-focus-soft);
  }
}

@keyframes slideFade {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes timerPulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 138, 91, .16);
  }

  50% {
    box-shadow: 0 0 0 10px rgba(255, 138, 91, 0);
  }
}

@keyframes pageEnter {
  from {
    opacity: 0;
    filter: blur(4px);
    transform: translateY(14px) scale(.985);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scale(1);
  }
}

a {
  color: var(--color-primary);
}

img,
svg {
  display: block;
  max-width: 100%;
}

img {
  height: auto;
}

[hidden] {
  display: none !important;
}

main,
section,
article,
aside,
footer,
header,
.nav-wrap,
.grid,
.card,
.category-card,
.recipe-detail-card,
.search-panel,
.randomizer-panel,
.builder-card,
.steak-calculator,
.ingredient-panel,
.ingredient-results,
.box {
  min-width: 0;
}

main {
  animation: pageEnter .34s cubic-bezier(.2, .7, .2, 1) both;
}

main,
.site-header,
.footer {
  transition: opacity .28s ease, transform .28s ease, filter .28s ease;
}

body.page-leaving main,
body.page-leaving .site-header,
body.page-leaving .footer {
  opacity: 0;
  filter: blur(5px);
  transform: translateY(12px) scale(.985);
}

body.page-leaving::after {
  opacity: 1;
  transform: translateY(0);
}

h1,
h2,
h3 {
  margin: 0;
  font-family: Cinzel, Georgia, serif;
  font-weight: 700;
  line-height: 1.14;
  letter-spacing: 0;
  color: var(--color-text);
}

h1 {
  font-size: 3.6rem;
}

h2 {
  font-size: 2rem;
}

h3 {
  font-size: 1.24rem;
}

p {
  margin: 0;
}

:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

::selection {
  color: #fff;
  background: var(--color-primary);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.skip-link {
  position: fixed;
  top: var(--space-3);
  left: var(--space-3);
  z-index: 100;
  transform: translateY(-160%);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #1a100c;
  text-decoration: none;
  font-weight: 800;
}

.skip-link:focus {
  transform: translateY(0);
}

.install-toast {
  position: fixed;
  right: var(--space-4);
  bottom: var(--space-4);
  z-index: 70;
  width: min(420px, calc(100vw - 32px));
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(24, 29, 41, .98);
  box-shadow: var(--shadow-card);
  animation: slideFade .24s ease both;
}

.install-toast p {
  color: var(--color-text-muted);
  font-weight: 800;
}

.install-toast .install-help {
  margin-top: var(--space-2);
  color: var(--color-text);
  font-weight: 700;
}

.install-toast div {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--color-border);
  background: rgba(15, 17, 23, .86);
  box-shadow: 0 12px 34px rgba(0, 0, 0, .18);
  backdrop-filter: blur(14px);
}

.nav-wrap {
  width: min(1360px, 100%);
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  position: relative;
}

.logo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  color: var(--color-text);
  text-decoration: none;
  font-family: Cinzel, Georgia, serif;
  font-size: 1.05rem;
  font-weight: 700;
  white-space: nowrap;
}

.logo span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logo-mark {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #1a100c;
  font-family: "Source Sans 3", system-ui, sans-serif;
  font-size: .82rem;
  font-weight: 900;
}

.nav-primary {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  overflow-x: visible;
}

.nav-tools {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.nav-tool {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 40px;
  min-width: 40px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, .045);
  color: var(--color-text);
  font: inherit;
  font-weight: 900;
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, color .18s ease, transform .18s ease, box-shadow .18s ease;
}

.nav-tool span:first-child {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
  font-size: .76rem;
}

.nav-tool::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120px circle at var(--mx, 50%) var(--my, 50%), rgba(255, 255, 255, .14), transparent 52%);
  opacity: 0;
  transition: opacity .18s ease;
}

.nav-tool:hover,
.nav-tool[aria-expanded="true"] {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
  box-shadow: 0 10px 24px rgba(0, 0, 0, .18);
}

.nav-tool:hover::before {
  opacity: 1;
}

.nav-primary a,
.nav-links a {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: .96rem;
  font-weight: 800;
  white-space: nowrap;
  transition: background-color .16s ease, color .16s ease, transform .16s ease;
}

.nav-links a:hover,
.nav-links a.active,
.nav-primary a:hover,
.nav-primary a.active {
  color: var(--color-primary-hover);
  background: var(--color-primary-soft);
}

.nav-links a.active,
.nav-primary a.active {
  box-shadow: inset 0 -3px 0 var(--color-primary);
}

.nav-links a:hover,
.nav-primary a:hover {
  transform: translateY(-1px);
}

.nav-links {
  display: none;
  position: absolute;
  top: calc(100% + var(--space-2));
  right: var(--space-4);
  z-index: 30;
  width: min(300px, calc(100vw - 32px));
  max-height: calc(100vh - 92px);
  overflow: auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(24, 29, 41, .98);
  box-shadow: var(--shadow-card);
  flex-direction: column;
  align-items: stretch;
}

.nav-links.open {
  display: flex;
}

.mobile-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin-left: 0;
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  padding: var(--space-2) var(--space-4);
  font: inherit;
  font-weight: 900;
  cursor: pointer;
  transition: background-color .16s ease, border-color .16s ease, color .16s ease, transform .16s ease;
}

.mobile-menu-btn:hover,
.mobile-menu-btn[aria-expanded="true"] {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
}

.mobile-menu-btn:active {
  transform: translateY(1px);
}

.hero {
  position: relative;
  min-height: 500px;
  display: flex;
  align-items: center;
  color: #fff;
  background-image: linear-gradient(90deg, rgba(15, 17, 23, .92), rgba(15, 17, 23, .54)), url('${HERO_IMAGE}');
  background-size: cover;
  background-position: center;
  overflow: hidden;
  isolation: isolate;
}

.hero::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    linear-gradient(104deg, transparent 12%, rgba(255, 255, 255, .08) 18%, transparent 26%),
    linear-gradient(118deg, transparent 54%, rgba(98, 214, 168, .08) 61%, transparent 70%),
    linear-gradient(82deg, transparent 70%, rgba(255, 138, 91, .1) 78%, transparent 86%);
  opacity: .65;
  transform: translateX(-6%);
  animation: steamDrift 12s ease-in-out infinite alternate;
}

@keyframes steamDrift {
  from {
    opacity: .36;
    transform: translateX(-8%) translateY(8px);
  }

  to {
    opacity: .76;
    transform: translateX(5%) translateY(-8px);
  }
}

.hero-inner {
  position: relative;
  width: min(var(--container), 100%);
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
}

.hero h1 {
  max-width: 760px;
  color: #fff;
  font-size: 4.7rem;
}

.lead {
  max-width: 670px;
  margin-top: var(--space-4);
  color: var(--color-text-muted);
  font-size: 1.14rem;
}

.hero .lead {
  color: rgba(255, 255, 255, .93);
  font-size: 1.24rem;
}

.eyebrow {
  margin-bottom: var(--space-2);
  color: var(--color-primary);
  text-transform: uppercase;
  font-size: .82rem;
  font-weight: 900;
  letter-spacing: 0;
}

.hero .eyebrow {
  color: #ffd7b7;
}

.hero-search {
  width: min(720px, 100%);
  margin-top: var(--space-6);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(24, 29, 41, .72);
  box-shadow: 0 18px 46px rgba(0, 0, 0, .24);
  transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease, transform .2s ease;
}

.hero-search:focus-within {
  border-color: rgba(255, 138, 91, .52);
  background: rgba(24, 29, 41, .86);
  box-shadow: 0 22px 54px rgba(0, 0, 0, .34), 0 0 0 4px var(--color-focus-soft);
  transform: translateY(-1px);
}

.hero-search input {
  min-height: 54px;
  border-color: transparent;
  box-shadow: none;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  max-width: 720px;
  margin-top: var(--space-4);
}

.hero-chips a {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: var(--space-1) var(--space-3);
  border: 1px solid rgba(255, 255, 255, .2);
  border-radius: 999px;
  background: rgba(255, 255, 255, .09);
  color: #fff;
  text-decoration: none;
  font-weight: 900;
  transition: border-color .18s ease, background-color .18s ease, transform .18s ease;
}

.hero-chips a:hover,
.hero-chips a:focus-visible {
  border-color: rgba(255, 255, 255, .42);
  background: rgba(255, 255, 255, .16);
  transform: translateY(-2px);
}

.btn {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 11px var(--space-4);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #1a100c;
  text-decoration: none;
  font: inherit;
  font-weight: 900;
  line-height: 1.2;
  cursor: pointer;
  transition: background-color .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease;
}

.btn::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(160px circle at var(--mx, 50%) var(--my, 50%), rgba(255, 255, 255, .26), transparent 52%);
  opacity: 0;
  transition: opacity .18s ease;
}

.btn > * {
  position: relative;
  z-index: 1;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: .64;
}

.btn:hover {
  border-color: var(--color-primary-hover);
  background: var(--color-primary-hover);
  color: #1a100c;
  box-shadow: 0 10px 24px rgba(0, 0, 0, .2);
}

.btn:hover::before {
  opacity: 1;
}

.btn:active {
  transform: translateY(1px) scale(.985);
}

.btn.light {
  border-color: rgba(255, 255, 255, .32);
  background: rgba(255, 255, 255, .12);
  color: #fff;
}

.btn.ghost {
  border-color: rgba(255, 255, 255, .72);
  background: transparent;
  color: #fff;
}

.btn.ghost:hover {
  border-color: #fff;
  background: rgba(255, 255, 255, .14);
}

.btn.secondary {
  border-color: var(--color-border);
  background: var(--color-surface);
  color: var(--color-primary-hover);
}

.btn.secondary:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.text-link {
  color: var(--color-primary);
  font-weight: 900;
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}

.section {
  width: min(var(--container), 100%);
  margin: 0 auto;
  padding: var(--space-7) var(--space-4);
}

.section.compact {
  padding-top: var(--space-6);
}

.subsection {
  margin-top: var(--space-7);
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: var(--space-5);
  margin-bottom: var(--space-5);
}

.page-title {
  max-width: 820px;
  margin-bottom: var(--space-6);
  overflow-wrap: anywhere;
}

.page-title p:not(.eyebrow),
#categoryDescription {
  margin-top: var(--space-3);
  color: var(--color-text-muted);
  font-size: 1.14rem;
}

.grid {
  display: grid;
  gap: var(--space-4);
}

.grid.cards {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.grid.categories {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.card,
.category-card,
.recipe-detail-card,
.search-panel,
.randomizer-panel,
.soon-card,
.builder-card,
.ingredient-panel,
.box,
.steak-calculator {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(10px);
}

.card {
  position: relative;
  --tilt-x: 0deg;
  --tilt-y: 0deg;
  min-height: 100%;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  color: var(--color-text);
  text-decoration: none;
  overflow-wrap: anywhere;
  animation: softReveal .42s ease both;
  transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease, background-color .22s ease;
  will-change: transform;
}

.card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(320px circle at var(--mx, 20%) var(--my, 0%), rgba(255, 255, 255, .12), transparent 42%),
    linear-gradient(135deg, rgba(255, 138, 91, .18), transparent 38%, rgba(98, 214, 168, .12));
  opacity: .72;
}

.card::after {
  content: "";
  position: absolute;
  inset: -40% -80%;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 38%, rgba(255, 255, 255, .12), transparent 62%);
  transform: translateX(-28%);
  opacity: 0;
  transition: transform .45s ease, opacity .2s ease;
}

.card > * {
  position: relative;
  z-index: 1;
}

.card h3 {
  margin-top: var(--space-3);
}

.card p {
  margin: var(--space-3) 0 var(--space-4);
  color: var(--color-text-muted);
}

.category-pill,
.pill {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
  font-size: .86rem;
  font-weight: 900;
  transition: background-color .16s ease, color .16s ease, transform .16s ease;
}

.ingredients-preview {
  margin-bottom: var(--space-5);
  color: var(--color-text-muted);
  font-size: .98rem;
}

.card-tags,
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.card-tags {
  margin-top: var(--space-3);
}

.tag-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: var(--space-1) var(--space-3);
  border: 1px solid rgba(98, 214, 168, .26);
  border-radius: 999px;
  background: rgba(98, 214, 168, .1);
  color: var(--color-secondary-hover);
  font-size: .94rem;
  font-weight: 900;
  text-decoration: none;
  transition: border-color .18s ease, background-color .18s ease, color .18s ease, transform .18s ease, box-shadow .18s ease;
}

.tag-chip:hover,
.tag-chip:focus-visible,
.ingredient-chip:hover,
.match-chip:hover {
  border-color: var(--color-secondary);
  background: rgba(98, 214, 168, .16);
  color: var(--color-secondary-hover);
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, .16);
}

.tag-chip.small {
  min-height: 26px;
  padding: 2px var(--space-2);
  font-size: .8rem;
}

.recipe-card {
  cursor: pointer;
}

.recipe-card .ingredients-preview {
  margin-top: auto;
}

.category-card {
  position: relative;
  --tilt-x: 0deg;
  --tilt-y: 0deg;
  min-height: 158px;
  padding: var(--space-5);
  color: var(--color-text);
  text-decoration: none;
  overflow: hidden;
  overflow-wrap: anywhere;
  animation: softReveal .42s ease both;
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease, background-color .2s ease;
  will-change: transform;
}

.category-card::after {
  content: "";
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-4);
  width: 46px;
  height: 5px;
  border-radius: 999px;
  background: var(--color-primary);
}

.category-card::before {
  content: attr(data-icon);
  position: absolute;
  right: var(--space-4);
  top: var(--space-4);
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 214, 186, .14);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, .055);
  color: var(--color-primary-hover);
  font-family: "Source Sans 3", system-ui, sans-serif;
  font-weight: 900;
}

.category-card:nth-child(2n)::after {
  background: var(--color-secondary);
}

.category-card:nth-child(3n)::after {
  background: #b97818;
}

.category-card strong {
  display: block;
  max-width: calc(100% - 58px);
  margin-bottom: var(--space-2);
  font-family: Cinzel, Georgia, serif;
  font-size: 1.16rem;
}

.category-card span {
  color: var(--color-text-muted);
  font-size: .98rem;
}

.category-card:hover,
.category-card:focus-visible,
.card:hover,
.card:focus-visible {
  box-shadow: var(--shadow-card);
  transform: translateY(-4px);
  border-color: rgba(255, 138, 91, .42);
}

.card:hover::after,
.card:focus-visible::after {
  transform: translateX(28%);
  opacity: 1;
}

.card:active,
.category-card:active {
  transform: translateY(-1px) scale(.995);
}

.search-panel {
  margin-bottom: var(--space-5);
  padding: var(--space-5);
  background: var(--color-surface);
  animation: softReveal .42s ease both;
}

.ingredient-panel {
  margin-bottom: var(--space-5);
  padding: var(--space-5);
  background: var(--color-surface);
  animation: softReveal .42s ease both;
}

.search-panel-head {
  max-width: 720px;
  margin-bottom: var(--space-5);
}

.search-panel-head h2 {
  font-size: 1.55rem;
}

.search-panel-head p {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: var(--space-4);
  align-items: end;
}

.ingredient-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: end;
}

.ingredient-field textarea {
  min-height: 128px;
  resize: vertical;
}

.ingredient-actions {
  display: grid;
  gap: var(--space-2);
  min-width: 190px;
}

.ingredient-chips,
.match-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.ingredient-chips {
  margin-top: var(--space-4);
}

.ingredient-chip,
.match-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, .045);
  color: var(--color-text);
  font-size: .94rem;
  font-weight: 900;
  transition: border-color .18s ease, background-color .18s ease, color .18s ease, transform .18s ease, box-shadow .18s ease;
}

.ingredient-note {
  margin-top: var(--space-4);
}

.ingredient-results {
  display: grid;
  gap: var(--space-6);
}

.match-section h2 {
  margin-bottom: var(--space-4);
  font-size: 1.55rem;
}

.match-card {
  gap: var(--space-3);
}

.match-card p {
  margin-bottom: 0;
}

.match-card-head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: start;
}

.match-badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: rgba(98, 214, 168, .16);
  color: var(--color-secondary-hover);
  font-size: .82rem;
  font-weight: 900;
  text-align: center;
}

.match-meter {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, .08);
}

.match-meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
}

.match-detail {
  color: var(--color-text-muted);
  font-size: .96rem;
}

.match-detail strong {
  display: block;
  margin-bottom: var(--space-1);
  color: var(--color-text);
}

.match-chip.missing {
  border-color: rgba(255, 138, 91, .35);
  color: var(--color-primary-hover);
  background: rgba(255, 138, 91, .1);
}

.field {
  display: grid;
  gap: var(--space-2);
  color: var(--color-text);
  font-weight: 900;
}

input,
select,
textarea {
  width: 100%;
  min-height: 50px;
  border: 2px solid rgba(255, 214, 186, .28);
  border-radius: var(--radius-sm);
  background: #111620;
  color: var(--color-text);
  padding: 12px 14px;
  font: inherit;
  outline: none;
  transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
}

input::placeholder {
  color: #b99f8f;
  opacity: 1;
}

input:hover,
select:hover,
textarea:hover {
  border-color: var(--color-primary);
}

input:focus,
select:focus,
textarea:focus {
  outline: none;
  border-color: var(--color-primary-hover);
  box-shadow: 0 0 0 3px var(--color-focus-soft);
}

.count {
  margin: var(--space-4) 0 var(--space-5);
  color: var(--color-primary-hover);
  font-weight: 900;
}

.empty {
  position: relative;
  overflow: hidden;
  padding: var(--space-5);
  border: 2px dashed rgba(255, 214, 186, .32);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text-muted);
  text-align: center;
  animation: slideFade .24s ease both;
}

.empty::before {
  content: "";
  display: block;
  width: 42px;
  height: 42px;
  margin: 0 auto var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background:
    linear-gradient(135deg, var(--color-primary-soft), transparent),
    rgba(255, 255, 255, .04);
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.recipe-detail-card {
  padding: var(--space-6);
  overflow-wrap: anywhere;
}

.recipe-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-5);
  align-items: start;
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.recipe-hero h1 {
  margin-top: var(--space-3);
  font-size: 3rem;
}

.recipe-hero .lead {
  color: var(--color-text-muted);
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: var(--space-3);
}

.recipe-layout {
  display: grid;
  grid-template-columns: .85fr 1.15fr;
  gap: var(--space-5);
  margin-top: var(--space-5);
}

.recipe-timeline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.recipe-timeline div {
  position: relative;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, .045);
}

.recipe-timeline span {
  display: block;
  color: var(--color-text-muted);
  font-weight: 800;
}

.recipe-timeline strong {
  display: block;
  color: var(--color-text);
  font-size: 1.12rem;
}

.before-start,
.recipe-tags,
.recipe-rating {
  margin-top: var(--space-5);
}

.before-start > p,
.rating-note {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
}

.before-list {
  display: grid;
  gap: var(--space-3);
  margin: var(--space-4) 0 0;
  padding: 0;
  list-style: none;
}

.before-list label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-3);
  align-items: start;
  padding: var(--space-3);
  border: 1px solid rgba(255, 214, 186, .16);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, .04);
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, transform .18s ease;
}

.before-list label.is-checked {
  border-color: rgba(98, 214, 168, .35);
  background: rgba(98, 214, 168, .08);
}

.before-list input {
  width: 22px;
  min-height: 22px;
  margin-top: 3px;
  accent-color: var(--color-primary);
}

.before-list input:checked + span {
  color: var(--color-text-muted);
  text-decoration: line-through;
}

.tag-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-4);
}

.tag-group {
  display: grid;
  gap: var(--space-2);
}

.tag-group h3 {
  font-family: "Source Sans 3", system-ui, sans-serif;
  color: var(--color-primary-hover);
  font-size: .96rem;
  text-transform: uppercase;
}

.recipe-rating h3 {
  margin-top: var(--space-5);
  font-family: "Source Sans 3", system-ui, sans-serif;
  font-size: 1.1rem;
}

.rating-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.rating-summary-grid div,
.rating-group {
  padding: var(--space-3);
  border: 1px solid rgba(255, 214, 186, .16);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, .04);
}

.rating-summary-grid span {
  display: block;
  color: var(--color-text-muted);
  font-weight: 800;
}

.rating-summary-grid strong {
  display: block;
  color: var(--color-text);
  font-size: 1.18rem;
}

.rating-form {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-5);
}

.rating-group {
  margin: 0;
}

.rating-group legend {
  padding: 0 var(--space-1);
  color: var(--color-text);
  font-weight: 900;
}

.rating-group p {
  margin: var(--space-2) 0;
  color: var(--color-text-muted);
}

.rating-options,
.choice-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.rating-options label,
.choice-row label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  cursor: pointer;
}

.rating-options input,
.choice-row input {
  position: absolute;
  width: 1px;
  min-height: 1px;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
}

.rating-options span:not(.sr-only),
.choice-row span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: #111620;
  color: var(--color-text-muted);
  font-weight: 900;
}

.rating-options input:checked + span,
.choice-row input:checked + span {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
}

.rating-options input:focus-visible + span,
.choice-row input:focus-visible + span {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

.rating-personal {
  color: var(--color-secondary-hover);
  font-weight: 900;
}

.rating-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.box {
  padding: var(--space-5);
  background: var(--color-surface-alt);
  box-shadow: none;
}

.box h2 {
  font-size: 1.5rem;
}

ul.clean,
ol.clean {
  margin: var(--space-4) 0 0;
  padding-left: 22px;
}

ul.clean li,
ol.clean li {
  margin: var(--space-2) 0;
}

.subhead {
  list-style: none;
  margin-left: -22px;
  color: var(--color-primary-hover);
  font-weight: 900;
}

.closing {
  margin-top: var(--space-5);
  color: var(--color-primary-hover);
  font-weight: 900;
}

.related {
  margin-top: var(--space-6);
}

.related h2 {
  margin-bottom: var(--space-4);
}

.randomizer-panel,
.soon-card {
  padding: var(--space-5);
}

.randomizer-panel {
  position: relative;
  overflow: hidden;
  animation: softReveal .42s ease both;
}

.randomizer-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255, 138, 91, .12), transparent 44%),
    linear-gradient(315deg, rgba(98, 214, 168, .1), transparent 38%);
  opacity: .9;
}

.randomizer-panel > * {
  position: relative;
}

.random-result {
  margin-top: var(--space-5);
}

.random-result.is-refreshing,
#searchResults.is-refreshing,
#ingredientMatchResults.is-refreshing {
  animation: softReveal .28s ease both;
}

.meal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--space-4);
  align-items: stretch;
}

.meal-slot {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: var(--space-3);
  min-width: 0;
}

.meal-slot-title {
  color: var(--color-primary-hover);
  font-family: "Source Sans 3", system-ui, sans-serif;
  font-size: .92rem;
  font-weight: 900;
  text-transform: uppercase;
}

.meal-empty {
  min-height: 100%;
  text-align: left;
}

.meal-slot .recipe-card,
.meal-empty {
  min-height: 336px;
}

.meal-slot .recipe-card {
  height: 100%;
}

.meal-slot .recipe-card h3,
.meal-slot .recipe-card p,
.meal-slot .ingredients-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meal-slot .recipe-card h3 {
  min-height: 2.8em;
  -webkit-line-clamp: 2;
}

.meal-slot .recipe-card p {
  min-height: 4.8em;
  -webkit-line-clamp: 3;
}

.meal-slot .ingredients-preview {
  min-height: 4.75em;
  -webkit-line-clamp: 3;
}

.soon-card {
  max-width: 760px;
}

.soon-card p {
  margin: var(--space-2) 0;
  color: var(--color-text-muted);
}

.soon-card .btn {
  margin-top: var(--space-4);
}

.builder-help {
  margin-bottom: var(--space-5);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(24, 29, 41, .7);
}

.builder-help h2,
.builder-guide-card h3 {
  font-size: 1.45rem;
}

.builder-help p {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
}

.builder-help code {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, .07);
  color: var(--color-primary-hover);
  font-size: .92em;
}

.builder-help-intro {
  max-width: 860px;
  margin-bottom: var(--space-5);
}

.builder-guide-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.builder-guide-card {
  padding: var(--space-4);
  border: 1px solid rgba(255, 214, 186, .14);
  border-radius: var(--radius-lg);
  background: rgba(15, 17, 23, .42);
}

.builder-guide-card .clean {
  margin-top: var(--space-3);
}

.builder-callout {
  margin-top: var(--space-5);
  padding: var(--space-4);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: rgba(255, 138, 91, .1);
  color: var(--color-text);
}

.builder-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(320px, .92fr);
  gap: var(--space-5);
  align-items: start;
}

.builder-sidebar {
  position: sticky;
  top: 110px;
  display: grid;
  gap: var(--space-5);
}

.builder-card {
  padding: var(--space-5);
}

.builder-card h2 {
  font-size: 1.45rem;
}

.compact-head {
  margin-bottom: var(--space-4);
}

.builder-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.builder-wide,
.builder-list-section {
  margin-top: var(--space-5);
}

.builder-list-head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: center;
  margin-bottom: var(--space-3);
}

.builder-list-head h3 {
  font-size: 1.16rem;
}

.builder-list {
  display: grid;
  gap: var(--space-3);
}

.builder-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: start;
}

.builder-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.builder-tags {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.builder-tag-group {
  padding: var(--space-4);
  border: 1px solid rgba(255, 214, 186, .14);
  border-radius: var(--radius-lg);
  background: rgba(15, 17, 23, .42);
}

.builder-tag-group h4 {
  margin: 0 0 var(--space-3);
  color: var(--color-primary-hover);
  font-size: 1rem;
}

.builder-tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.builder-tag-options label {
  cursor: pointer;
}

.builder-tag-options input {
  position: absolute;
  width: 1px;
  min-height: 1px;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
}

.builder-tag-options span {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, .04);
  color: var(--color-text-muted);
  font-weight: 900;
}

.builder-tag-options input:checked + span {
  border-color: var(--color-secondary);
  background: rgba(98, 214, 168, .12);
  color: var(--color-secondary-hover);
}

.builder-tag-options input:focus-visible + span {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

.builder-advanced {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, .035);
}

.builder-advanced summary {
  cursor: pointer;
  color: var(--color-primary-hover);
  font-weight: 900;
}

.mini-btn {
  min-height: 40px;
  min-width: 40px;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: #111620;
  color: var(--color-text);
  font: inherit;
  font-weight: 900;
  cursor: pointer;
}

.mini-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary-hover);
}

.builder-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.builder-actions .btn {
  flex: 1 1 190px;
}

.builder-validation {
  margin-bottom: var(--space-4);
  color: var(--color-primary-hover);
  font-weight: 800;
}

.field.is-invalid input,
.field.is-invalid select,
.field.is-invalid textarea {
  border-color: var(--color-primary-hover);
  box-shadow: 0 0 0 3px var(--color-focus-soft);
}

.builder-preview {
  margin-top: var(--space-4);
}

.builder-preview-card {
  padding: var(--space-5);
  background: var(--color-surface-alt);
  box-shadow: none;
}

.builder-preview-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  margin-bottom: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.builder-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-3) 0;
  color: var(--color-text-muted);
  font-weight: 800;
}

.builder-preview-section {
  margin-top: var(--space-5);
}

.builder-note,
.builder-status {
  margin-top: var(--space-3);
  color: var(--color-text-muted);
}

.export-area {
  min-height: 260px;
  margin-top: var(--space-4);
  resize: vertical;
  font-family: Consolas, "Liberation Mono", monospace;
  font-size: .9rem;
}

.import-field {
  margin-top: var(--space-4);
}

.steak-calculator {
  margin-top: var(--space-5);
  padding: var(--space-5);
  background: var(--color-surface-alt);
  box-shadow: none;
}

.steak-calculator > p {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
}

.steak-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-5);
}

.steak-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.steak-actions .btn {
  flex: 0 1 auto;
}

.steak-result {
  margin-top: var(--space-5);
  padding: var(--space-5);
  border: 1px solid rgba(255, 214, 186, .16);
  border-radius: var(--radius-lg);
  background: rgba(15, 17, 23, .52);
}

.steak-result-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.steak-metric {
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, .045);
}

.steak-metric span {
  display: block;
  color: var(--color-text-muted);
  font-size: .9rem;
  font-weight: 800;
}

.steak-metric strong {
  display: block;
  margin-top: var(--space-1);
  color: var(--color-text);
  font-size: 1.2rem;
}

.steak-note {
  margin-top: var(--space-4);
  color: var(--color-text-muted);
}

.steak-timer {
  display: grid;
  grid-template-columns: minmax(150px, auto) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: center;
  margin-top: var(--space-5);
}

.timer-display {
  padding: var(--space-3) var(--space-4);
  border: 1px solid rgba(255, 214, 186, .18);
  border-radius: var(--radius-md);
  background: #0f1117;
  color: var(--color-primary-hover);
  font-size: 2rem;
  font-weight: 900;
  text-align: center;
}

.timer-phase {
  color: var(--color-primary-hover);
  font-weight: 900;
}

.timer-status {
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-weight: 800;
  overflow-wrap: anywhere;
}

.steak-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.steak-chip {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.steak-chip strong {
  display: block;
}

.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 90;
  width: 100%;
  height: 3px;
  pointer-events: none;
  opacity: 0;
  background: transparent;
  transition: opacity .18s ease;
}

.scroll-progress.is-visible {
  opacity: 1;
}

.scroll-progress span {
  display: block;
  width: var(--progress, 0%);
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
  box-shadow: 0 0 18px var(--color-focus-soft);
}

.theme-panel {
  position: fixed;
  top: 74px;
  right: var(--space-4);
  z-index: 72;
  width: min(320px, calc(100vw - 32px));
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(24, 29, 41, .98);
  box-shadow: var(--shadow-card);
  animation: slideFade .2s ease both;
}

.theme-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.theme-options button {
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, .045);
  color: var(--color-text);
  font: inherit;
  font-weight: 900;
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, color .18s ease, transform .18s ease;
}

.theme-options button[aria-pressed="true"],
.theme-options button:hover,
.theme-options button:focus-visible {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
}

.command-palette {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: start center;
  padding: min(10vh, 72px) var(--space-4) var(--space-4);
}

body.command-open {
  overflow: hidden;
}

.command-backdrop {
  position: fixed;
  inset: 0;
  border: 0;
  background: rgba(5, 6, 10, .68);
  backdrop-filter: blur(10px);
  cursor: pointer;
}

.command-dialog {
  position: relative;
  width: min(720px, 100%);
  max-height: min(720px, calc(100vh - 40px));
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(24, 29, 41, .98);
  box-shadow: var(--shadow-card);
  animation: pageEnter .22s cubic-bezier(.2, .7, .2, 1) both;
}

.command-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.command-head h2 {
  font-size: 1.34rem;
}

.command-results {
  display: grid;
  gap: var(--space-2);
  max-height: min(56vh, 470px);
  overflow: auto;
  padding-right: 2px;
}

.command-section-title {
  margin-top: var(--space-2);
  color: var(--color-primary-hover);
  font-size: .78rem;
  font-weight: 900;
  text-transform: uppercase;
}

.command-item {
  width: 100%;
  min-height: 54px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, .045);
  color: var(--color-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, transform .18s ease;
}

.command-item:hover,
.command-item.is-active,
.command-item:focus-visible {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  transform: translateY(-1px);
}

.command-type {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, .07);
  color: var(--color-primary-hover);
  font-weight: 900;
}

.command-title {
  display: block;
  font-weight: 900;
}

.command-meta {
  display: block;
  color: var(--color-text-muted);
  font-size: .92rem;
}

.quick-actions {
  position: fixed;
  right: var(--space-4);
  bottom: calc(var(--space-4) + 74px);
  z-index: 68;
  display: grid;
  gap: var(--space-2);
}

.quick-action {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(24, 29, 41, .94);
  color: var(--color-text);
  text-decoration: none;
  font: inherit;
  font-weight: 900;
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, color .18s ease, transform .18s ease, opacity .18s ease;
}

.quick-action:hover,
.quick-action:focus-visible {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
  transform: translateY(-2px);
}

.quick-action.is-muted {
  opacity: .56;
}

.quick-action-status {
  position: absolute;
  right: 58px;
  bottom: 0;
  min-width: max-content;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-secondary-hover);
  font-weight: 900;
  box-shadow: var(--shadow-soft);
  animation: slideFade .18s ease both;
}

.offline-badge {
  position: fixed;
  left: var(--space-4);
  bottom: var(--space-4);
  z-index: 70;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-primary-hover);
  font-weight: 900;
  box-shadow: var(--shadow-soft);
}

.reveal-ready [data-reveal] {
  opacity: 0;
  transform: translateY(16px);
}

.reveal-ready [data-reveal].is-revealed {
  opacity: 1;
  transform: translateY(0);
  transition: opacity .46s ease, transform .46s cubic-bezier(.2, .7, .2, 1);
  transition-delay: calc(var(--stagger, 0) * 42ms);
}

.pulse-once {
  animation: subtlePulse .36s ease both;
}

.builder-status.is-success,
.rating-status-success {
  color: var(--color-secondary-hover);
  animation: slideFade .2s ease both;
}

.steak-timer.is-running .timer-display {
  animation: timerPulse 1.6s ease-in-out infinite;
  border-color: var(--color-primary);
}

.footer {
  margin-top: var(--space-6);
  padding: var(--space-6) var(--space-4);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  text-align: center;
}

.footer p + p {
  margin-top: var(--space-2);
}

.footer a {
  color: var(--color-primary-hover);
  font-weight: 900;
}

@media (hover: hover) and (pointer: fine) {
  .recipe-card.is-pointer-active,
  .category-card.is-pointer-active {
    transform: perspective(900px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y)) translateY(-5px);
  }

  .recipe-card.is-pointer-active,
  .category-card.is-pointer-active {
    border-color: rgba(255, 138, 91, .5);
    box-shadow: var(--shadow-card);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transform: none !important;
  }

  main {
    animation: none !important;
  }

  body::after {
    display: none;
  }

  .hero::before,
  .steak-timer.is-running .timer-display {
    animation: none !important;
  }

  body.page-leaving main,
  body.page-leaving .site-header,
  body.page-leaving .footer {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 1040px) {
  h1 {
    font-size: 3rem;
  }

  .hero h1 {
    font-size: 3.8rem;
  }

  .grid.cards,
  .grid.categories {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .recipe-layout,
  .recipe-hero,
  .search-row,
  .ingredient-form,
  .builder-layout,
  .builder-form-grid,
  .builder-guide-grid,
  .builder-tags,
  .steak-form,
  .steak-result-grid,
  .steak-timer,
  .steak-grid,
  .tag-groups,
  .rating-summary-grid {
    grid-template-columns: 1fr;
  }

  .builder-sidebar {
    position: static;
  }

  .detail-meta {
    justify-content: start;
  }
}

@media (max-width: 1280px) {
  .nav-wrap {
    padding: var(--space-3);
  }

  .mobile-menu-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .nav-links {
    display: none;
    position: absolute;
    top: 66px;
    left: var(--space-3);
    right: var(--space-3);
    max-height: calc(100vh - 86px);
    overflow: auto;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-card);
    flex-direction: column;
    align-items: stretch;
  }

  .nav-links.open {
    display: flex;
  }

  .nav-links a {
    min-height: 44px;
  }
}

@media (max-width: 760px) {
  h1 {
    font-size: 2.28rem;
  }

  h2 {
    font-size: 1.6rem;
  }

  h3 {
    font-size: 1.12rem;
  }

  .nav-wrap {
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .logo {
    flex: 1 1 auto;
  }

  .mobile-menu-btn {
    flex: 0 0 auto;
    padding: var(--space-2) var(--space-3);
  }

  .nav-primary {
    order: 3;
    width: 100%;
    margin-left: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-1);
  }

  .nav-primary a {
    justify-content: center;
    min-height: 44px;
    padding: var(--space-2);
    font-size: .9rem;
  }

  .nav-tools {
    flex: 0 0 auto;
  }

  .nav-tool span:last-child {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .nav-links {
    top: calc(100% + var(--space-2));
    left: var(--space-3);
    right: var(--space-3);
  }

  .hero {
    min-height: 420px;
  }

  .hero-inner {
    padding: var(--space-7) var(--space-4);
  }

  .hero h1 {
    font-size: 2.68rem;
  }

  .recipe-hero h1 {
    font-size: 2.18rem;
  }

  .hero-search {
    grid-template-columns: 1fr;
  }

  .hero-search .btn {
    width: 100%;
  }

  .grid.cards,
  .grid.categories {
    grid-template-columns: 1fr;
  }

  .section {
    padding: var(--space-6) var(--space-4);
  }

  .section-head {
    display: block;
  }

  .section-head .text-link {
    display: inline-flex;
    margin-top: var(--space-3);
  }

  .card,
  .category-card,
  .recipe-detail-card,
  .search-panel,
  .ingredient-panel,
  .randomizer-panel,
  .soon-card,
  .builder-card,
  .steak-calculator,
  .box {
    padding: var(--space-4);
  }

  .builder-list-head,
  .builder-row {
    grid-template-columns: 1fr;
  }

  .builder-list-head {
    display: grid;
  }

  .builder-list-head .btn,
  .builder-actions .btn {
    width: 100%;
  }

  .builder-row-actions {
    width: 100%;
  }

  .mini-btn {
    flex: 1 1 44px;
  }

  .detail-meta .btn,
  .ingredient-actions .btn,
  .rating-actions .btn,
  .steak-actions .btn {
    width: 100%;
  }

  .ingredient-actions {
    min-width: 0;
  }

  .match-card-head {
    display: grid;
  }

  .meal-slot .recipe-card,
  .meal-empty {
    min-height: 300px;
  }

  .timer-display {
    font-size: 1.72rem;
  }

  .install-toast {
    right: var(--space-3);
    bottom: var(--space-3);
    width: calc(100vw - 24px);
  }

  .theme-panel {
    top: 82px;
    right: var(--space-3);
    width: calc(100vw - 24px);
  }

  .command-palette {
    padding: 0;
    place-items: stretch;
  }

  .command-dialog {
    width: 100%;
    min-height: 100vh;
    max-height: 100vh;
    border-radius: 0;
    border-left: 0;
    border-right: 0;
  }

  .quick-actions {
    right: var(--space-3);
    bottom: var(--space-3);
    grid-template-columns: repeat(4, 44px);
  }

  .quick-action {
    width: 44px;
    height: 44px;
  }
}

@media (max-width: 430px) {
  .nav-wrap {
    padding: var(--space-3);
  }

  .logo {
    font-size: .96rem;
  }

  .logo-mark {
    width: 36px;
    height: 36px;
  }

  .nav-primary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .nav-tools {
    order: 2;
  }

  .nav-primary a {
    font-size: .92rem;
  }

  .section {
    padding-right: var(--space-3);
    padding-left: var(--space-3);
  }

  .hero-inner {
    padding-right: var(--space-3);
    padding-left: var(--space-3);
  }

  .hero-search {
    gap: var(--space-2);
  }

  .steak-result {
    padding: var(--space-4);
  }

  .quick-actions {
    grid-template-columns: repeat(3, 44px);
  }
}

@media (max-width: 380px) {
  body {
    font-size: .98rem;
  }

  h1,
  .hero h1 {
    font-size: 2.16rem;
  }

  .recipe-hero h1 {
    font-size: 2rem;
  }

  .logo span:last-child {
    max-width: 132px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (max-width: 350px) {
  .mobile-menu-btn span:last-child {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
`;
}

function jsFile() {
  return `(function () {
  const root = window.ARTA_ROOT || "";
  const data = window.ARTA_DATA || { categories: [], recipes: [], aliases: {} };
  const TAG_GROUPS = {
    taste: { label: "Gust", options: ["Dulce", "Sărat", "Picant", "Acrișor", "Cremos", "Crocant", "Aromat", "Fresh", "Ușor", "Sățios", "Condimentat", "Fin", "Rustic"] },
    complexity: { label: "Complexitate", options: ["Începător", "Ușor", "Complexitate medie", "Complexitate ridicată", "Necesită atenție", "Risc mic de greșeală", "Risc mediu de greșeală", "Risc ridicat de greșeală"] },
    time: { label: "Timp", options: ["Sub 15 minute", "Sub 30 minute", "Sub 60 minute", "Rețetă rapidă", "Necesită timp de așteptare", "Bună pentru pregătit din timp"] },
    context: { label: "Context", options: ["Mic dejun", "Prânz", "Cină", "Gustare", "Pentru familie", "Pentru musafiri", "Pentru weekend", "Pentru zile aglomerate", "Comfort food"] },
    diet: { label: "Dietă", options: ["Cu carne", "Fără carne", "Vegetarian", "Fără lactate", "Fără ou", "Fără gluten", "Ușor de adaptat"] },
    equipment: { label: "Echipament", options: ["Fără cuptor", "Necesită cuptor", "La tigaie", "La oală", "Necesită blender", "Necesită mixer", "Necesită tavă", "Necesită termometru"] },
    technique: { label: "Tehnică", options: ["Fierbere", "Coacere", "Prăjire", "Sotare", "Marinare", "Frământare", "La tigaie", "La cuptor", "Fără gătire"] }
  };
  const TAG_CARD_PRIORITY = ["complexity", "time", "context", "equipment", "technique", "taste", "diet"];
  const THEME_KEY = "arta-gatitului-theme";
  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let revealObserver = null;

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function recipeUrl(slug) {
    return root + "retete/" + slug + "/";
  }

  function categoryUrl(slug) {
    return root + slug + "/";
  }

  function searchUrl(query) {
    return root + "cauta.html?q=" + encodeURIComponent(query);
  }

  function categorySlug(name) {
    const category = data.categories.find((item) => item.name === name);
    return category ? category.slug : normalize(name).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function categoryIcon(name) {
    const key = normalize(name).replace(/[^a-z0-9]+/g, "-");
    const icons = {
      "mic-dejun": "MD",
      "fel-principal": "FP",
      "fel-secundar": "FS",
      desert: "DS",
      bauturi: "BT",
      salate: "SL",
      rontaieli: "RN"
    };
    return icons[key] || (String(name || "").trim().slice(0, 2).toUpperCase() || "AG");
  }

  function recipeBySlug(slug) {
    const resolved = data.aliases && data.aliases[slug] ? data.aliases[slug] : slug;
    return data.recipes.find((recipe) => recipe.slug === resolved);
  }

  function isSubheading(line) {
    return /:$/.test(line) || /^[A-ZĂÂÎȘȚ0-9\\s/-]{3,}$/.test(line);
  }

  function tokenizeText(value) {
    return normalize(value).match(/[a-z0-9]+/g) || [];
  }

  const IGNORED_INGREDIENT_TOKENS = new Set([
    "g", "gr", "kg", "ml", "l", "litru", "litri", "lingura", "linguri", "lingurita", "lingurite",
    "buc", "bucata", "bucati", "felie", "felii", "cana", "cani", "pachet", "pachete",
    "dupa", "gust", "aproximativ", "optional", "proaspat", "proaspata", "proaspete",
    "de", "din", "cu", "si", "sau", "la", "pentru", "cat", "cate", "putin", "putina"
  ]);

  const INGREDIENT_ALIASES = {
    ou: ["oua"],
    oua: ["ou"],
    cartof: ["cartofi"],
    cartofi: ["cartof"],
    rosie: ["rosii"],
    rosii: ["rosie"],
    ceapa: ["cepe"],
    cepe: ["ceapa"],
    galusca: ["galuste"],
    galuste: ["galusca"],
    lamaie: ["lamai"],
    lamai: ["lamaie"]
  };

  function expandIngredientToken(token) {
    return [token, ...(INGREDIENT_ALIASES[token] || [])];
  }

  function ingredientTokens(value) {
    return Array.from(new Set(tokenizeText(value)
      .filter((token) => !/^\\d+$/.test(token) && !IGNORED_INGREDIENT_TOKENS.has(token))
      .flatMap(expandIngredientToken)));
  }

  function recipeIngredientTokens(recipe) {
    return new Set(((recipe && recipe.ingredients) || []).flatMap(ingredientTokens));
  }

  function normalizedTagGroups(tags) {
    if (!tags) return {};
    if (Array.isArray(tags)) return tags.length ? { context: tags } : {};
    return Object.entries(tags).reduce((groups, [key, values]) => {
      const clean = Array.isArray(values) ? values.map((value) => String(value || "").trim()).filter(Boolean) : [];
      if (clean.length) groups[key] = Array.from(new Set(clean));
      return groups;
    }, {});
  }

  function flatTags(recipe) {
    return Object.values(normalizedTagGroups(recipe && recipe.tags)).flat();
  }

  function tagTokens(recipe) {
    return new Set(flatTags(recipe).flatMap(tokenizeText));
  }

  function cardTags(recipe, limit = 3) {
    const groups = normalizedTagGroups(recipe && recipe.tags);
    const picked = [];
    TAG_CARD_PRIORITY.forEach((key) => {
      (groups[key] || []).forEach((tag) => {
        if (picked.length < limit && !picked.includes(tag)) picked.push(tag);
      });
    });
    return picked;
  }

  function tagsMarkup(recipe, compact = false) {
    const groups = normalizedTagGroups(recipe && recipe.tags);
    const entries = Object.entries(TAG_GROUPS)
      .map(([key, config]) => ({ key, label: config.label, tags: groups[key] || [] }))
      .filter((group) => group.tags.length);
    if (!entries.length) return "";

    if (compact) {
      return \`<div class="card-tags">\${cardTags(recipe).map((tag) => \`<span class="tag-chip small">\${escapeHtml(tag)}</span>\`).join("")}</div>\`;
    }

    return \`
      <section class="recipe-tags box" aria-labelledby="recipeTagsTitle">
        <h2 id="recipeTagsTitle">Etichete rețetă</h2>
        <div class="tag-groups">
          \${entries.map((group) => \`
            <div class="tag-group">
              <h3>\${escapeHtml(group.label)}</h3>
              <div class="tag-list">\${group.tags.map((tag) => \`<a class="tag-chip tag-link" href="\${searchUrl(tag)}">\${escapeHtml(tag)}</a>\`).join("")}</div>
            </div>
          \`).join("")}
        </div>
      </section>
    \`;
  }

  function recipeSearchTokens(recipe) {
    return new Set(tokenizeText([
      recipe && recipe.name,
      recipe && recipe.category,
      recipe && recipe.description,
      ((recipe && recipe.ingredients) || []).join(" "),
      ((recipe && recipe.preparation) || []).join(" "),
      ((recipe && recipe.beforeStart) || []).join(" "),
      ((recipe && recipe.keywords) || []).join(" "),
      flatTags(recipe).join(" ")
    ].join(" ")));
  }

  function recipeMatchesSearch(recipe, queryTokens) {
    if (!queryTokens.length) return true;
    // Full-token matching avoids false positives such as "ou" matching a random
    // longer word. Add explicit keywords when singular/plural shortcuts are desired.
    const tokens = recipeSearchTokens(recipe);
    return queryTokens.every((token) => tokens.has(token));
  }

  function applyStagger(container) {
    if (!container) return;
    Array.from(container.children).forEach((child, index) => {
      if (child && child.style) child.style.setProperty("--stagger", Math.min(index, 14));
    });
  }

  function markRevealTargets(scope) {
    if (prefersReducedMotion) return;
    const rootEl = scope || document;
    rootEl.querySelectorAll(".section, .page-title, .search-panel, .ingredient-panel, .randomizer-panel, .builder-card, .box, .card, .category-card, .recipe-detail-card, .related, .meal-slot").forEach((el) => {
      if (!el.hasAttribute("data-reveal")) el.setAttribute("data-reveal", "");
      if (revealObserver) revealObserver.observe(el);
      else if (document.documentElement.classList.contains("reveal-ready")) el.classList.add("is-revealed");
    });
  }

  function pulseElement(el) {
    if (!el || prefersReducedMotion) return;
    el.classList.remove("pulse-once");
    void el.offsetWidth;
    el.classList.add("pulse-once");
  }

  function emptyState(message, actions) {
    const actionMarkup = actions === false ? "" : [
      '<div class="empty-actions">',
      '<button class="btn secondary" type="button" data-clear-search>Curăță căutarea</button>',
      '<a class="btn secondary" href="' + root + 'cauta.html">Vezi toate rețetele</a>',
      '<a class="btn secondary" href="' + root + 'categorii.html">Explorează categoriile</a>',
      '</div>'
    ].join("");
    return '<div class="empty"><p>' + escapeHtml(message) + '</p>' + actionMarkup + '</div>';
  }

  function card(recipe) {
    const ingredients = (recipe.ingredients || []).filter((line) => !isSubheading(line)).slice(0, 5).join(", ");
    const titleId = "recipe-card-" + recipe.slug;
    return \`
      <a class="card recipe-card" aria-labelledby="\${titleId}" href="\${recipeUrl(recipe.slug)}">
        <span class="category-pill">\${escapeHtml(recipe.category)}</span>
        <h3 id="\${titleId}">\${escapeHtml(recipe.name)}</h3>
        \${tagsMarkup(recipe, true)}
        <p>\${escapeHtml(recipe.description || "")}</p>
        <div class="ingredients-preview"><strong>Ingrediente:</strong> \${escapeHtml(ingredients)}\${recipe.ingredients && recipe.ingredients.length > 5 ? "..." : ""}</div>
      </a>
    \`;
  }

  function renderRecipeCards(elementId, recipes) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = recipes.length ? recipes.map(card).join("") : '<div class="empty">Nu există rețete de afișat încă.</div>';
    if (!recipes.length) el.innerHTML = emptyState("Nu există rețete de afișat încă.", false);
    applyStagger(el);
    markRevealTargets(el);
  }

  function renderFeatured() {
    renderRecipeCards("featuredRecipes", data.recipes.slice(0, 9));
  }

  function renderAllRecipes() {
    renderRecipeCards("allRecipes", data.recipes);
  }

  function renderCategories() {
    const el = document.getElementById("categoryGrid");
    if (!el) return;
    el.innerHTML = data.categories.map((category) => {
      const count = data.recipes.filter((recipe) => recipe.category === category.name).length;
      const countLabel = count === 1 ? "1 rețetă" : count + " rețete";
      return \`
        <a class="category-card" href="\${categoryUrl(category.slug)}" data-icon="\${escapeHtml(categoryIcon(category.name))}">
          <strong>\${escapeHtml(category.name)}</strong>
          <span>\${escapeHtml(category.description)}<br>\${count ? countLabel : "urmează rețete noi"}</span>
        </a>
      \`;
    }).join("");
    applyStagger(el);
    markRevealTargets(el);
  }

  function setupSearch() {
    const input = document.getElementById("recipeSearchInput");
    const category = document.getElementById("recipeCategoryFilter");
    const count = document.getElementById("recipeCount");
    const results = document.getElementById("searchResults");
    if (!input || !category || !results) return;

    category.innerHTML = '<option value="all">Toate categoriile</option>' + data.categories.map((item) => \`<option value="\${escapeHtml(item.name)}">\${escapeHtml(item.name)}</option>\`).join("");
    if (!category.value) category.value = "all";

    function run() {
      const terms = tokenizeText(input.value);
      const selected = category.value;
      const matches = data.recipes.filter((recipe) => {
        if (selected !== "all" && recipe.category !== selected) return false;
        return recipeMatchesSearch(recipe, terms);
      });

      count.textContent = matches.length === 1 ? "1 rețetă găsită" : \`\${matches.length} rețete găsite\`;
      results.innerHTML = matches.length ? matches.map(card).join("") : '<div class="empty">Nu am găsit nicio rețetă. Încearcă un ingredient, o categorie sau mai puține cuvinte.</div>';
      pulseElement(count);
      if (!matches.length) results.innerHTML = emptyState("Nu am găsit nicio rețetă. Încearcă alt ingredient sau explorează categoriile.");
      applyStagger(results);
      markRevealTargets(results);
      results.classList.remove("is-refreshing");
      void results.offsetWidth;
      results.classList.add("is-refreshing");
    }

    input.addEventListener("input", run);
    category.addEventListener("change", run);
    results.addEventListener("click", (event) => {
      const button = event.target.closest("[data-clear-search]");
      if (!button) return;
      input.value = "";
      category.value = "all";
      run();
      input.focus();
    });
    run();
  }

  function setupPrefilledSearch() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const input = document.getElementById("recipeSearchInput");
    if (q && input) {
      input.value = q;
      input.dispatchEvent(new Event("input"));
    }
  }

  function analyzeIngredientMatch(recipe, availableTokens) {
    const rows = ((recipe && recipe.ingredients) || [])
      .filter((line) => !isSubheading(line))
      .map((line) => ({ label: line, tokens: ingredientTokens(line) }))
      .filter((row) => row.tokens.length);

    const matched = [];
    const missing = [];
    rows.forEach((row) => {
      const hasMatch = row.tokens.some((token) => availableTokens.has(token));
      if (hasMatch) matched.push(row.label);
      else missing.push(row.label);
    });

    const total = rows.length;
    let matchedCount = matched.length;
    let score = total ? matchedCount / total : 0;
    const keywordMatches = Array.from(keywordTokens(recipe)).filter((token) => availableTokens.has(token));
    if (!matchedCount && keywordMatches.length) {
      matched.push("cuvânt-cheie: " + keywordMatches.slice(0, 3).join(", "));
      matchedCount = 1;
      score = total ? Math.min(.28, 1 / total) : .2;
    }
    return { recipe, matched, missing, total, matchedCount, missingCount: missing.length, score };
  }

  function matchBadge(match) {
    if (match.missingCount === 0) return "Complet";
    if (match.score >= .88 || match.missingCount <= 1) return "Aproape complet";
    return match.missingCount === 1 ? "Lipsește 1 ingredient" : "Lipsesc " + match.missingCount + " ingrediente";
  }

  function renderMatchChips(items, className) {
    if (!items.length) return '<span class="match-chip">nimic de afișat</span>';
    return items.slice(0, 8).map((item) => \`<span class="match-chip \${className || ""}">\${escapeHtml(item)}</span>\`).join("");
  }

  function ingredientMatchCard(match) {
    const recipe = match.recipe;
    const percent = Math.round(match.score * 100);
    const titleId = "ingredient-match-" + recipe.slug;
    const matchedText = match.matched.slice(0, 3).join(", ");
    const missingText = match.missing.length ? " Mai lipsesc: " + match.missing.slice(0, 3).join(", ") + "." : " Ai toate ingredientele importante detectate.";
    return \`
      <a class="card recipe-card match-card" aria-labelledby="\${titleId}" href="\${recipeUrl(recipe.slug)}">
        <div class="match-card-head">
          <span class="category-pill">\${escapeHtml(recipe.category)}</span>
          <span class="match-badge">\${escapeHtml(matchBadge(match))}</span>
        </div>
        <h3 id="\${titleId}">\${escapeHtml(recipe.name)}</h3>
        <p>\${escapeHtml(recipe.description || "")}</p>
        <div class="match-meter" aria-label="Potrivire \${percent}%"><span style="width: \${percent}%"></span></div>
        <p class="match-detail"><strong>\${percent}% potrivire</strong> Recomandată fiindcă ai: \${escapeHtml(matchedText || "ingrediente potrivite")}.\${escapeHtml(missingText)}</p>
        <div class="match-detail">
          <strong>Ingrediente potrivite</strong>
          <div class="match-chip-list">\${renderMatchChips(match.matched)}</div>
        </div>
        <div class="match-detail">
          <strong>Ingrediente lipsă</strong>
          <div class="match-chip-list">\${renderMatchChips(match.missing, "missing")}</div>
        </div>
      </a>
    \`;
  }

  function renderMatchSection(title, matches) {
    if (!matches.length) return "";
    return \`
      <section class="match-section" aria-labelledby="\${normalize(title).replace(/[^a-z0-9]+/g, "-")}">
        <h2 id="\${normalize(title).replace(/[^a-z0-9]+/g, "-")}">\${escapeHtml(title)}</h2>
        <div class="grid cards">\${matches.map(ingredientMatchCard).join("")}</div>
      </section>
    \`;
  }

  function setupIngredientMatcher() {
    const form = document.getElementById("ingredientMatcherForm");
    const input = document.getElementById("availableIngredients");
    const chips = document.getElementById("ingredientChips");
    const summary = document.getElementById("ingredientMatchSummary");
    const results = document.getElementById("ingredientMatchResults");
    const reset = document.getElementById("resetIngredientMatcher");
    if (!form || !input || !chips || !summary || !results) return;

    const storageKey = "arta-gatitului-available-ingredients";

    function availableTokens() {
      return Array.from(new Set(ingredientTokens(input.value)));
    }

    function renderChips(tokens) {
      chips.innerHTML = tokens.length
        ? tokens.map((token) => \`<span class="ingredient-chip">\${escapeHtml(token)}</span>\`).join("")
        : '<span class="ingredient-chip">Scrie ingredientele de acasă</span>';
    }

    function run() {
      const tokens = availableTokens();
      const tokenSet = new Set(tokens);
      renderChips(tokens);

      if (!tokens.length) {
        summary.textContent = "Introdu ingredientele ca să primești recomandări.";
        results.innerHTML = '<div class="empty">Exemplu: pui, cartofi, ou, lapte, usturoi.</div>';
        results.innerHTML = emptyState("Exemplu: pui, cartofi, ou, lapte, usturoi.", false);
        return;
      }

      window.localStorage.setItem(storageKey, input.value);
      const matches = data.recipes
        .map((recipe) => analyzeIngredientMatch(recipe, tokenSet))
        .filter((match) => match.total > 0 && match.matchedCount > 0)
        .sort((a, b) => {
          const scoreDiff = b.score - a.score;
          if (scoreDiff) return scoreDiff;
          const missingDiff = a.missingCount - b.missingCount;
          if (missingDiff) return missingDiff;
          return a.recipe.name.localeCompare(b.recipe.name, "ro");
        });

      const ready = matches.filter((match) => match.score >= .88 || match.missingCount <= 1);
      const almost = matches.filter((match) => !ready.includes(match) && match.score >= .34);
      const weak = matches.filter((match) => !ready.includes(match) && !almost.includes(match) && match.score > 0).slice(0, 6);

      summary.textContent = matches.length === 1
        ? "1 rețetă se potrivește cu ingredientele introduse."
        : matches.length + " rețete se potrivesc cu ingredientele introduse.";

      results.innerHTML = matches.length
        ? [
            renderMatchSection("Poți găti acum", ready),
            renderMatchSection("Îți lipsesc câteva ingrediente", almost.slice(0, 12)),
            renderMatchSection("Potrivire slabă", weak)
          ].join("")
        : '<div class="empty">Nu am găsit potriviri încă. Încearcă ingrediente mai simple, de exemplu „pui”, „cartofi”, „ouă” sau „lapte”.</div>';
      if (!matches.length) results.innerHTML = emptyState("Nu am găsit potriviri încă. Încearcă ingrediente mai simple, de exemplu pui, cartofi, ouă sau lapte.", false);
      applyStagger(results);
      markRevealTargets(results);
      results.classList.remove("is-refreshing");
      void results.offsetWidth;
      results.classList.add("is-refreshing");
    }

    input.addEventListener("input", () => renderChips(availableTokens()));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      run();
    });
    reset?.addEventListener("click", () => {
      input.value = "";
      window.localStorage.removeItem(storageKey);
      run();
      input.focus();
    });

    const saved = window.localStorage.getItem(storageKey);
    if (saved) input.value = saved;
    run();
  }

  function renderList(lines, ordered) {
    const tag = ordered ? "ol" : "ul";
    const items = (lines || []).map((line) => {
      const cls = isSubheading(line) ? ' class="subhead"' : "";
      return \`<li\${cls}>\${escapeHtml(line)}</li>\`;
    }).join("");
    return \`<\${tag} class="clean">\${items}</\${tag}>\`;
  }

  function beforeStartSection(recipe) {
    const items = ((recipe && recipe.beforeStart) || []).map((item) => String(item || "").trim()).filter(Boolean);
    if (!items.length) return "";
    return \`
      <section class="before-start box" aria-labelledby="beforeStartTitle">
        <h2 id="beforeStartTitle">Înainte să începi</h2>
        <p>O verificare rapidă ca să gătești mai liniștit.</p>
        <ul class="before-list">
          \${items.map((item, index) => \`
            <li>
              <label>
                <input type="checkbox">
                <span>\${escapeHtml(item)}</span>
              </label>
            </li>
          \`).join("")}
        </ul>
      </section>
    \`;
  }

  function complexityLabel(value) {
    const rating = Number(value);
    if (!Number.isFinite(rating)) return "";
    if (rating <= 2) return "Începător / Ușoară";
    if (rating <= 3.5) return "Complexitate medie";
    return "Complexitate ridicată";
  }

  function ratingValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
  }

  function publicRatingSummary(summary) {
    if (!summary || !Number(summary.totalRatings)) {
      return '<p class="rating-note">Nu există încă evaluări publice. Nu afișăm medii inventate.</p>';
    }
    const overall = ratingValue(summary.overallAverage);
    const taste = ratingValue(summary.tasteAverage);
    const clarity = ratingValue(summary.clarityAverage);
    const complexity = ratingValue(summary.complexityAverage);
    const cookAgain = ratingValue(summary.cookAgainPercent);
    return \`
      <div class="public-rating">
        <h3>Evaluări publice</h3>
        <div class="rating-summary-grid">
          \${overall ? \`<div><span>General</span><strong>\${overall}/5</strong></div>\` : ""}
          \${taste ? \`<div><span>Gust</span><strong>\${taste}/5</strong></div>\` : ""}
          \${clarity ? \`<div><span>Instrucțiuni</span><strong>\${clarity}/5</strong></div>\` : ""}
          \${complexity ? \`<div><span>Complexitate</span><strong>\${complexity}/5</strong></div>\` : ""}
          \${cookAgain !== null ? \`<div><span>Aș găti din nou</span><strong>\${cookAgain}%</strong></div>\` : ""}
          <div><span>Evaluări</span><strong>\${Number(summary.totalRatings)}</strong></div>
        </div>
        \${complexity ? \`<p class="rating-note">Complexitate după evaluări: \${escapeHtml(complexityLabel(complexity))}.</p>\` : ""}
      </div>
    \`;
  }

  function ratingScale(name, label, help) {
    const labels = name === "complexity"
      ? ["1 foarte ușoară", "2 ușoară", "3 medie", "4 complexă", "5 foarte complexă"]
      : ["1 slab", "2 ok", "3 bun", "4 foarte bun", "5 excelent"];
    return \`
      <fieldset class="rating-group" data-rating-group="\${name}">
        <legend>\${escapeHtml(label)}</legend>
        \${help ? \`<p>\${escapeHtml(help)}</p>\` : ""}
        <div class="rating-options">
          \${[1, 2, 3, 4, 5].map((value) => \`
            <label>
              <input type="radio" name="rating-\${name}" value="\${value}">
              <span aria-hidden="true">\${name === "complexity" ? value : "★"}</span>
              <span class="sr-only">\${labels[value - 1]}</span>
            </label>
          \`).join("")}
        </div>
      </fieldset>
    \`;
  }

  function ratingSection(recipe) {
    return \`
      <section class="recipe-rating box" data-rating-panel data-recipe-slug="\${escapeHtml(recipe.slug)}" aria-labelledby="recipeRatingTitle">
        <h2 id="recipeRatingTitle">Evaluează rețeta</h2>
        <p class="rating-note">Evaluarea ta este salvată doar în acest browser. Pentru evaluări publice de la toți utilizatorii, site-ul ar avea nevoie de o bază de date.</p>
        \${publicRatingSummary(recipe.ratingSummary)}
        <form class="rating-form" data-rating-form>
          \${ratingScale("taste", "Gust")}
          \${ratingScale("clarity", "Instrucțiuni clare")}
          \${ratingScale("complexity", "Complexitate", "1 înseamnă foarte ușoară, 5 foarte complexă.")}
          \${ratingScale("overall", "Evaluare generală")}
          <fieldset class="rating-group cook-again" data-rating-group="cookAgain">
            <legend>Aș găti din nou</legend>
            <div class="choice-row">
              <label><input type="radio" name="rating-cookAgain" value="true"> <span>Da</span></label>
              <label><input type="radio" name="rating-cookAgain" value="false"> <span>Nu</span></label>
            </div>
          </fieldset>
          <p class="rating-personal" data-rating-personal-note></p>
          <div class="rating-actions">
            <button class="btn" type="submit">Salvează evaluarea</button>
            <button class="btn secondary" type="button" data-rating-reset>Șterge evaluarea mea</button>
          </div>
          <p class="builder-status" data-rating-status aria-live="polite"></p>
        </form>
      </section>
    \`;
  }

  function steakCalculator(extra) {
    if (!extra || extra.type !== "steak-calculator") return "";
    return \`
      <section class="steak-calculator" data-steak-calculator>
        <h2>\${escapeHtml(extra.title)}</h2>
        <p>Completează detaliile bucății de carne, tipul de tigaie și nivelul de foc pentru o estimare practică de gătire.</p>
        <div class="steak-form">
          <label class="field">
            <span>Greutate</span>
            <input data-steak-weight type="number" min="120" max="1200" step="10" value="300" inputmode="numeric">
          </label>
          <label class="field">
            <span>Grosime</span>
            <input data-steak-thickness type="number" min="1" max="7" step="0.1" value="3" inputmode="decimal">
          </label>
          <label class="field">
            <span>Gătire dorită</span>
            <select data-steak-doneness>
              <option value="rare">Rare</option>
              <option value="medium-rare" selected>Medium rare</option>
              <option value="medium">Medium</option>
              <option value="medium-well">Medium well</option>
              <option value="well-done">Well done</option>
            </select>
          </label>
          <label class="field">
            <span>Temperatura cărnii</span>
            <select data-steak-start>
              <option value="fridge">Direct din frigider</option>
              <option value="room" selected>La temperatura camerei</option>
            </select>
          </label>
          <label class="field">
            <span>Tip steak</span>
            <select data-steak-cut>
              <option value="ribeye" selected>Ribeye / Antricot</option>
              <option value="sirloin">Sirloin</option>
              <option value="filet">Mușchi / File</option>
              <option value="tbone">T-bone</option>
              <option value="other">Alt tip</option>
            </select>
          </label>
          <label class="field">
            <span>Tigaie</span>
            <select data-steak-pan>
              <option value="steel">Tigaie de oțel</option>
              <option value="cast-iron" selected>Tigaie de fontă</option>
              <option value="aluminum">Tigaie de aluminiu</option>
              <option value="stainless">Tigaie de inox</option>
              <option value="nonstick">Tigaie antiaderentă</option>
            </select>
          </label>
          <label class="field">
            <span>Nivel foc</span>
            <select data-steak-heat>
              <option value="low">Mic</option>
              <option value="low-medium">Mic-mediu</option>
              <option value="medium">Mediu</option>
              <option value="medium-high" selected>Mediu-mare</option>
              <option value="high">Mare</option>
            </select>
          </label>
        </div>
        <div class="steak-result" data-steak-result></div>
        <div class="steak-actions">
          <button class="btn" type="button" data-steak-start-timer>Pornește timer</button>
          <button class="btn secondary" type="button" data-steak-pause-timer>Pauză</button>
          <button class="btn secondary" type="button" data-steak-reset-timer>Reset</button>
        </div>
        <div class="steak-timer" aria-live="polite">
          <div class="timer-display" data-steak-time>00:00</div>
          <div>
            <div class="timer-phase" data-steak-phase>Pregătit</div>
            <div class="timer-status" data-steak-status>Timerul va suna când trebuie întors steak-ul, când se termină gătirea și după odihnire.</div>
          </div>
        </div>
        <div class="steak-grid">
          <div class="steak-chip"><strong>Rare</strong><span>50-52°C</span></div>
          <div class="steak-chip"><strong>Medium rare</strong><span>55-57°C</span></div>
          <div class="steak-chip"><strong>Medium</strong><span>60-63°C</span></div>
          <div class="steak-chip"><strong>Well done</strong><span>70°C+</span></div>
        </div>
      </section>
    \`;
  }

  function sharedTokenCount(a, b) {
    let count = 0;
    a.forEach((token) => {
      if (b.has(token)) count += 1;
    });
    return count;
  }

  function importantTitleTokens(recipe) {
    return new Set(ingredientTokens(recipe && recipe.name));
  }

  function keywordTokens(recipe) {
    return new Set(((recipe && recipe.keywords) || []).flatMap(tokenizeText));
  }

  function similarRecipes(currentRecipe) {
    if (!currentRecipe) return [];
    const currentCategory = normalize(currentRecipe.category);
    const currentIngredients = recipeIngredientTokens(currentRecipe);
    const currentKeywords = keywordTokens(currentRecipe);
    const currentTitle = importantTitleTokens(currentRecipe);

    return data.recipes
      .filter((recipe) => recipe.slug !== currentRecipe.slug)
      .map((recipe) => {
        const sameCategory = normalize(recipe.category) === currentCategory ? 3 : 0;
        const keywordScore = sharedTokenCount(currentKeywords, keywordTokens(recipe)) * 2;
        const ingredientScore = sharedTokenCount(currentIngredients, recipeIngredientTokens(recipe));
        const titleScore = sharedTokenCount(currentTitle, importantTitleTokens(recipe));
        const tagScore = sharedTokenCount(tagTokens(currentRecipe), tagTokens(recipe)) * 2;
        return { recipe, score: sameCategory + keywordScore + ingredientScore + titleScore + tagScore };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff) return scoreDiff;
        return a.recipe.name.localeCompare(b.recipe.name, "ro");
      })
      .slice(0, 6)
      .map((item) => item.recipe);
  }

  function recipeTimeline(recipe) {
    const markers = [];
    if (recipe && recipe.prepTime) markers.push(["Pregătire", recipe.prepTime]);
    if (recipe && recipe.cookTime) markers.push(["Gătire", recipe.cookTime]);
    if (recipe && recipe.restTime) markers.push(["Odihnire", recipe.restTime]);
    if (!markers.length) return "";
    return '<section class="recipe-timeline box" aria-label="Timeline rețetă">' +
      markers.map((item) => '<div><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong></div>').join("") +
      '</section>';
  }

  function renderRecipeDetail() {
    const el = document.getElementById("recipeDetail");
    if (!el) return;
    const slug = document.body.dataset.recipeSlug;
    const recipe = recipeBySlug(slug);
    if (!recipe) {
      el.innerHTML = '<div class="empty">Rețeta nu a fost găsită.</div>';
      return;
    }

    document.title = recipe.name + " | Arta Gătitului";
    const catSlug = categorySlug(recipe.category);
    const related = similarRecipes(recipe);

    el.innerHTML = \`
      <article class="recipe-detail-card">
        <div class="recipe-hero">
          <div>
            <span class="pill">\${escapeHtml(recipe.category)}</span>
            <h1>\${escapeHtml(recipe.name)}</h1>
            <p class="lead">\${escapeHtml(recipe.description || "")}</p>
          </div>
          <div class="detail-meta">
            <a class="btn secondary" href="\${categoryUrl(catSlug)}">Înapoi la categorie</a>
          </div>
        </div>
        \${recipeTimeline(recipe)}
        \${beforeStartSection(recipe)}
        <div class="recipe-layout">
          <section class="box">
            <h2>Ingrediente</h2>
            \${renderList(recipe.ingredients || [], false)}
          </section>
          <section class="box">
            <h2>Mod de preparare</h2>
            \${renderList(recipe.preparation || [], true)}
            \${recipe.closing ? \`<p class="closing">\${escapeHtml(recipe.closing)}</p>\` : ""}
          </section>
        </div>
        \${tagsMarkup(recipe)}
        \${(recipe.extras || []).map(steakCalculator).join("")}
        \${ratingSection(recipe)}
      </article>
      <section class="related" aria-labelledby="similarRecipesTitle">
        <h2 id="similarRecipesTitle">Rețete similare</h2>
        \${related.length ? \`<div class="grid cards">\${related.map(card).join("")}</div>\` : '<div class="empty">Nu există încă rețete similare.</div>'}
      </section>
    \`;
    markRevealTargets(el);
    el.querySelectorAll(".grid").forEach(applyStagger);
  }

  function renderCategoryPage() {
    const title = document.getElementById("categoryTitle");
    const desc = document.getElementById("categoryDescription");
    const list = document.getElementById("categoryRecipes");
    if (!title || !list) return;

    const slug = document.body.dataset.categorySlug;
    const category = data.categories.find((item) => item.slug === slug);
    if (!category) {
      title.textContent = "Categorie negăsită";
      list.innerHTML = '<div class="empty">Această categorie nu există.</div>';
      return;
    }

    document.title = category.name + " | Arta Gătitului";
    title.textContent = category.name;
    if (desc) desc.textContent = category.description;
    renderRecipeCards("categoryRecipes", data.recipes.filter((recipe) => recipe.category === category.name));
  }

  function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function compactText(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "");
  }

  function categoryMatches(categoryName, variants) {
    const value = compactText(categoryName);
    return variants.some((variant) => value === compactText(variant));
  }

  function mealCard(slot) {
    const recipes = data.recipes.filter((recipe) => categoryMatches(recipe.category, slot.variants));
    const recipe = pickRandom(recipes);
    return \`
      <section class="meal-slot">
        <h2 class="meal-slot-title">\${escapeHtml(slot.label)}</h2>
        \${recipe ? card(recipe) : \`<div class="empty meal-empty">Nu există încă rețete pentru această categorie.</div>\`}
      </section>
    \`;
  }

  function setupRandomizer() {
    const button = document.getElementById("randomRecipeButton");
    const result = document.getElementById("randomRecipeResult");
    if (!button || !result) return;

    const slots = [
      { label: "Mic dejun", variants: ["Mic dejun"] },
      { label: "Fel principal", variants: ["Fel principal"] },
      { label: "Fel secundar", variants: ["Fel secundar"] },
      { label: "Desert", variants: ["Desert"] },
      { label: "Băutură", variants: ["Bautura", "Băutură", "Bauturi", "Băuturi"] },
      { label: "Salată", variants: ["Salata", "Salată", "Salate"] },
      { label: "Rontaieli", variants: ["Rontaieli", "Ronțăieli"] }
    ];

    function choose() {
      result.innerHTML = data.recipes.length
        ? \`<div class="meal-grid">\${slots.map(mealCard).join("")}</div>\`
        : '<div class="empty">Nu există încă rețete pentru randomizer.</div>';
      applyStagger(result);
      markRevealTargets(result);
      result.classList.remove("is-refreshing");
      void result.offsetWidth;
      result.classList.add("is-refreshing");
    }

    button.addEventListener("click", choose);
    choose();
  }

  function setupSteakCalculators() {
    document.querySelectorAll("[data-steak-calculator]").forEach((calculator) => {
      const fields = {
        weight: calculator.querySelector("[data-steak-weight]"),
        thickness: calculator.querySelector("[data-steak-thickness]"),
        doneness: calculator.querySelector("[data-steak-doneness]"),
        start: calculator.querySelector("[data-steak-start]"),
        cut: calculator.querySelector("[data-steak-cut]"),
        pan: calculator.querySelector("[data-steak-pan]"),
        heat: calculator.querySelector("[data-steak-heat]")
      };
      const result = calculator.querySelector("[data-steak-result]");
      const time = calculator.querySelector("[data-steak-time]");
      const phase = calculator.querySelector("[data-steak-phase]");
      const status = calculator.querySelector("[data-steak-status]");
      const timerBox = calculator.querySelector(".steak-timer");
      const startButton = calculator.querySelector("[data-steak-start-timer]");
      const pauseButton = calculator.querySelector("[data-steak-pause-timer]");
      const resetButton = calculator.querySelector("[data-steak-reset-timer]");
      if (!result || !time || !phase || !status || !startButton || !pauseButton || !resetButton) return;

      const doneness = {
        rare: { label: "Rare", temp: "50-52°C", adjust: -18, rest: 5 },
        "medium-rare": { label: "Medium rare", temp: "55-57°C", adjust: 0, rest: 6 },
        medium: { label: "Medium", temp: "60-63°C", adjust: 18, rest: 7 },
        "medium-well": { label: "Medium well", temp: "65-68°C", adjust: 34, rest: 8 },
        "well-done": { label: "Well done", temp: "70°C+", adjust: 52, rest: 8 }
      };
      const pans = {
        steel: { label: "tigaie de oțel", factor: 1, advice: "Încălzește tigaia bine înainte de carne" },
        "cast-iron": { label: "tigaie de fontă", factor: .92, advice: "Ține căldura foarte bine, deci focul mediu-mare este de obicei suficient" },
        aluminum: { label: "tigaie de aluminiu", factor: 1.08, advice: "Răspunde rapid la schimbări, dar pierde căldură mai ușor" },
        stainless: { label: "tigaie de inox", factor: 1.03, advice: "Preîncălzește până când o picătură de apă alunecă pe suprafață" },
        nonstick: { label: "tigaie antiaderentă", factor: 1.12, advice: "Folosește foc mediu sau mediu-mare, ca să protejezi stratul antiaderent" }
      };
      const cuts = {
        ribeye: { label: "ribeye / antricot", factor: 1 },
        sirloin: { label: "sirloin", factor: .96 },
        filet: { label: "mușchi / file", factor: .9 },
        tbone: { label: "T-bone", factor: 1.08 },
        other: { label: "alt tip", factor: 1 }
      };
      const heats = {
        low: { label: "mic", factor: 1.35 },
        "low-medium": { label: "mic-mediu", factor: 1.18 },
        medium: { label: "mediu", factor: 1 },
        "medium-high": { label: "mediu-mare", factor: .88 },
        high: { label: "mare", factor: .78 }
      };
      const starts = {
        fridge: { label: "direct din frigider", factor: 1.12 },
        room: { label: "la temperatura camerei", factor: .94 }
      };

      let timer = null;
      let plan = null;
      let elapsed = 0;
      let notifiedFlip = false;
      let notifiedCooked = false;
      let notifiedDone = false;
      let audioContext = null;

      function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
      }

      function readNumber(input, fallback, min, max) {
        const value = Number(input && input.value);
        return clamp(Number.isFinite(value) ? value : fallback, min, max);
      }

      function formatSeconds(seconds) {
        const safe = Math.max(0, Math.round(seconds));
        const minutes = Math.floor(safe / 60);
        const rest = safe % 60;
        return \`\${String(minutes).padStart(2, "0")}:\${String(rest).padStart(2, "0")}\`;
      }

      function ensureAudio() {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return null;
        if (!audioContext) audioContext = new Context();
        if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
        return audioContext;
      }

      function beep() {
        const context = ensureAudio();
        if (!context) return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(.001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(.22, context.currentTime + .03);
        gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .42);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + .45);
      }

      function calculate() {
        const weight = readNumber(fields.weight, 300, 120, 1200);
        const thickness = readNumber(fields.thickness, 3, 1, 7);
        const target = doneness[fields.doneness.value] || doneness["medium-rare"];
        const pan = pans[fields.pan.value] || pans["cast-iron"];
        const heat = heats[fields.heat.value] || heats["medium-high"];
        const start = starts[fields.start.value] || starts.room;
        const cut = cuts[fields.cut.value] || cuts.ribeye;
        // Simple estimate: thickness drives the base time, then weight, doneness,
        // pan material, heat level, starting temperature, and cut type nudge it.
        const weightBoost = Math.max(0, weight - 250) * .055;
        const rawSide = (thickness * 72 + weightBoost + target.adjust) * pan.factor * heat.factor * start.factor * cut.factor;
        const sideSeconds = Math.round(clamp(rawSide, 70, 480) / 5) * 5;
        const totalSeconds = sideSeconds * 2;
        const restSeconds = target.rest * 60;
        return { weight, thickness, target, pan, heat, start, cut, sideSeconds, totalSeconds, restSeconds };
      }

      function renderPlan() {
        plan = calculate();
        result.innerHTML = \`
          <div class="steak-result-grid">
            <div class="steak-metric"><span>Pe fiecare parte</span><strong>\${formatSeconds(plan.sideSeconds)}</strong></div>
            <div class="steak-metric"><span>Total în tigaie</span><strong>\${formatSeconds(plan.totalSeconds)}</strong></div>
            <div class="steak-metric"><span>Foc recomandat</span><strong>\${plan.heat.label}</strong></div>
            <div class="steak-metric"><span>Temp. internă aprox.</span><strong>\${plan.target.temp}</strong></div>
            <div class="steak-metric"><span>Odihnă</span><strong>\${plan.target.rest} min</strong></div>
          </div>
          <p class="steak-note">Pentru \${plan.weight} g, \${plan.thickness} cm și tipul \${plan.cut.label}, gătește pe foc \${plan.heat.label} într-o \${plan.pan.label}. \${plan.pan.advice}. Întoarce steak-ul după \${formatSeconds(plan.sideSeconds)}. Timpii sunt estimări și pot varia în funcție de aragaz, tigaie și grosimea reală; folosește un termometru pentru cea mai sigură verificare.</p>
        \`;
        resetTimer(false);
      }

      function totalTimerSeconds() {
        return plan.totalSeconds + plan.restSeconds;
      }

      function timerPhase() {
        if (!plan) return { label: "Pregătit", remaining: 0 };
        if (elapsed < plan.sideSeconds) return { label: "Prima parte", remaining: plan.sideSeconds - elapsed };
        if (elapsed < plan.totalSeconds) return { label: "A doua parte", remaining: plan.totalSeconds - elapsed };
        if (elapsed < totalTimerSeconds()) return { label: "Odihnire", remaining: totalTimerSeconds() - elapsed };
        return { label: "Gata", remaining: 0 };
      }

      function updateTimer() {
        const current = timerPhase();
        phase.textContent = current.label;
        time.textContent = formatSeconds(current.remaining);
      }

      function stopTimer() {
        if (timer) window.clearInterval(timer);
        timer = null;
        if (timerBox) timerBox.classList.remove("is-running");
      }

      function resetTimer(updateStatus = true) {
        stopTimer();
        if (!plan) plan = calculate();
        elapsed = 0;
        notifiedFlip = false;
        notifiedCooked = false;
        notifiedDone = false;
        startButton.textContent = "Start";
        updateTimer();
        if (updateStatus) status.textContent = "Timer resetat. Pornește când pui steak-ul în tigaie.";
        else status.textContent = "Timer pregătit. Apasă Start când pui steak-ul în tigaie.";
      }

      function notify(message) {
        status.textContent = message;
        beep();
      }

      function tick() {
        elapsed += 1;
        if (!notifiedFlip && elapsed >= plan.sideSeconds) {
          notifiedFlip = true;
          notify("Întoarce steak-ul acum.");
        }
        if (!notifiedCooked && elapsed >= plan.totalSeconds) {
          notifiedCooked = true;
          notify(\`Scoate steak-ul din tigaie. Începe odihnirea: \${plan.target.rest} minute.\`);
        }
        if (!notifiedDone && elapsed >= totalTimerSeconds()) {
          notifiedDone = true;
          elapsed = totalTimerSeconds();
          updateTimer();
          stopTimer();
          startButton.textContent = "Start";
          notify("Gata. Steak-ul a terminat odihnirea.");
          return;
        }
        updateTimer();
      }

      Object.values(fields).forEach((field) => {
        if (!field) return;
        field.addEventListener("input", renderPlan);
        field.addEventListener("change", renderPlan);
      });
      startButton.addEventListener("click", () => {
        if (!plan) renderPlan();
        ensureAudio();
        if (elapsed >= totalTimerSeconds()) resetTimer(false);
        if (timer) return;
        startButton.textContent = "Rulează";
        status.textContent = "Timer pornit. Vei auzi un semnal la întoarcere, la finalul gătirii și după odihnire.";
        if (timerBox) timerBox.classList.add("is-running");
        timer = window.setInterval(tick, 1000);
      });
      pauseButton.addEventListener("click", () => {
        stopTimer();
        startButton.textContent = "Continuă";
        status.textContent = "Timer pus pe pauză.";
      });
      resetButton.addEventListener("click", () => resetTimer(true));

      renderPlan();
    });
  }

  function setupRecipeBuilder() {
    const form = document.getElementById("recipeBuilderForm");
    if (!form) return;

    const els = {
      title: document.getElementById("builderTitle"),
      slug: document.getElementById("builderSlug"),
      category: document.getElementById("builderCategory"),
      prepTime: document.getElementById("builderPrepTime"),
      cookTime: document.getElementById("builderCookTime"),
      servings: document.getElementById("builderServings"),
      description: document.getElementById("builderDescription"),
      image: document.getElementById("builderImage"),
      notes: document.getElementById("builderNotes"),
      keywords: document.getElementById("builderKeywords"),
      ingredients: document.getElementById("builderIngredients"),
      beforeStart: document.getElementById("builderBeforeStart"),
      steps: document.getElementById("builderSteps"),
      tags: document.getElementById("builderTags"),
      ratingSummary: {
        overallAverage: document.getElementById("builderOverallAverage"),
        tasteAverage: document.getElementById("builderTasteAverage"),
        clarityAverage: document.getElementById("builderClarityAverage"),
        complexityAverage: document.getElementById("builderComplexityAverage"),
        cookAgainPercent: document.getElementById("builderCookAgainPercent"),
        totalRatings: document.getElementById("builderTotalRatings")
      },
      preview: document.getElementById("recipeBuilderPreview"),
      exportOutput: document.getElementById("recipeExportOutput"),
      validation: document.getElementById("builderValidation"),
      status: document.getElementById("builderStatus"),
      importInput: document.getElementById("importRecipeJson")
    };
    if (!els.title || !els.slug || !els.category || !els.ingredients || !els.beforeStart || !els.steps || !els.tags || !els.preview || !els.exportOutput) return;

    const draftKey = "arta-gatitului-recipe-builder-draft";
    const existingSlugs = new Set((data.recipes || []).map((recipe) => recipe.slug));
    let slugTouched = false;
    let autosaveTimer = null;

    function builderSlug(value) {
      return normalize(value)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }

    function cleanLines(values) {
      return values.map((value) => String(value || "").trim()).filter(Boolean);
    }

    function rowValues(container) {
      return cleanLines(Array.from(container.querySelectorAll("[data-builder-row-input]")).map((input) => input.value));
    }

    function setStatus(message) {
      if (els.status) els.status.textContent = message || "";
      if (els.status) {
        els.status.classList.toggle("is-success", Boolean(message));
        pulseElement(els.status);
      }
    }

    function createText(tag, className, text) {
      const el = document.createElement(tag);
      if (className) el.className = className;
      el.textContent = text || "";
      return el;
    }

    function selectedBuilderTags() {
      const groups = {};
      Object.keys(TAG_GROUPS).forEach((key) => {
        const values = Array.from(els.tags.querySelectorAll('input[data-tag-group="' + key + '"]:checked')).map((input) => input.value);
        if (values.length) groups[key] = values;
      });
      return groups;
    }

    function ratingSummaryState() {
      const summary = {};
      Object.entries(els.ratingSummary).forEach(([key, input]) => {
        if (!input || input.value === "") return;
        const value = Number(input.value);
        if (Number.isFinite(value)) summary[key] = key === "totalRatings" ? Math.max(0, Math.round(value)) : value;
      });
      return Object.keys(summary).length ? summary : null;
    }

    function cleanObject(object) {
      return Object.fromEntries(Object.entries(object).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        if (value && typeof value === "object") return Object.keys(value).length > 0;
        return value !== "" && value !== null && value !== undefined;
      }));
    }

    function addRow(type, value = "") {
      const containers = {
        ingredients: els.ingredients,
        beforeStart: els.beforeStart,
        steps: els.steps
      };
      const container = containers[type] || els.ingredients;
      const row = document.createElement("div");
      row.className = "builder-row";

      const input = type === "steps" ? document.createElement("textarea") : document.createElement("input");
      input.dataset.builderRowInput = "true";
      input.value = value;
      input.placeholder = type === "steps"
        ? "Descrie pasul de preparare"
        : type === "beforeStart"
          ? "ex. Preîncălzește cuptorul la 180°C"
          : "ex. 2 ouă";
      if (type === "steps") input.rows = 2;

      const actions = document.createElement("div");
      actions.className = "builder-row-actions";

      [
        ["up", "Sus"],
        ["down", "Jos"],
        ["remove", "Șterge"]
      ].forEach(([action, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mini-btn";
        button.dataset.rowAction = action;
        button.textContent = label;
        actions.append(button);
      });

      row.append(input, actions);
      container.append(row);
      input.addEventListener("input", syncBuilder);
      return row;
    }

    function moveRow(row, direction) {
      const sibling = direction === "up" ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling) return;
      if (direction === "up") row.parentElement.insertBefore(row, sibling);
      else row.parentElement.insertBefore(sibling, row);
      syncBuilder();
    }

    function bindRowActions(container) {
      container.addEventListener("click", (event) => {
        const button = event.target.closest("[data-row-action]");
        if (!button) return;
        const row = button.closest(".builder-row");
        if (!row) return;
        const action = button.dataset.rowAction;
        if (action === "remove") {
          row.remove();
          if (!container.children.length) addRow(container.dataset.list);
          syncBuilder();
        } else {
          moveRow(row, action);
        }
      });
    }

    function currentState() {
      return {
        name: els.title.value.trim(),
        slug: builderSlug(els.slug.value),
        category: els.category.value,
        description: els.description.value.trim(),
        prepTime: els.prepTime.value.trim(),
        cookTime: els.cookTime.value.trim(),
        servings: els.servings.value.trim(),
        image: els.image.value.trim(),
        notes: els.notes.value.trim(),
        keywordsText: els.keywords.value.trim(),
        ingredients: rowValues(els.ingredients),
        beforeStart: rowValues(els.beforeStart),
        preparation: rowValues(els.steps),
        tags: selectedBuilderTags(),
        ratingSummary: ratingSummaryState()
      };
    }

    function keywordList(state) {
      return Array.from(new Set([
        ...state.name.split(/\\s+/),
        ...state.category.split(/\\s+/),
        ...state.keywordsText.split(/[,\\s]+/),
        ...state.ingredients.flatMap((line) => line.split(/\\s+/)),
        ...Object.values(state.tags).flatMap((items) => items.flatMap((tag) => tag.split(/\\s+/)))
      ].map(builderSlug).filter(Boolean)));
    }

    function publicRecipeObject() {
      const state = currentState();
      return cleanObject({
        name: state.name,
        slug: state.slug,
        category: state.category,
        description: state.description,
        ingredients: state.ingredients,
        beforeStart: state.beforeStart,
        preparation: state.preparation,
        closing: "Poftă bună!",
        extras: [],
        sourceUrl: "",
        tags: state.tags,
        ratingSummary: state.ratingSummary,
        keywords: keywordList(state)
      });
    }

    function fallbackRecipeObject() {
      const recipe = publicRecipeObject();
      return cleanObject({
        name: recipe.name,
        slug: recipe.slug,
        category: recipe.category,
        sourceUrl: recipe.sourceUrl,
        description: recipe.description,
        beforeStart: recipe.beforeStart,
        preparation: recipe.preparation,
        ingredients: recipe.ingredients,
        closing: recipe.closing,
        extras: recipe.extras,
        tags: recipe.tags,
        ratingSummary: recipe.ratingSummary
      });
    }

    function exportPackage() {
      const state = currentState();
      return {
        recipe: publicRecipeObject(),
        fallbackRecipe: fallbackRecipeObject(),
        builderMeta: {
          prepTime: state.prepTime,
          cookTime: state.cookTime,
          servings: state.servings,
          image: state.image,
          notes: state.notes
        }
      };
    }

    function clearInvalidState() {
      form.querySelectorAll(".is-invalid").forEach((field) => field.classList.remove("is-invalid"));
    }

    function markInvalid(fieldName) {
      const field = form.querySelector('[data-builder-field="' + fieldName + '"]');
      if (field) field.classList.add("is-invalid");
    }

    function validateBuilder(showMessages = true) {
      const state = currentState();
      const messages = [];
      clearInvalidState();
      if (!state.name) {
        messages.push("Titlul este obligatoriu.");
        markInvalid("title");
      }
      if (!state.slug) {
        messages.push("Slug-ul este obligatoriu.");
        markInvalid("slug");
      }
      if (!state.category) {
        messages.push("Categoria este obligatorie.");
        markInvalid("category");
      }
      if (!state.ingredients.length) messages.push("Adaugă cel puțin un ingredient.");
      if (!state.preparation.length) messages.push("Adaugă cel puțin un pas de preparare.");
      if (state.slug && existingSlugs.has(state.slug)) messages.push("Atenție: există deja o rețetă cu acest slug.");
      if (els.validation) els.validation.textContent = showMessages ? messages.join(" ") : "";
      return messages.filter((message) => !message.startsWith("Atenție")).length === 0;
    }

    function renderPreview() {
      const state = currentState();
      const preview = els.preview;
      preview.textContent = "";

      const article = document.createElement("article");
      article.className = "recipe-detail-card builder-preview-card";

      if (state.image) {
        const image = document.createElement("img");
        image.className = "builder-preview-image";
        image.alt = state.name || "Imagine rețetă";
        image.loading = "lazy";
        image.src = state.image;
        article.append(image);
      }

      const badge = createText("span", "pill", state.category || "Categorie");
      const title = createText("h1", "", state.name || "Titlu rețetă");
      const desc = createText("p", "lead", state.description || "Descrierea rețetei va apărea aici.");
      article.append(badge, title, desc);

      const metaValues = [state.prepTime, state.cookTime, state.servings].filter(Boolean);
      if (metaValues.length) {
        const meta = document.createElement("div");
        meta.className = "builder-preview-meta";
        metaValues.forEach((value) => meta.append(createText("span", "", value)));
        article.append(meta);
      }

      if (state.beforeStart.length) {
        const before = document.createElement("section");
        before.className = "builder-preview-section box before-start";
        before.append(createText("h2", "", "Înainte să începi"));
        const list = document.createElement("ul");
        list.className = "before-list";
        state.beforeStart.forEach((line) => {
          const item = document.createElement("li");
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          label.append(input, createText("span", "", line));
          item.append(label);
          list.append(item);
        });
        before.append(list);
        article.append(before);
      }

      if (Object.keys(state.tags).length) {
        const tagsSection = document.createElement("section");
        tagsSection.className = "builder-preview-section box recipe-tags";
        tagsSection.append(createText("h2", "", "Etichete rețetă"));
        const groups = document.createElement("div");
        groups.className = "tag-groups";
        Object.entries(TAG_GROUPS).forEach(([key, config]) => {
          const values = state.tags[key] || [];
          if (!values.length) return;
          const group = document.createElement("div");
          group.className = "tag-group";
          group.append(createText("h3", "", config.label));
          const list = document.createElement("div");
          list.className = "tag-list";
          values.forEach((tag) => list.append(createText("span", "tag-chip", tag)));
          group.append(list);
          groups.append(group);
        });
        tagsSection.append(groups);
        article.append(tagsSection);
      }

      const layout = document.createElement("div");
      layout.className = "recipe-layout";

      const ingredientsBox = document.createElement("section");
      ingredientsBox.className = "box";
      ingredientsBox.append(createText("h2", "", "Ingrediente"));
      const ingredientsList = document.createElement("ul");
      ingredientsList.className = "clean";
      (state.ingredients.length ? state.ingredients : ["Adaugă ingredientele în editor."]).forEach((line) => ingredientsList.append(createText("li", "", line)));
      ingredientsBox.append(ingredientsList);

      const stepsBox = document.createElement("section");
      stepsBox.className = "box";
      stepsBox.append(createText("h2", "", "Mod de preparare"));
      const stepsList = document.createElement("ol");
      stepsList.className = "clean";
      (state.preparation.length ? state.preparation : ["Adaugă pașii de preparare în editor."]).forEach((line) => stepsList.append(createText("li", "", line)));
      stepsBox.append(stepsList);

      layout.append(ingredientsBox, stepsBox);
      article.append(layout);

      if (state.notes) {
        const notes = document.createElement("section");
        notes.className = "builder-preview-section box";
        notes.append(createText("h2", "", "Note"));
        notes.append(createText("p", "", state.notes));
        article.append(notes);
      }

      if (state.ratingSummary) {
        const rating = document.createElement("section");
        rating.className = "builder-preview-section box";
        rating.append(createText("h2", "", "Date evaluări publice"));
        rating.append(createText("p", "rating-note", "Se afișează public doar dacă aceste valori sunt reale."));
        const grid = document.createElement("div");
        grid.className = "rating-summary-grid";
        Object.entries(state.ratingSummary).forEach(([key, value]) => {
          const item = document.createElement("div");
          item.append(createText("span", "", key), createText("strong", "", String(value)));
          grid.append(item);
        });
        rating.append(grid);
        article.append(rating);
      }

      preview.append(article);
    }

    function updateExport() {
      els.exportOutput.value = JSON.stringify(fallbackRecipeObject(), null, 2) + ",";
    }

    function saveDraft(silent = false) {
      window.localStorage.setItem(draftKey, JSON.stringify(exportPackage()));
      if (!silent) setStatus("Ciornă salvată local în acest browser.");
    }

    function scheduleAutosave() {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = window.setTimeout(() => saveDraft(true), 350);
    }

    function syncBuilder() {
      if (els.slug.value !== builderSlug(els.slug.value)) els.slug.value = builderSlug(els.slug.value);
      validateBuilder(false);
      renderPreview();
      updateExport();
      scheduleAutosave();
    }

    function loadFromPackage(payload) {
      const recipe = payload.fallbackRecipe || payload.recipe || payload;
      const meta = payload.builderMeta || {};
      els.title.value = recipe.name || "";
      els.slug.value = recipe.slug || builderSlug(recipe.name || "");
      els.category.value = recipe.category || els.category.value;
      els.description.value = recipe.description || "";
      els.prepTime.value = meta.prepTime || "";
      els.cookTime.value = meta.cookTime || "";
      els.servings.value = meta.servings || "";
      els.image.value = meta.image || "";
      els.notes.value = meta.notes || "";
      els.keywords.value = Array.isArray(recipe.keywords) ? recipe.keywords.join(", ") : "";
      els.ingredients.textContent = "";
      els.beforeStart.textContent = "";
      els.steps.textContent = "";
      const importedTags = normalizedTagGroups(recipe.tags);
      els.tags.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = Boolean(importedTags[input.dataset.tagGroup] && importedTags[input.dataset.tagGroup].includes(input.value));
      });
      Object.entries(els.ratingSummary).forEach(([key, input]) => {
        if (input) input.value = recipe.ratingSummary && recipe.ratingSummary[key] !== undefined ? recipe.ratingSummary[key] : "";
      });
      (Array.isArray(recipe.ingredients) && recipe.ingredients.length ? recipe.ingredients : [""]).forEach((line) => addRow("ingredients", line));
      (Array.isArray(recipe.beforeStart) && recipe.beforeStart.length ? recipe.beforeStart : [""]).forEach((line) => addRow("beforeStart", line));
      (Array.isArray(recipe.preparation) && recipe.preparation.length ? recipe.preparation : [""]).forEach((line) => addRow("steps", line));
      slugTouched = true;
      syncBuilder();
    }

    function resetBuilder() {
      els.title.value = "";
      els.slug.value = "";
      els.description.value = "";
      els.prepTime.value = "";
      els.cookTime.value = "";
      els.servings.value = "";
      els.image.value = "";
      els.notes.value = "";
      els.keywords.value = "";
      els.ingredients.textContent = "";
      els.beforeStart.textContent = "";
      els.steps.textContent = "";
      els.tags.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = false;
      });
      Object.values(els.ratingSummary).forEach((input) => {
        if (input) input.value = "";
      });
      addRow("ingredients");
      addRow("beforeStart");
      addRow("steps");
      slugTouched = false;
      setStatus("Formular resetat.");
      syncBuilder();
    }

    async function copyExport() {
      if (!validateBuilder(true)) {
        setStatus("Completează câmpurile obligatorii înainte de export.");
        return;
      }
      const text = els.exportOutput.value;
      try {
        await navigator.clipboard.writeText(text);
        setStatus("Datele rețetei au fost copiate.");
      } catch {
        els.exportOutput.focus();
        els.exportOutput.select();
        document.execCommand("copy");
        setStatus("Datele rețetei au fost selectate pentru copiere.");
      }
    }

    function downloadJson() {
      if (!validateBuilder(true)) {
        setStatus("Completează câmpurile obligatorii înainte de descărcare.");
        return;
      }
      const state = currentState();
      const blob = new Blob([JSON.stringify(exportPackage(), null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = (state.slug || "reteta-noua") + ".json";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setStatus("Fișier JSON descărcat.");
    }

    function loadDraft() {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) {
        setStatus("Nu există nicio ciornă locală salvată.");
        return;
      }
      try {
        loadFromPackage(JSON.parse(raw));
        setStatus("Ciornă locală încărcată.");
      } catch {
        setStatus("Ciorna locală nu a putut fi citită.");
      }
    }

    function populateCategories() {
      els.category.textContent = "";
      (data.categories || []).forEach((category) => {
        const option = document.createElement("option");
        option.value = category.name;
        option.textContent = category.name;
        els.category.append(option);
      });
    }

    function populateTags() {
      els.tags.textContent = "";
      Object.entries(TAG_GROUPS).forEach(([key, config]) => {
        const group = document.createElement("section");
        group.className = "builder-tag-group";
        group.append(createText("h4", "", config.label));
        const options = document.createElement("div");
        options.className = "builder-tag-options";
        config.options.forEach((tag) => {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = tag;
          input.dataset.tagGroup = key;
          const text = createText("span", "", tag);
          label.append(input, text);
          options.append(label);
        });
        group.append(options);
        els.tags.append(group);
      });
    }

    populateCategories();
    populateTags();
    bindRowActions(els.ingredients);
    bindRowActions(els.beforeStart);
    bindRowActions(els.steps);
    addRow("ingredients");
    addRow("beforeStart");
    addRow("steps");

    form.addEventListener("input", syncBuilder);
    form.addEventListener("change", syncBuilder);
    document.querySelectorAll("[data-add-row]").forEach((button) => {
      button.addEventListener("click", () => {
        addRow(button.dataset.addRow);
        syncBuilder();
      });
    });
    els.title.addEventListener("input", () => {
      if (!slugTouched || !els.slug.value) els.slug.value = builderSlug(els.title.value);
    });
    els.slug.addEventListener("input", () => {
      slugTouched = true;
      els.slug.value = builderSlug(els.slug.value);
    });
    document.getElementById("copyRecipeExport")?.addEventListener("click", copyExport);
    document.getElementById("downloadRecipeJson")?.addEventListener("click", downloadJson);
    document.getElementById("saveRecipeDraft")?.addEventListener("click", () => saveDraft(false));
    document.getElementById("loadRecipeDraft")?.addEventListener("click", loadDraft);
    document.getElementById("resetRecipeBuilder")?.addEventListener("click", resetBuilder);
    els.importInput?.addEventListener("change", async () => {
      const file = els.importInput.files && els.importInput.files[0];
      if (!file) return;
      try {
        loadFromPackage(JSON.parse(await file.text()));
        setStatus("JSON importat.");
      } catch {
        setStatus("Fișierul JSON nu a putut fi importat.");
      } finally {
        els.importInput.value = "";
      }
    });

    const saved = window.localStorage.getItem(draftKey);
    if (saved) {
      try {
        loadFromPackage(JSON.parse(saved));
        setStatus("Ciornă locală încărcată automat.");
      } catch {
        resetBuilder();
      }
    } else {
      syncBuilder();
    }
  }

  function setupRecipeRatings() {
    document.querySelectorAll("[data-rating-panel]").forEach((panel) => {
      const slug = panel.dataset.recipeSlug;
      const form = panel.querySelector("[data-rating-form]");
      const status = panel.querySelector("[data-rating-status]");
      const personalNote = panel.querySelector("[data-rating-personal-note]");
      const reset = panel.querySelector("[data-rating-reset]");
      if (!slug || !form || !status || !personalNote || !reset) return;

      const storageKey = "artaGatituluiRatings:" + slug;

      function setStatus(message, success = false) {
        status.textContent = message || "";
        status.classList.toggle("rating-status-success", Boolean(message && success));
        pulseElement(status);
      }

      function setGroupValue(group, value) {
        const input = form.querySelector('[data-rating-group="' + group + '"] input[value="' + value + '"]');
        if (input) input.checked = true;
      }

      function clearValues() {
        form.querySelectorAll('input[type="radio"]').forEach((input) => {
          input.checked = false;
        });
        personalNote.textContent = "";
      }

      function getGroupValue(group) {
        const checked = form.querySelector('[data-rating-group="' + group + '"] input:checked');
        return checked ? checked.value : "";
      }

      function readRating() {
        const taste = Number(getGroupValue("taste"));
        const clarity = Number(getGroupValue("clarity"));
        const complexity = Number(getGroupValue("complexity"));
        const overall = Number(getGroupValue("overall"));
        const cookAgainRaw = getGroupValue("cookAgain");
        if (!taste || !clarity || !complexity || !overall || !cookAgainRaw) return null;
        return {
          taste,
          clarity,
          complexity,
          cookAgain: cookAgainRaw === "true",
          overall,
          updatedAt: new Date().toISOString()
        };
      }

      function renderPersonalNote(rating) {
        if (!rating || !rating.complexity) {
          personalNote.textContent = "";
          return;
        }
        personalNote.textContent = "Complexitatea ta: " + complexityLabel(rating.complexity) + ".";
      }

      function loadRating() {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return;
        try {
          const rating = JSON.parse(raw);
          ["taste", "clarity", "complexity", "overall"].forEach((group) => {
            if (rating[group]) setGroupValue(group, String(rating[group]));
          });
          if (typeof rating.cookAgain === "boolean") setGroupValue("cookAgain", String(rating.cookAgain));
          renderPersonalNote(rating);
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const rating = readRating();
        if (!rating) {
          setStatus("Alege toate valorile înainte să salvezi evaluarea.");
          return;
        }
        window.localStorage.setItem(storageKey, JSON.stringify(rating));
        renderPersonalNote(rating);
        setStatus("Evaluarea ta a fost salvată pe acest dispozitiv.", true);
      });

      reset.addEventListener("click", () => {
        window.localStorage.removeItem(storageKey);
        clearValues();
        setStatus("Evaluarea ta locală a fost ștearsă.", true);
      });

      loadRating();
    });
  }

  function setupInstallPrompt() {
    const prompt = document.getElementById("installPrompt");
    const installButton = prompt?.querySelector("[data-install-action]");
    const dismissButton = prompt?.querySelector("[data-install-dismiss]");
    const help = prompt?.querySelector("[data-install-help]");
    if (!prompt || !installButton || !dismissButton) return;

    const dismissedKey = "arta-gatitului-install-dismissed";
    let deferredPrompt = null;
    let nativePromptAvailable = false;

    function isInstalled() {
      return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }

    function hide() {
      prompt.hidden = true;
    }

    function showFallbackHint() {
      if (isInstalled() || window.localStorage.getItem(dismissedKey) === "true" || nativePromptAvailable) return;
      if (help) {
        help.hidden = false;
        help.textContent = "Pe Android folosește meniul browserului și alege Adaugă pe ecranul principal. Pe iPhone: Partajare, apoi Adaugă la ecranul principal.";
      }
      installButton.textContent = "Cum instalez?";
      prompt.hidden = false;
    }

    if (isInstalled() || window.localStorage.getItem(dismissedKey) === "true") hide();

    window.addEventListener("beforeinstallprompt", (event) => {
      if (window.localStorage.getItem(dismissedKey) === "true") return;
      event.preventDefault();
      nativePromptAvailable = true;
      deferredPrompt = event;
      if (help) help.hidden = true;
      installButton.textContent = "Instalează";
      prompt.hidden = false;
    });

    installButton.addEventListener("click", async () => {
      if (!deferredPrompt) {
        showFallbackHint();
        return;
      }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      hide();
    });

    dismissButton.addEventListener("click", () => {
      window.localStorage.setItem(dismissedKey, "true");
      hide();
    });

    window.addEventListener("appinstalled", () => {
      window.localStorage.setItem(dismissedKey, "true");
      hide();
    });

    window.setTimeout(showFallbackHint, 2200);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(root + "service-worker.js", { scope: root || "./" }).catch(() => {});
    });
  }

  function setupMobileMenu() {
    const btn = document.querySelector(".mobile-menu-btn");
    const links = document.querySelector(".nav-links");
    if (!btn || !links) return;

    function setOpen(open) {
      links.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    }

    btn.addEventListener("click", () => {
      setOpen(!links.classList.contains("open"));
    });

    links.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
  }

  function markActiveNav() {
    const current = window.location.pathname.replace(/\\/index\\.html$/, "/");
    document.querySelectorAll(".nav-primary a, .nav-links a").forEach((link) => {
      const path = new URL(link.href).pathname.replace(/\\/index\\.html$/, "/");
      if (path === current) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
    });
  }

  function setupScrollReveal() {
    if (prefersReducedMotion) return;
    document.documentElement.classList.add("reveal-ready");
    if (!("IntersectionObserver" in window)) {
      markRevealTargets(document);
      document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-revealed"));
      return;
    }
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    document.querySelectorAll(".grid").forEach(applyStagger);
    markRevealTargets(document);
  }

  function setupPointerEffects() {
    if (prefersReducedMotion) return;
    const canHover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!canHover) return;
    const selector = ".card, .category-card, .btn, .nav-tool, .tag-chip, .ingredient-chip, .match-chip";
    document.addEventListener("pointermove", (event) => {
      const el = event.target.closest(selector);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      el.style.setProperty("--mx", x + "px");
      el.style.setProperty("--my", y + "px");
      if (el.classList.contains("recipe-card") || el.classList.contains("category-card")) {
        const tiltY = ((x / rect.width) - .5) * 5;
        const tiltX = ((y / rect.height) - .5) * -5;
        el.style.setProperty("--tilt-x", tiltX.toFixed(2) + "deg");
        el.style.setProperty("--tilt-y", tiltY.toFixed(2) + "deg");
        el.classList.add("is-pointer-active");
      }
    });
    document.addEventListener("pointerout", (event) => {
      const el = event.target.closest(selector);
      if (!el) return;
      el.classList.remove("is-pointer-active");
      el.style.removeProperty("--tilt-x");
      el.style.removeProperty("--tilt-y");
    });
  }

  function setupHeroSurprise() {
    const button = document.getElementById("surpriseRecipeButton");
    if (!button) return;
    button.addEventListener("click", () => {
      const recipe = pickRandom(data.recipes);
      if (recipe) window.location.href = recipeUrl(recipe.slug);
    });
  }

  function commandRecords() {
    const pages = [
      { type: "Pagini", code: "PG", title: "Acasă", meta: "Pagina principală", url: root + "index.html" },
      { type: "Pagini", code: "PG", title: "Portofoliu", meta: "Toate categoriile", url: root + "portofoliu/" },
      { type: "Pagini", code: "PG", title: "Ce pot găti?", meta: "Potrivire după ingrediente", url: root + "ce-pot-gati.html" },
      { type: "Pagini", code: "PG", title: "Randomizer", meta: "Meniu complet aleatoriu", url: root + "randomizer/" },
      { type: "Pagini", code: "PG", title: "Caută", meta: "Căutare în rețete", url: root + "cauta.html" },
      { type: "Pagini", code: "PG", title: "Creator rețetă", meta: "Adaugă o rețetă local", url: root + "adauga-reteta.html" }
    ];
    const recipes = data.recipes.map((recipe) => ({
      type: "Rețete",
      code: "RT",
      title: recipe.name,
      meta: recipe.category,
      url: recipeUrl(recipe.slug),
      tokens: recipeSearchTokens(recipe)
    }));
    const categories = data.categories.map((category) => ({
      type: "Categorii",
      code: categoryIcon(category.name),
      title: category.name,
      meta: category.description,
      url: categoryUrl(category.slug),
      tokens: new Set(tokenizeText(category.name + " " + category.description))
    }));
    const tagNames = Array.from(new Set(data.recipes.flatMap(flatTags))).sort((a, b) => a.localeCompare(b, "ro"));
    const tags = tagNames.map((tag) => ({
      type: "Etichete",
      code: "ET",
      title: tag,
      meta: "Filtrează după etichetă",
      url: searchUrl(tag),
      tokens: new Set(tokenizeText(tag))
    }));
    return [...recipes, ...categories, ...tags, ...pages.map((page) => ({
      ...page,
      tokens: new Set(tokenizeText(page.title + " " + page.meta))
    }))];
  }

  function setupCommandPalette() {
    const palette = document.getElementById("commandPalette");
    const input = document.getElementById("commandPaletteInput");
    const results = document.getElementById("commandPaletteResults");
    const openers = document.querySelectorAll("[data-open-command]");
    if (!palette || !input || !results) return;

    const records = commandRecords();
    let activeIndex = 0;
    let visible = [];
    let previousFocus = null;
    let openedAt = 0;

    function isTypingTarget(target) {
      return target && (target.matches("input, textarea, select") || target.isContentEditable);
    }

    function recordMatches(record, tokens) {
      if (!tokens.length) return true;
      return tokens.every((token) => record.tokens.has(token));
    }

    function render() {
      const tokens = tokenizeText(input.value);
      visible = records
        .filter((record) => recordMatches(record, tokens))
        .slice(0, tokens.length ? 18 : 12);
      activeIndex = Math.min(activeIndex, Math.max(visible.length - 1, 0));
      if (!visible.length) {
        results.innerHTML = '<div class="empty">Nu am găsit rezultate.</div>';
        input.removeAttribute("aria-activedescendant");
        return;
      }
      let lastType = "";
      results.innerHTML = visible.map((record, index) => {
        const section = record.type !== lastType ? '<div class="command-section-title">' + escapeHtml(record.type) + '</div>' : "";
        lastType = record.type;
        const id = "command-result-" + index;
        return section +
          '<button class="command-item' + (index === activeIndex ? ' is-active' : '') + '" id="' + id + '" type="button" role="option" aria-selected="' + (index === activeIndex ? "true" : "false") + '" data-command-index="' + index + '">' +
          '<span class="command-type" aria-hidden="true">' + escapeHtml(record.code) + '</span>' +
          '<span><span class="command-title">' + escapeHtml(record.title) + '</span><span class="command-meta">' + escapeHtml(record.meta || record.type) + '</span></span>' +
          '</button>';
      }).join("");
      input.setAttribute("aria-activedescendant", "command-result-" + activeIndex);
      applyStagger(results);
    }

    function openCommand(trigger) {
      previousFocus = trigger || document.activeElement;
      openedAt = Date.now();
      palette.hidden = false;
      palette.setAttribute("aria-hidden", "false");
      document.body.classList.add("command-open");
      input.value = "";
      render();
      window.setTimeout(() => input.focus(), 0);
    }

    function closeCommand(force = false) {
      if (!force && Date.now() - openedAt < 180) return;
      palette.hidden = true;
      palette.setAttribute("aria-hidden", "true");
      document.body.classList.remove("command-open");
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    }

    function openActive() {
      const record = visible[activeIndex];
      if (record) window.location.href = record.url;
    }

    function bindOpenButton(button) {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCommand(button);
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (palette.hidden) openCommand(button);
      });
    }

    openers.forEach(bindOpenButton);
    function handleOpenGesture(event) {
      const button = event.target.closest("[data-open-command]");
      if (!button || palette.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      if (palette.hidden) openCommand(button);
    }

    document.addEventListener("pointerdown", handleOpenGesture, true);
    document.addEventListener("click", handleOpenGesture, true);
    palette.querySelector("[data-command-backdrop]")?.addEventListener("pointerdown", () => closeCommand());
    palette.querySelectorAll("[data-command-close]").forEach((button) => button.addEventListener("click", () => closeCommand(true)));
    input.addEventListener("input", () => {
      activeIndex = 0;
      render();
    });
    results.addEventListener("click", (event) => {
      const item = event.target.closest("[data-command-index]");
      if (!item) return;
      activeIndex = Number(item.dataset.commandIndex) || 0;
      openActive();
    });
    document.addEventListener("keydown", (event) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !isTypingTarget(event.target);
      if ((isShortcut || isSlash) && palette.hidden) {
        event.preventDefault();
        openCommand(document.activeElement);
        return;
      }
      if (palette.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeCommand(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        activeIndex = Math.min(activeIndex + 1, visible.length - 1);
        render();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        render();
      } else if (event.key === "Enter") {
        event.preventDefault();
        openActive();
      }
    });
  }

  function setupThemeSwitcher() {
    const panel = document.getElementById("themePanel");
    const toggle = document.querySelector("[data-theme-toggle]");
    if (!panel || !toggle) return;
    const buttons = Array.from(panel.querySelectorAll("[data-theme-choice]"));

    function applyTheme(theme) {
      if (theme) {
        document.documentElement.dataset.theme = theme;
        window.localStorage.setItem(THEME_KEY, theme);
      } else {
        document.documentElement.removeAttribute("data-theme");
        window.localStorage.removeItem(THEME_KEY);
      }
      buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme)));
    }

    function setOpen(open) {
      panel.hidden = !open;
      panel.setAttribute("aria-hidden", String(!open));
      toggle.setAttribute("aria-expanded", String(open));
    }

    applyTheme(window.localStorage.getItem(THEME_KEY) || document.documentElement.dataset.theme || "");
    toggle.addEventListener("click", () => setOpen(panel.hidden));
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(button.dataset.themeChoice || "");
        setOpen(false);
      });
    });
    document.addEventListener("click", (event) => {
      if (panel.hidden) return;
      if (!panel.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
  }

  function setupQuickActions() {
    if (document.querySelector(".quick-actions")) return;
    const hasRating = Boolean(document.querySelector("[data-rating-panel]"));
    const wrap = document.createElement("div");
    wrap.className = "quick-actions";
    wrap.setAttribute("aria-label", "Acțiuni rapide");
    wrap.innerHTML = [
      '<button class="quick-action" type="button" data-quick-top aria-label="Sus" title="Sus">↑</button>',
      '<button class="quick-action" type="button" data-open-command aria-label="Caută rapid" title="Caută rapid">K</button>',
      '<button class="quick-action" type="button" data-quick-random aria-label="Rețetă aleatorie" title="Rețetă aleatorie">R</button>',
      hasRating ? '<button class="quick-action" type="button" data-quick-rate aria-label="Evaluează rețeta" title="Evaluează">★</button>' : "",
      '<button class="quick-action" type="button" data-quick-copy aria-label="Copiază linkul" title="Copiază linkul">⧉</button>',
      '<span class="quick-action-status" data-quick-status hidden></span>'
    ].join("");
    document.body.append(wrap);
    const status = wrap.querySelector("[data-quick-status]");
    function flash(message) {
      if (!status) return;
      status.textContent = message;
      status.hidden = false;
      window.setTimeout(() => {
        status.hidden = true;
      }, 1400);
    }
    wrap.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.matches("[data-quick-top]")) {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
      } else if (button.matches("[data-quick-random]")) {
        const recipe = pickRandom(data.recipes);
        if (recipe) window.location.href = recipeUrl(recipe.slug);
      } else if (button.matches("[data-quick-rate]")) {
        const rating = document.querySelector("[data-rating-panel]");
        if (rating) rating.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
      } else if (button.matches("[data-quick-copy]")) {
        try {
          await navigator.clipboard.writeText(window.location.href);
          flash("Copiat!");
        } catch {
          flash("Selectează linkul din bară.");
        }
      }
    });
  }

  function setupScrollProgress() {
    const progress = document.querySelector("[data-scroll-progress]");
    if (!progress || !document.body.dataset.recipeSlug) return;
    const bar = progress.querySelector("span");
    progress.classList.add("is-visible");
    let ticking = false;
    function update() {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const value = Math.min(100, Math.max(0, (window.scrollY / max) * 100));
      progress.style.setProperty("--progress", value.toFixed(2) + "%");
      if (bar) bar.style.width = value.toFixed(2) + "%";
      ticking = false;
    }
    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    update();
  }

  function setupOfflineBadge() {
    const badge = document.getElementById("offlineBadge");
    if (!badge) return;
    function update() {
      badge.hidden = navigator.onLine !== false;
    }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  }

  function setupBeforeStartChecklist() {
    document.addEventListener("change", (event) => {
      const input = event.target.closest(".before-list input[type='checkbox']");
      if (!input) return;
      const label = input.closest("label");
      if (!label) return;
      label.classList.toggle("is-checked", input.checked);
      if (input.checked) pulseElement(label);
    });
  }

  function setupPageTransitions() {
    document.body.classList.add("page-loaded");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.addEventListener("pageshow", () => {
      document.body.classList.remove("page-leaving");
      document.body.classList.add("page-loaded");
    });

    if (prefersReducedMotion) return;

    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest("a[href]");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const samePageAnchor = url.pathname === window.location.pathname && url.search === window.location.search && url.hash;
      if (samePageAnchor || url.href === window.location.href) return;

      event.preventDefault();
      document.body.classList.remove("page-loaded");
      document.body.classList.add("page-leaving");

      window.setTimeout(() => {
        window.location.href = url.href;
      }, 280);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupPageTransitions();
    setupMobileMenu();
    markActiveNav();
    setupThemeSwitcher();
    renderFeatured();
    renderAllRecipes();
    renderCategories();
    setupSearch();
    setupPrefilledSearch();
    setupIngredientMatcher();
    renderRecipeDetail();
    setupRecipeRatings();
    renderCategoryPage();
    setupRandomizer();
    setupSteakCalculators();
    setupRecipeBuilder();
    setupHeroSurprise();
    setupBeforeStartChecklist();
    setupQuickActions();
    setupCommandPalette();
    setupScrollProgress();
    setupScrollReveal();
    setupPointerEffects();
    setupOfflineBadge();
    setupInstallPrompt();
    registerServiceWorker();
  });
})();
`;
}

function manifestFile() {
  return JSON.stringify({
    name: SITE_NAME,
    short_name: 'Rețete',
    description: 'Rețete de acasă, căutare după ingrediente și idei de meniu.',
    id: './',
    start_url: './',
    scope: './',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#0f1117',
    theme_color: '#0f1117',
    categories: ['food', 'lifestyle'],
    prefer_related_applications: false,
    icons: [
      { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }, null, 2) + '\n';
}

function serviceWorkerFile(recipes, categories) {
  const cacheName = `arta-gatitului-${Date.now()}`;
  const coreAssets = Array.from(new Set([
    './',
    'index.html',
    'cauta.html',
    'ce-pot-gati.html',
    'categorii.html',
    'adauga-reteta.html',
    'offline.html',
    'manifest.json',
    'manifest.webmanifest',
    'assets/css/style.css',
    `assets/css/style.css?v=${BUILD_VERSION}`,
    'assets/js/recipes.js',
    `assets/js/recipes.js?v=${BUILD_VERSION}`,
    'assets/js/site.js',
    `assets/js/site.js?v=${BUILD_VERSION}`,
    'assets/icons/icon.png',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png',
    'portofoliu/',
    'randomizer/',
    ...categories.flatMap((category) => [`${category.slug}/`, `categorie/${category.slug}/`]),
    ...recipes.map((recipe) => `retete/${recipe.slug}/`),
  ]));

  return `const CACHE_NAME = ${JSON.stringify(cacheName)};
const CORE_ASSETS = ${JSON.stringify(coreAssets, null, 2)};
const OFFLINE_URL = "offline.html";

function cacheUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS.map(cacheUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("arta-gatitului-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(cacheUrl(OFFLINE_URL));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cached) => cached || fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached))
  );
});
`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng({ width, height, pixels }) {
  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * rowLength] = 0;
    pixels.copy(raw, y * rowLength + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND'),
  ]);
}

function parsePng(buffer) {
  if (buffer.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('icon.png must be a PNG file.');
  }

  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
    const data = buffer.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!header || header.bitDepth !== 8 || header.colorType !== 6 || header.interlace !== 0) {
    throw new Error('icon.png must be an 8-bit RGBA, non-interlaced PNG.');
  }

  const bytesPerPixel = 4;
  const stride = header.width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(header.width * header.height * bytesPerPixel);
  let source = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = inflated[source];
    source += 1;
    for (let x = 0; x < stride; x += 1) {
      const current = inflated[source + x];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      let value = current;
      if (filter === 1) value = current + left;
      else if (filter === 2) value = current + up;
      else if (filter === 3) value = current + Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = current + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }
      pixels[y * stride + x] = value & 0xff;
    }
    source += stride;
  }

  return { ...header, pixels };
}

function resizePng(buffer, size) {
  const source = parsePng(buffer);
  if (source.width === size && source.height === size) return buffer;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor((y / size) * source.height));
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor((x / size) * source.width));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (y * size + x) * 4;
      source.pixels.copy(pixels, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return encodePng({ width: size, height: size, pixels });
}

async function writeFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

async function writeBinary(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

async function main() {
  const inventory = JSON.parse(await fs.readFile(INVENTORY_PATH, 'utf8'));
  const markdown = await fs.readFile(RECIPES_MD_PATH, 'utf8');
  const sections = readRecipeSections(markdown);
  const soonSection = sections.find((section) => section.url.endsWith('/soon-to-come'));
  const categoryMap = buildCategoryMap(inventory);
  const recipes = mergeRecipes(sections.map(splitRecipe), categoryMap);
  const categories = Object.values(CATEGORY_PAGES);
  const sourceIcon = await fs.readFile(SOURCE_ICON_PATH);

  await writeFile(path.join(ROOT, 'assets', 'js', 'recipes.js'), dataFile(categories, recipes));
  await writeFile(path.join(ROOT, 'assets', 'js', 'site.js'), jsFile());
  await writeFile(path.join(ROOT, 'assets', 'css', 'style.css'), cssFile());
  await writeFile(path.join(ROOT, 'manifest.json'), manifestFile());
  await writeFile(path.join(ROOT, 'manifest.webmanifest'), manifestFile());
  await writeFile(path.join(ROOT, 'service-worker.js'), serviceWorkerFile(recipes, categories));
  await writeBinary(path.join(ROOT, 'assets', 'icons', 'icon.png'), sourceIcon);
  await writeBinary(path.join(ROOT, 'assets', 'icons', 'icon-192.png'), resizePng(sourceIcon, 192));
  await writeBinary(path.join(ROOT, 'assets', 'icons', 'icon-512.png'), resizePng(sourceIcon, 512));

  await writeFile(path.join(ROOT, 'index.html'), homePage());
  await writeFile(path.join(ROOT, 'adauga-reteta.html'), recipeBuilderPage());
  await writeFile(path.join(ROOT, 'categorii.html'), categoriesIndexPage());
  await writeFile(path.join(ROOT, 'cauta.html'), searchPage());
  await writeFile(path.join(ROOT, 'ce-pot-gati.html'), ingredientMatcherPage());
  await writeFile(path.join(ROOT, 'offline.html'), offlinePage());
  await writeFile(path.join(ROOT, 'portofoliu', 'index.html'), portfolioPage());
  await writeFile(path.join(ROOT, 'randomizer', 'index.html'), randomizerPage());
  if (soonSection) {
    await writeFile(path.join(ROOT, 'soon-to-come', 'index.html'), soonPage(soonSection));
  }

  for (const category of categories) {
    await writeFile(path.join(ROOT, 'categorie', category.slug, 'index.html'), categoryPage(category));
    await writeFile(path.join(ROOT, category.slug, 'index.html'), categoryPage(category, '../'));
  }

  const recipeBySlug = new Map(recipes.map((recipe) => [recipe.slug, recipe]));
  for (const recipe of recipes) {
    await writeFile(path.join(ROOT, 'retete', recipe.slug, 'index.html'), recipePage(recipe));
    await writeFile(path.join(ROOT, recipe.slug, 'index.html'), recipePage(recipe, '../'));
  }

  for (const [alias, target] of Object.entries(RECIPE_ALIASES)) {
    const recipe = recipeBySlug.get(target);
    if (recipe) {
      await writeFile(path.join(ROOT, 'retete', alias, 'index.html'), recipePage(recipe, '../../', alias));
      await writeFile(path.join(ROOT, alias, 'index.html'), recipePage(recipe, '../', alias));
    }
  }

  console.log(`Generated ${recipes.length} recipes, ${categories.length} categories, and ${Object.keys(RECIPE_ALIASES).length} aliases.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
