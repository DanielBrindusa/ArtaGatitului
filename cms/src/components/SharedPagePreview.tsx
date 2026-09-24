import { useMemo } from 'react';
import siteStyles from '../../../assets/css/style.css?raw';
import {
  renderBlockTree,
  renderLayoutTokenCss,
} from '../../../src/shared/index.mjs';
import type { PageDraft } from '../drafts/draftModel.mjs';
import { draftToPageSource } from '../drafts/draftModel.mjs';
import { publishedCategories, publishedRecipeCatalog } from '../editor/contentCatalog';
import type { PreviewViewport } from './SharedRecipePreview';

interface SharedPagePreviewProps {
  viewport: PreviewViewport;
  draft: PageDraft;
  localImageUrls?: Record<string, string>;
  compact?: boolean;
}

export function SharedPagePreview({ viewport, draft, localImageUrls = {}, compact = false }: SharedPagePreviewProps) {
  const sourceDocument = useMemo(() => {
    const page = draftToPageSource(draft);
    const markup = renderBlockTree(page.layout.blocks, {
      page,
      recipes: publishedRecipeCatalog,
      categories: publishedCategories,
      root: '#',
      localImageUrls,
    });
    return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data: blob:; font-src data:">
  <style>${siteStyles}\n${renderLayoutTokenCss()}\nbody{min-height:100vh}.content-block{min-width:0}.content-block-section{display:grid}.page-columns{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:var(--space-md)}.page-column{grid-column:span 12}.page-column-desktop-3{grid-column:span 3}.page-column-desktop-4{grid-column:span 4}.page-column-desktop-6{grid-column:span 6}.page-column-desktop-8{grid-column:span 8}.page-column-desktop-9{grid-column:span 9}@media(max-width:900px){.page-column{grid-column:span 12}.page-column-tablet-3{grid-column:span 3}.page-column-tablet-4{grid-column:span 4}.page-column-tablet-6{grid-column:span 6}.page-column-tablet-8{grid-column:span 8}.page-column-tablet-9{grid-column:span 9}}@media(max-width:640px){.page-column{grid-column:span 12!important}}</style>
</head>
<body><main id="main-content">${markup}</main></body>
</html>`;
  }, [draft, localImageUrls]);

  return (
    <div className={`shared-preview shared-preview-${viewport}${compact ? ' shared-preview-compact' : ''}`}>
      <iframe loading="eager" referrerPolicy="no-referrer" sandbox="" srcDoc={sourceDocument} title="Previzualizare pagină redată cu rendererul comun" />
    </div>
  );
}
