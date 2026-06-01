# Arta Gătitului — GitHub Pages static site

This is a clean static replacement for the GoDaddy website.

It uses only:

- HTML
- CSS
- JavaScript
- one central recipe data file

No backend, no database, no GoDaddy, no WordPress.

## Very important

I could not reliably fetch the live GoDaddy website from this environment, so this package uses the recipe/category information already available from the conversation and creates a complete GitHub Pages structure around it.

You should review the recipe text and replace/add any missing preparation steps with the exact text from your current GoDaddy pages.

## How the site works

The file below is the single source of truth:

```text
assets/js/recipes.js
```

The homepage, search page, category pages and recipe pages all read from this same file.

This means you do **not** maintain a separate search list and separate recipe pages. You maintain the recipe once in `recipes.js`.

## Included pages

- `index.html`
- `cauta.html`
- `categorii.html`
- category pages in `categorie/.../index.html`
- recipe pages in `retete/.../index.html`

## How to upload to GitHub Pages

1. Create a new GitHub repository.
2. Upload all files from this folder into the repository.
3. Open the repository on GitHub.
4. Go to **Settings**.
5. Go to **Pages**.
6. Under **Build and deployment**, choose:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/root**
7. Save.
8. GitHub will give you a public link after deployment.

## How to add a new recipe

Open:

```text
assets/js/recipes.js
```

Inside `recipes`, add a new object like this:

```javascript
{
  "name": "Numele rețetei",
  "slug": "numele-retetei",
  "category": "Fel secundar",
  "description": "Descriere scurtă.",
  "ingredients": [
    "ingredient 1",
    "ingredient 2"
  ],
  "steps": [
    "Pasul 1.",
    "Pasul 2."
  ],
  "keywords": ["cuvânt", "ingredient"]
}
```

Then create the recipe folder:

```text
retete/numele-retetei/index.html
```

Copy an existing recipe page and change only this part in the `<body>` tag:

```html
<body data-recipe-slug="numele-retetei">
```

## How to add a new category

1. Add it in `assets/js/recipes.js` under `categories`.
2. Create a folder under `categorie/your-category-slug/index.html`.
3. Copy an existing category page and change:

```html
<body data-category-slug="your-category-slug">
```

## Local preview

You can open `index.html` directly in your browser.

For the most realistic preview, run a tiny local server from the folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```
