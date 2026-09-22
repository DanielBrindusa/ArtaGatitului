import { useMemo } from 'react';
import siteStyles from '../../../assets/css/style.css?raw';
import blockSchema from '../../../src/schema/block.schema.json';
import {
  renderBlockTree,
  renderLayoutTokenCss,
} from '../../../src/shared/index.mjs';
import { demoRecipe, demoRecipeBlocks } from '../preview/demoContent';

export type PreviewViewport = 'desktop' | 'tablet' | 'mobile';

interface SharedRecipePreviewProps {
  viewport: PreviewViewport;
  compact?: boolean;
}

export function SharedRecipePreview({ viewport, compact = false }: SharedRecipePreviewProps) {
  const sourceDocument = useMemo(() => {
    const markup = renderBlockTree(demoRecipeBlocks, {
      recipe: demoRecipe,
      recipes: [demoRecipe],
      root: '#',
    });

    return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src data:">
  <style>${siteStyles}\n${renderLayoutTokenCss()}\nbody{min-height:100vh}.content-block{min-width:0}.content-block-section{display:grid}</style>
</head>
<body>
  <main class="section" id="main-content">${markup}</main>
</body>
</html>`;
  }, []);

  return (
    <div className={`shared-preview shared-preview-${viewport}${compact ? ' shared-preview-compact' : ''}`}>
      <iframe
        data-block-schema={blockSchema.$id}
        loading="eager"
        referrerPolicy="no-referrer"
        sandbox=""
        srcDoc={sourceDocument}
        title="Previzualizare rețetă redată cu rendererul comun"
      />
    </div>
  );
}
