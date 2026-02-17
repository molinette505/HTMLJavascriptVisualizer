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

## Integration iframe

API globale exposee dans la page:
- `window.loadVisualizerContent(payload)`
- alias: `window.setVisualizerContent(payload)`

`payload` supporte:
- `js` ou `code`: code JavaScript de depart
- `html` ou `domHtml`: HTML de depart pour le DOM virtuel
- `label` (optionnel): texte de log
- `clearConsole` (optionnel, defaut `true`)
- `run` (optionnel, defaut `false`)

Exemple (parent -> iframe, meme origine):

```js
const iframe = document.getElementById('viz');
iframe.contentWindow.loadVisualizerContent({
  js: 'let a = 1; console.log(a);',
  html: '<body><h1 id="title">Demo</h1></body>',
  run: false
});
```

Exemple via `postMessage`:

```js
iframe.contentWindow.postMessage({
  type: 'visualizer:load-content',
  payload: {
    js: 'console.log(\"Bonjour\")',
    html: '<body><div id="app"></div></body>'
  }
}, '*');
```
