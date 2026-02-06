# HTMLJavascriptVisualizer

Refactor en cours vers stack moderne:
- `Vite` pour le dev/build
- `TypeScript` en source (`src/`)
- `Vitest` pour les tests de regression
- Build single-file HTML pour distribution etudiante

## Commandes

- `npm install`
- `npm run dev`
- `npm run test`
- `npm run build`
- `npm run build:student`

## Distribution

Le fichier distribuable est:
- `dist/index.html`
- et une copie nommee `dist/javascriptEngineVisualizerMobile.html` via `npm run build:student`
