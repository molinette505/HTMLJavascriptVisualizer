// @ts-nocheck
import { Interpreter } from '../core/interpreter';
import { SCENARIOS } from '../core/scenarios';
import { createVirtualDocument } from '../core/virtualDom';
import { ui, consoleUI } from './ui';
import { editor } from './editor';

const EDITOR_MODES = ['html', 'css', 'js'];
const isEditorMode = (mode) => EDITOR_MODES.includes(mode);
const DRAWER_TABS = ['memory', 'console', 'dom'];
const normalizeDrawerTab = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'output') return 'console';
    if (normalized === 'render') return 'dom';
    return DRAWER_TABS.includes(normalized) ? normalized : null;
};

const normalizeLineBreaks = (text) => String(text || '').replace(/\r\n?/g, '\n');
const stripEdgeBlankLines = (text) => String(text || '').replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');
const stripTrailingSpaces = (text) => String(text || '').replace(/[ \t]+$/gm, '');
const dedentCommonIndent = (text) => {
    const lines = String(text || '').split('\n');
    const nonEmpty = lines.filter((line) => line.trim().length > 0);
    if (nonEmpty.length === 0) return String(text || '');
    const minIndent = nonEmpty.reduce((min, line) => {
        const match = line.match(/^[ \t]*/);
        const indent = match ? match[0].length : 0;
        return Math.min(min, indent);
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(minIndent) || minIndent <= 0) return String(text || '');
    return lines.map((line) => {
        if (line.trim().length === 0) return '';
        return line.slice(minIndent);
    }).join('\n');
};
const formatLoadedText = (text, mode = 'js') => {
    const normalized = dedentCommonIndent(stripTrailingSpaces(stripEdgeBlankLines(normalizeLineBreaks(text))));
    if (mode === 'html') return normalized || '<body></body>';
    return normalized;
};

const extractScenarioHtml = (rawHtml) => {
    const source = String(rawHtml || '').trim();
    if (!source) return { code: '', css: '', domHtml: '<body></body>' };

    const scriptBlocks = [];
    const styleBlocks = [];
    const withoutScripts = source.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, content = '') => {
        scriptBlocks.push(formatLoadedText(content, 'js'));
        return '';
    });
    const withoutScriptsAndStyles = withoutScripts.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, content = '') => {
        styleBlocks.push(formatLoadedText(content, 'css'));
        return '';
    });

    const code = formatLoadedText(scriptBlocks.join('\n\n'), 'js');
    const css = formatLoadedText(styleBlocks.join('\n\n'), 'css');
    const domHtml = formatLoadedText(withoutScriptsAndStyles, 'html');
    return { code, css, domHtml };
};

const setEditorCode = (nextCode) => {
    const input = document.getElementById('code-input');
    if (!input) return;
    input.value = nextCode;
    editor.history = [nextCode];
    editor.historyIdx = 0;
    editor.adjustHeight();
    editor.refresh();
};

const normalizeExternalContent = (payload) => {
    let code = null;
    let domHtml = null;
    let css = null;
    const cssChunks = [];
    let label = 'Externe';
    let clearConsole = true;
    let run = false;
    let uiOptions = null;
    let initialEditorMode = null;
    let initialDrawerTab = null;

    if (typeof payload === 'string') {
        code = formatLoadedText(payload, 'js');
    } else if (payload && typeof payload === 'object') {
        if (typeof payload.js === 'string') code = formatLoadedText(payload.js, 'js');
        else if (typeof payload.code === 'string') code = formatLoadedText(payload.code, 'js');

        if (typeof payload.html === 'string') {
            const parsed = extractScenarioHtml(payload.html);
            domHtml = parsed.domHtml;
            if (code === null && parsed.code) code = parsed.code;
            if (parsed.css) cssChunks.push(parsed.css);
        } else if (typeof payload.domHtml === 'string') {
            domHtml = formatLoadedText(payload.domHtml || '<body></body>', 'html');
        }
        if (typeof payload.css === 'string') cssChunks.push(formatLoadedText(payload.css, 'css'));
        else if (typeof payload.domCss === 'string') cssChunks.push(formatLoadedText(payload.domCss, 'css'));

        if (typeof payload.label === 'string' && payload.label.trim()) label = payload.label.trim();
        else if (typeof payload.source === 'string' && payload.source.trim()) label = payload.source.trim();
        else if (typeof payload.title === 'string' && payload.title.trim()) label = payload.title.trim();

        if (typeof payload.clearConsole === 'boolean') clearConsole = payload.clearConsole;
        if (typeof payload.run === 'boolean') run = payload.run;
        if (payload.ui && typeof payload.ui === 'object') uiOptions = payload.ui;
        if (
            typeof payload.p5ModeEnabled === 'boolean'
            || typeof payload.p5Enabled === 'boolean'
            || Object.prototype.hasOwnProperty.call(payload, 'p5FrameRate')
            || Object.prototype.hasOwnProperty.call(payload, 'p5Fps')
            || Object.prototype.hasOwnProperty.call(payload, 'p5DeltaTime')
            || Object.prototype.hasOwnProperty.call(payload, 'p5DeltaTimeMs')
            || Object.prototype.hasOwnProperty.call(payload, 'p5FrameDelay')
            || Object.prototype.hasOwnProperty.call(payload, 'p5FrameDelayMs')
        ) {
            const extraUi = uiOptions && typeof uiOptions === 'object' ? { ...uiOptions } : {};
            if (typeof payload.p5ModeEnabled === 'boolean') extraUi.p5ModeEnabled = payload.p5ModeEnabled;
            else if (typeof payload.p5Enabled === 'boolean') extraUi.p5ModeEnabled = payload.p5Enabled;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5FrameRate')) extraUi.p5FrameRate = payload.p5FrameRate;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5Fps')) extraUi.p5FrameRate = payload.p5Fps;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5DeltaTime')) extraUi.p5DeltaTime = payload.p5DeltaTime;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5DeltaTimeMs')) extraUi.p5DeltaTimeMs = payload.p5DeltaTimeMs;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5FrameDelay')) extraUi.p5FrameDelayMs = payload.p5FrameDelay;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5FrameDelayMs')) extraUi.p5FrameDelayMs = payload.p5FrameDelayMs;
            uiOptions = extraUi;
        }

        const editorCandidate = (typeof payload.editor === 'string')
            ? payload.editor
            : ((typeof payload.editorMode === 'string') ? payload.editorMode : ((typeof payload.startEditor === 'string') ? payload.startEditor : null));
        if (editorCandidate) {
            const normalizedEditor = String(editorCandidate).trim().toLowerCase();
            if (isEditorMode(normalizedEditor)) initialEditorMode = normalizedEditor;
        }

        const tabCandidate = (typeof payload.tab === 'string')
            ? payload.tab
            : ((typeof payload.drawerTab === 'string')
                ? payload.drawerTab
                : ((typeof payload.startTab === 'string')
                    ? payload.startTab
                    : ((typeof payload.panel === 'string')
                        ? payload.panel
                        : ((typeof payload.view === 'string') ? payload.view : null))));
        if (tabCandidate) initialDrawerTab = normalizeDrawerTab(tabCandidate);

        if (uiOptions && typeof uiOptions === 'object') {
            if (!initialEditorMode) {
                const uiEditorCandidate = (typeof uiOptions.editor === 'string')
                    ? uiOptions.editor
                    : ((typeof uiOptions.editorMode === 'string')
                        ? uiOptions.editorMode
                        : ((typeof uiOptions.startEditor === 'string') ? uiOptions.startEditor : null));
                if (uiEditorCandidate) {
                    const normalizedEditor = String(uiEditorCandidate).trim().toLowerCase();
                    if (isEditorMode(normalizedEditor)) initialEditorMode = normalizedEditor;
                }
            }
            if (!initialDrawerTab) {
                const uiTabCandidate = (typeof uiOptions.tab === 'string')
                    ? uiOptions.tab
                    : ((typeof uiOptions.drawerTab === 'string')
                        ? uiOptions.drawerTab
                        : ((typeof uiOptions.startTab === 'string')
                            ? uiOptions.startTab
                            : ((typeof uiOptions.view === 'string') ? uiOptions.view : null)));
                if (uiTabCandidate) initialDrawerTab = normalizeDrawerTab(uiTabCandidate);
            }
        }
    }

    const finalCss = cssChunks.length > 0 ? formatLoadedText(cssChunks.join('\n\n'), 'css') : css;
    return {
        code,
        domHtml,
        css: finalCss,
        label,
        clearConsole,
        run,
        initialEditorMode,
        initialDrawerTab,
        uiOptions,
        hasContent: code !== null || domHtml !== null || finalCss !== null
    };
};

const applyToggleButtonState = (button, isOn) => {
    if (!button) return;
    button.innerText = isOn ? 'ON' : 'OFF';
    button.classList.toggle('is-on', Boolean(isOn));
    button.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    button.setAttribute('data-state', isOn ? 'on' : 'off');
};

const extractBodyContent = (htmlSource) => {
    const html = String(htmlSource || '').trim();
    if (!html) return '';
    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) return bodyMatch[1];
    return html
        .replace(/<!doctype[\s\S]*?>/i, '')
        .replace(/<html\b[^>]*>/gi, '')
        .replace(/<\/html>/gi, '')
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<body\b[^>]*>/gi, '')
        .replace(/<\/body>/gi, '')
        .trim();
};

const escapeInlineScript = (source) => String(source || '').replace(/<\/script/gi, '<\\/script');

const buildP5RuntimeDocument = ({
    html = '<body></body>',
    css = ''
} = {}) => {
    const bodyContent = extractBodyContent(html);
    const safeCss = String(css || '').replace(/<\/style/gi, '<\\/style');
    const runtimeBootstrap = `
(() => {
  const emit = (type, payload) => {
    try {
      if (window.parent && window.parent !== window) window.parent.postMessage({ type, payload }, '*');
    } catch (error) {}
  };
  const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const toColor = (args) => {
    const values = Array.from(args || []).map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
    if (values.length === 0) return null;
    if (values.length === 1) {
      const gray = Math.max(0, Math.min(255, values[0]));
      return 'rgba(' + gray + ',' + gray + ',' + gray + ',1)';
    }
    const red = Math.max(0, Math.min(255, values[0]));
    const green = Math.max(0, Math.min(255, values[1]));
    const blue = Math.max(0, Math.min(255, values[2]));
    const alpha = values.length >= 4 ? Math.max(0, Math.min(1, values[3] / 255)) : 1;
    return 'rgba(' + red + ',' + green + ',' + blue + ',' + alpha + ')';
  };

  const state = {
    canvas: null,
    context: null,
    width: 520,
    height: 300,
    fillStyle: 'rgba(59,130,246,1)',
    strokeStyle: 'rgba(226,232,240,1)',
    lineWidth: 1,
    font: '16px monospace',
    useFill: true,
    useStroke: true
  };

  const ensureCanvas = () => {
    if (state.canvas && state.context) return;
    const existing = document.getElementById('jsv-p5-canvas');
    const canvas = existing || document.createElement('canvas');
    canvas.id = 'jsv-p5-canvas';
    canvas.width = state.width;
    canvas.height = state.height;
    canvas.style.maxWidth = '100%';
    canvas.style.display = 'block';
    canvas.style.borderRadius = '12px';
    canvas.style.background = '#0f172a';
    if (!existing) document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    state.canvas = canvas;
    state.context = ctx;
    if (ctx) {
      ctx.lineWidth = state.lineWidth;
      ctx.font = state.font;
      ctx.fillStyle = state.fillStyle;
      ctx.strokeStyle = state.strokeStyle;
      ctx.textBaseline = 'alphabetic';
    }
  };

  const commands = {
    createCanvas(args = []) {
      state.width = Math.max(1, Math.round(toNumber(args[0], state.width)));
      state.height = Math.max(1, Math.round(toNumber(args[1], state.height)));
      ensureCanvas();
      if (state.canvas) {
        state.canvas.width = state.width;
        state.canvas.height = state.height;
      }
      return { width: state.width, height: state.height };
    },
    clear() {
      ensureCanvas();
      if (state.context) state.context.clearRect(0, 0, state.width, state.height);
      return undefined;
    },
    background(args = []) {
      ensureCanvas();
      if (!state.context) return undefined;
      const color = toColor(args) || String(args[0] || '#0f172a');
      state.context.save();
      state.context.fillStyle = color;
      state.context.fillRect(0, 0, state.width, state.height);
      state.context.restore();
      return undefined;
    },
    fill(args = []) {
      const color = toColor(args);
      if (color) state.fillStyle = color;
      state.useFill = true;
      ensureCanvas();
      if (state.context) state.context.fillStyle = state.fillStyle;
      return undefined;
    },
    noFill() {
      state.useFill = false;
      return undefined;
    },
    stroke(args = []) {
      const color = toColor(args);
      if (color) state.strokeStyle = color;
      state.useStroke = true;
      ensureCanvas();
      if (state.context) state.context.strokeStyle = state.strokeStyle;
      return undefined;
    },
    noStroke() {
      state.useStroke = false;
      return undefined;
    },
    strokeWeight(args = []) {
      state.lineWidth = Math.max(0, toNumber(args[0], 1));
      ensureCanvas();
      if (state.context) state.context.lineWidth = state.lineWidth;
      return undefined;
    },
    circle(args = []) {
      ensureCanvas();
      if (!state.context) return undefined;
      const x = toNumber(args[0], 0);
      const y = toNumber(args[1], 0);
      const diameter = Math.max(0, toNumber(args[2], 0));
      state.context.beginPath();
      state.context.arc(x, y, diameter / 2, 0, Math.PI * 2);
      if (state.useFill) {
        state.context.fillStyle = state.fillStyle;
        state.context.fill();
      }
      if (state.useStroke) {
        state.context.strokeStyle = state.strokeStyle;
        state.context.lineWidth = state.lineWidth;
        state.context.stroke();
      }
      return undefined;
    },
    ellipse(args = []) {
      ensureCanvas();
      if (!state.context) return undefined;
      const x = toNumber(args[0], 0);
      const y = toNumber(args[1], 0);
      const width = Math.max(0, toNumber(args[2], 0));
      const height = Math.max(0, toNumber(args[3], width));
      state.context.beginPath();
      state.context.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
      if (state.useFill) {
        state.context.fillStyle = state.fillStyle;
        state.context.fill();
      }
      if (state.useStroke) {
        state.context.strokeStyle = state.strokeStyle;
        state.context.lineWidth = state.lineWidth;
        state.context.stroke();
      }
      return undefined;
    },
    rect(args = []) {
      ensureCanvas();
      if (!state.context) return undefined;
      const x = toNumber(args[0], 0);
      const y = toNumber(args[1], 0);
      const width = Math.max(0, toNumber(args[2], 0));
      const height = Math.max(0, toNumber(args[3], 0));
      if (state.useFill) {
        state.context.fillStyle = state.fillStyle;
        state.context.fillRect(x, y, width, height);
      }
      if (state.useStroke) {
        state.context.strokeStyle = state.strokeStyle;
        state.context.lineWidth = state.lineWidth;
        state.context.strokeRect(x, y, width, height);
      }
      return undefined;
    },
    line(args = []) {
      ensureCanvas();
      if (!state.context) return undefined;
      const x1 = toNumber(args[0], 0);
      const y1 = toNumber(args[1], 0);
      const x2 = toNumber(args[2], 0);
      const y2 = toNumber(args[3], 0);
      state.context.beginPath();
      state.context.moveTo(x1, y1);
      state.context.lineTo(x2, y2);
      state.context.strokeStyle = state.strokeStyle;
      state.context.lineWidth = state.lineWidth;
      state.context.stroke();
      return undefined;
    },
    textSize(args = []) {
      const size = Math.max(1, toNumber(args[0], 16));
      const family = state.font.includes(' ') ? state.font.slice(state.font.indexOf(' ') + 1) : 'monospace';
      state.font = size + 'px ' + family;
      ensureCanvas();
      if (state.context) state.context.font = state.font;
      return undefined;
    },
    textFont(args = []) {
      const family = String(args[0] || 'monospace');
      const sizeMatch = state.font.match(/^([0-9.]+px)\s+/);
      const size = sizeMatch ? sizeMatch[1] : '16px';
      state.font = size + ' ' + family;
      ensureCanvas();
      if (state.context) state.context.font = state.font;
      return undefined;
    },
    text(args = []) {
      ensureCanvas();
      if (!state.context) return undefined;
      const message = String(args[0] ?? '');
      const x = toNumber(args[1], 0);
      const y = toNumber(args[2], 0);
      if (state.useFill) {
        state.context.fillStyle = state.fillStyle;
        state.context.fillText(message, x, y);
      } else if (state.useStroke) {
        state.context.strokeStyle = state.strokeStyle;
        state.context.strokeText(message, x, y);
      }
      return undefined;
    },
    push() {
      ensureCanvas();
      if (state.context) state.context.save();
      return undefined;
    },
    pop() {
      ensureCanvas();
      if (state.context) state.context.restore();
      return undefined;
    },
    translate(args = []) {
      ensureCanvas();
      if (state.context) state.context.translate(toNumber(args[0], 0), toNumber(args[1], 0));
      return undefined;
    },
    rotate(args = []) {
      ensureCanvas();
      if (state.context) state.context.rotate(toNumber(args[0], 0));
      return undefined;
    }
  };

  window.addEventListener('message', (event) => {
    const data = event && event.data ? event.data : null;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'visualizer:p5-cmd') return;
    const payload = data.payload || {};
    const commandName = String(payload.command || '').trim();
    const command = commands[commandName];
    if (typeof command !== 'function') return;
    try {
      command(Array.isArray(payload.args) ? payload.args : []);
    } catch (error) {
      emit('visualizer:p5-error', {
        name: 'Error',
        message: String(error && error.message ? error.message : error),
        line: 0
      });
    }
  });

  ensureCanvas();
  emit('visualizer:p5-ready', { mode: 'canvas-runtime' });
})();
`;

    return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${safeCss}</style>
</head>
<body>
${bodyContent}
<script>${escapeInlineScript(runtimeBootstrap)}<\/script>
</body>
</html>`;
};

export const app = {
    interpreter: null,
    isRunning: false,
    eventFunctionName: 'onClick',
    scenarios: SCENARIOS,
    currentDomHtml: '<body></body>',
    currentDomCss: '',
    currentEditorMode: 'js',
    editorBuffers: {
        js: '',
        html: '<body></body>',
        css: ''
    },
    p5ModeEnabled: false,
    p5RuntimeActive: false,
    p5FrameRateFps: 12,
    p5LastDrawAtMs: null,
    p5RuntimeKey: '',
    p5DrawTimerId: null,
    p5FrameCount: 0,
    p5CanvasSize: { width: 520, height: 300 },
    p5RuntimeReady: false,
    p5PendingCommands: [],
    pendingScenarioLoadTimer: null,
    embedUiOptions: {
        showLoadButton: true,
        showFlowLineToggle: true
    },

    syncCurrentEditorBuffer: () => {
        const input = document.getElementById('code-input');
        if (!input || !isEditorMode(app.currentEditorMode)) return;
        app.editorBuffers[app.currentEditorMode] = String(input.value || '');
    },
    onEditorInput: (nextText) => {
        if (!isEditorMode(app.currentEditorMode)) return;
        app.editorBuffers[app.currentEditorMode] = String(nextText || '');
    },
    updateEditorModeControls: () => {
        EDITOR_MODES.forEach((mode) => {
            const button = document.getElementById(`btn-mode-${mode}`);
            if (!button) return;
            button.classList.toggle('active', app.currentEditorMode === mode);
            button.setAttribute('aria-pressed', app.currentEditorMode === mode ? 'true' : 'false');
        });
    },
    applyEditorModeToInput: () => {
        const nextCode = String(app.editorBuffers[app.currentEditorMode] || '');
        setEditorCode(nextCode);
        app.updateEditorModeControls();
    },
    setEditorMode: (mode) => {
        if (!isEditorMode(mode)) return false;
        if (app.currentEditorMode === mode) {
            app.updateEditorModeControls();
            return true;
        }
        app.syncCurrentEditorBuffer();
        app.currentEditorMode = mode;
        app.applyEditorModeToInput();
        return true;
    },
    getCurrentEditorMode: () => app.currentEditorMode,
    hydrateDomStateFromBuffers: () => {
        const parsed = extractScenarioHtml(app.editorBuffers.html || '<body></body>');
        app.currentDomHtml = parsed.domHtml || '<body></body>';
        const cssParts = [];
        if (parsed.css) cssParts.push(parsed.css);
        if (app.editorBuffers.css) cssParts.push(String(app.editorBuffers.css));
        app.currentDomCss = cssParts.join('\n\n').trim();
    },
    initializeEditorBuffers: (defaultJsCode = '') => {
        app.editorBuffers.js = formatLoadedText(defaultJsCode || '', 'js');
        app.editorBuffers.html = formatLoadedText('<body></body>', 'html');
        app.editorBuffers.css = '';
        app.currentEditorMode = 'js';
        if (typeof ui.prepareBreakpointsForNewDocument === 'function') ui.prepareBreakpointsForNewDocument();
        app.hydrateDomStateFromBuffers();
        ui.updateDom(createVirtualDocument(app.currentDomHtml), app.currentDomCss);
        app.updateEditorModeControls();
        app.updateOptionsPopupControls();
    },
    updateP5ModeControl: () => {
        const button = document.getElementById('btn-toggle-p5-mode');
        applyToggleButtonState(button, app.p5ModeEnabled);
    },
    getP5FrameRateFps: () => {
        const parsed = Number(app.p5FrameRateFps);
        if (!Number.isFinite(parsed) || parsed <= 0) return 12;
        return parsed;
    },
    getP5TargetDeltaMs: () => {
        return 1000 / app.getP5FrameRateFps();
    },
    updateP5FrameRateControl: () => {
        const input = document.getElementById('input-p5-frame-rate');
        if (!input) return;
        const nextValue = String(Math.max(1, Math.round(app.getP5FrameRateFps())));
        if (input.value !== nextValue) input.value = nextValue;
    },
    updateOptionsPopupControls: () => {
        const flowControl = document.getElementById('option-row-flow-line');
        if (flowControl) flowControl.style.display = app.embedUiOptions.showFlowLineToggle ? '' : 'none';
        app.updateP5ModeControl();
        app.updateP5FrameRateControl();
    },
    setP5Mode: (enabled, announce = true) => {
        const wasP5Enabled = app.p5ModeEnabled;
        const next = Boolean(enabled);
        app.p5ModeEnabled = next;
        app.updateP5ModeControl();
        if (!next) {
            if (wasP5Enabled && app.isRunning) {
                app.stop();
            }
            app.stopP5Loops();
            if (app.p5RuntimeActive) {
                app.stopP5Runtime(false);
                app.isRunning = false;
                ui.setRunningState(false);
            }
            ui.setP5RuntimeMode(false);
            ui.updateDom(createVirtualDocument(app.currentDomHtml), app.currentDomCss);
        } else if (app.isRunning && !app.p5RuntimeActive) {
            ui.log('Mode p5.js applique au prochain lancement.', 'info');
        }
        if (announce) ui.log(`Mode p5.js ${next ? 'active' : 'desactive'}.`, 'info');
        return true;
    },
    toggleP5Mode: () => {
        app.setP5Mode(!app.p5ModeEnabled, true);
    },
    setP5FrameRate: (nextValue, announce = false) => {
        const parsed = Number(nextValue);
        const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
        app.p5FrameRateFps = normalized;
        app.updateP5FrameRateControl();
        if (app.p5ModeEnabled && app.isRunning) {
            app.startP5DrawLoop();
        }
        if (app.p5ModeEnabled && app.interpreter && typeof app.interpreter.setGlobalValue === 'function') {
            app.interpreter.setGlobalValue('deltaTime', app.getP5TargetDeltaMs());
        }
        if (announce) {
            ui.log(`Frequence p5: ${app.getP5FrameRateFps().toFixed(2)} FPS`, 'info');
        }
        return app.getP5FrameRateFps();
    },
    setP5FrameRateFromInput: (value) => {
        app.setP5FrameRate(value, true);
    },
    setP5FrameDelay: (nextValue) => {
        const parsed = Number(nextValue);
        const normalizedDelay = Number.isFinite(parsed) && parsed > 0 ? parsed : 80;
        const fps = 1000 / normalizedDelay;
        return app.setP5FrameRate(fps, false);
    },
    setP5DeltaTime: (nextValue, announce = false) => {
        const parsed = Number(nextValue);
        const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
        const fps = 1000 / normalized;
        return app.setP5FrameRate(fps, announce);
    },
    setP5DeltaTimeFromInput: (value) => {
        app.setP5DeltaTime(value, true);
    },
    buildP5RuntimeSrcdoc: () => {
        app.hydrateDomStateFromBuffers();
        return buildP5RuntimeDocument({
            html: app.currentDomHtml,
            css: app.currentDomCss
        });
    },
    postP5Message: (payload) => {
        if (!payload || !app.p5RuntimeActive) return false;
        return ui.postToDomRenderFrame(payload);
    },
    postP5Command: (command, args = []) => {
        if (!command || !app.p5RuntimeActive) return false;
        const payload = {
            type: 'visualizer:p5-cmd',
            payload: {
                command,
                args: Array.isArray(args) ? args : []
            }
        };
        if (!app.p5RuntimeReady) {
            app.p5PendingCommands.push(payload);
            return true;
        }
        return app.postP5Message(payload);
    },
    startP5Runtime: () => {
        const srcdoc = app.buildP5RuntimeSrcdoc();
        app.p5RuntimeKey = `p5-${Date.now()}`;
        app.p5RuntimeActive = true;
        app.p5RuntimeReady = false;
        app.p5PendingCommands = [];
        ui.setP5RuntimeMode(true, srcdoc, app.p5RuntimeKey);
        ui.switchTab('memory');
        ui.log(`Mode p5.js lance (${app.getP5FrameRateFps().toFixed(2)} FPS).`, 'info');
    },
    stopP5Runtime: (announce = true) => {
        app.p5RuntimeActive = false;
        app.p5RuntimeReady = false;
        app.p5PendingCommands = [];
        ui.setP5RuntimeMode(false);
        if (announce) ui.log('Mode p5.js en pause.', 'info');
    },
    createP5NativeCallable: (handler) => {
        const fn = async (...args) => handler(...args);
        fn.__nativeCallable = true;
        return fn;
    },
    buildP5InitialGlobals: () => {
        const bindCommand = (commandName, onAfter = null) => app.createP5NativeCallable(async (...args) => {
            app.postP5Command(commandName, args);
            if (typeof onAfter === 'function') onAfter(args);
            return undefined;
        });
        const hiddenCallable = (value) => ({ kind: 'const', value, hidden: true });

        return {
            width: { kind: 'let', value: Number(app.p5CanvasSize.width) || 520 },
            height: { kind: 'let', value: Number(app.p5CanvasSize.height) || 300 },
            deltaTime: { kind: 'let', value: app.getP5TargetDeltaMs(), hidden: true },
            frameCount: { kind: 'let', value: 0, hidden: true },
            createCanvas: {
                kind: 'const',
                hidden: true,
                value: app.createP5NativeCallable(async (...args) => {
                    const width = Math.max(1, Math.round(Number(args[0]) || app.p5CanvasSize.width || 520));
                    const height = Math.max(1, Math.round(Number(args[1]) || app.p5CanvasSize.height || 300));
                    app.p5CanvasSize = { width, height };
                    app.postP5Command('createCanvas', [width, height]);
                    if (app.interpreter && typeof app.interpreter.setGlobalValue === 'function') {
                        app.interpreter.setGlobalValue('width', width);
                        app.interpreter.setGlobalValue('height', height);
                    }
                    return undefined;
                })
            },
            clear: hiddenCallable(bindCommand('clear')),
            background: hiddenCallable(bindCommand('background')),
            fill: hiddenCallable(bindCommand('fill')),
            noFill: hiddenCallable(bindCommand('noFill')),
            stroke: hiddenCallable(bindCommand('stroke')),
            noStroke: hiddenCallable(bindCommand('noStroke')),
            strokeWeight: hiddenCallable(bindCommand('strokeWeight')),
            circle: hiddenCallable(bindCommand('circle')),
            ellipse: hiddenCallable(bindCommand('ellipse')),
            rect: hiddenCallable(bindCommand('rect')),
            line: hiddenCallable(bindCommand('line')),
            textSize: hiddenCallable(bindCommand('textSize')),
            textFont: hiddenCallable(bindCommand('textFont')),
            text: hiddenCallable(bindCommand('text')),
            push: hiddenCallable(bindCommand('push')),
            pop: hiddenCallable(bindCommand('pop')),
            translate: hiddenCallable(bindCommand('translate')),
            rotate: hiddenCallable(bindCommand('rotate')),
            frameRate: hiddenCallable(app.createP5NativeCallable(async (...args) => {
                    if (args.length === 0 || !Number.isFinite(Number(args[0])) || Number(args[0]) <= 0) {
                        return app.getP5FrameRateFps();
                    }
                    app.setP5FrameRate(Number(args[0]), false);
                    return app.getP5FrameRateFps();
                })),
            noLoop: hiddenCallable(app.createP5NativeCallable(async () => {
                    app.stopP5DrawLoop();
                    return undefined;
                })),
            loop: hiddenCallable(app.createP5NativeCallable(async () => {
                    app.startP5DrawLoop();
                    return undefined;
                }))
        };
    },
    stopP5DrawLoop: () => {
        if (app.p5DrawTimerId) {
            clearInterval(app.p5DrawTimerId);
            app.p5DrawTimerId = null;
        }
        app.p5LastDrawAtMs = null;
    },
    startP5DrawLoop: () => {
        app.stopP5DrawLoop();
        if (!app.p5ModeEnabled || !app.isRunning || !app.interpreter) return;
        const delay = Math.max(1, Math.round(app.getP5TargetDeltaMs()));
        app.p5LastDrawAtMs = null;
        app.p5DrawTimerId = setInterval(() => {
            if (!app.isRunning || !app.interpreter) return;
            if (app.interpreter.shouldStop) {
                app.stopP5Loops();
                app.isRunning = false;
                ui.setRunningState(false);
                return;
            }
            const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
                ? performance.now()
                : Date.now();
            if (!app.interpreter.functions || !app.interpreter.functions.draw) {
                app.p5LastDrawAtMs = now;
                return;
            }
            if (app.interpreter.isHandlingEvent) {
                // Ignore le temps de pause step/breakpoint dans le deltaTime de la prochaine frame.
                app.p5LastDrawAtMs = now;
                return;
            }
            const deltaMs = app.p5LastDrawAtMs === null
                ? app.getP5TargetDeltaMs()
                : Math.max(0, now - app.p5LastDrawAtMs);
            app.p5LastDrawAtMs = now;
            app.p5FrameCount += 1;
            if (typeof app.interpreter.setGlobalValue === 'function') {
                app.interpreter.setGlobalValue('deltaTime', deltaMs);
                app.interpreter.setGlobalValue('frameCount', app.p5FrameCount);
            }
            app.interpreter.invokeEvent('draw', { quiet: true });
        }, delay);
    },
    stopP5Loops: () => {
        app.stopP5DrawLoop();
    },
    onP5InterpreterReady: async (interpreterInstance) => {
        if (!app.isRunning || app.interpreter !== interpreterInstance) return;
        if (interpreterInstance.functions && interpreterInstance.functions.setup) {
            if (typeof interpreterInstance.setGlobalValue === 'function') {
                interpreterInstance.setGlobalValue('deltaTime', app.getP5TargetDeltaMs());
                interpreterInstance.setGlobalValue('frameCount', 0);
            }
            await interpreterInstance.invokeEvent('setup', { quiet: true });
        }
        app.startP5DrawLoop();
    },
    
    toggleRun: () => {
        if (app.isRunning) app.stop();
        else app.start();
    },
    
    start: () => {
        app.syncCurrentEditorBuffer();
        if (app.currentEditorMode !== 'js') app.setEditorMode('js');
        app.hydrateDomStateFromBuffers();
        ui.updateDom(createVirtualDocument(app.currentDomHtml), app.currentDomCss);
        const code = String(app.editorBuffers.js || '');
        app.stopP5Loops();
        app.p5FrameCount = 0;
        app.p5LastDrawAtMs = null;
        app.isRunning = true;
        ui.setRunningState(true);
        consoleUI.clear();
        if (app.p5ModeEnabled) {
            app.startP5Runtime();
            app.interpreter = new Interpreter(ui, {
                domHtml: app.currentDomHtml,
                shouldPauseAtLine: (line) => ui.shouldPauseAtLine(line),
                shouldFastForwardExecution: () => ui.shouldFastForwardExecution(),
                initialGlobals: app.buildP5InitialGlobals(),
                onReadyForEvents: async (interpreterInstance) => {
                    await app.onP5InterpreterReady(interpreterInstance);
                }
            });
            app.interpreter.start(code);
            return;
        }
        ui.setP5RuntimeMode(false);
        app.p5RuntimeActive = false;
        app.interpreter = new Interpreter(ui, {
            domHtml: app.currentDomHtml,
            shouldPauseAtLine: (line) => ui.shouldPauseAtLine(line),
            shouldFastForwardExecution: () => ui.shouldFastForwardExecution()
        });
        app.interpreter.start(code);
    },
    
    nextStep: () => {
        if(app.interpreter) app.interpreter.nextStep();
    },
    stepAnimated: () => {
        const resumeRealtime = typeof ui.consumeSoftPauseContext === 'function'
            ? ui.consumeSoftPauseContext()
            : false;
        if (resumeRealtime) {
            ui.skipMode = true;
            app.nextStep();
            return;
        }
        ui.skipMode = false;
        app.nextStep();
    },
    stepInstant: () => { 
        if (typeof ui.consumeSoftPauseContext === 'function') ui.consumeSoftPauseContext();
        if (ui.currentWaitResolver) {
            ui.skipMode = true; 
            ui.currentWaitResolver(); 
            ui.currentWaitResolver = null;
        } else {
            ui.skipMode = true; 
            app.nextStep(); 
        }
    },
    
    stop: () => { 
        app.stopP5Loops();
        ui.isStopping = true; 
        ui.stopAnimations();
        if(app.interpreter) app.interpreter.stop();
        setTimeout(() => { 
            ui.resetDisplay(); 
            app.isRunning = false;
            ui.setRunningState(false); 
            if (app.p5RuntimeActive) app.stopP5Runtime(false);
            app.interpreter = null;
            ui.isStopping = false; 
        }, 50);
    },
    
    toggleEventPopup: () => {
        const loadPopup = document.getElementById('load-popup');
        if (loadPopup) loadPopup.classList.remove('visible');
        ui.hideOptionsPopup();
        const popup = document.getElementById('event-popup');
        if (!popup) return;
        popup.classList.toggle('visible');
        if (popup.classList.contains('visible')) {
            const input = document.getElementById('event-name-input');
            if (input) {
                input.focus();
                input.select();
            }
        }
    },
    
    saveEventName: () => {
        const input = document.getElementById('event-name-input');
        if (input && input.value.trim()) {
            app.eventFunctionName = input.value.trim();
            const popup = document.getElementById('event-popup');
            if (popup) popup.classList.remove('visible');
        }
    },

    initScenarioLoader: () => {
        const select = document.getElementById('load-scenario-select');
        const loadButton = document.getElementById('btn-load');
        const fileInput = document.getElementById('load-html-file-input');
        if (!select || !loadButton) return;
        if (app.scenarios.length === 0) {
            select.innerHTML = '<option value="">Aucune sauvegarde</option>';
        } else {
            select.innerHTML = app.scenarios
                .map((scenario, index) => {
                    const tag = scenario.kind === 'html' ? 'HTML' : 'JS';
                    return `<option value="${index}">[${tag}] ${scenario.title}</option>`;
                })
                .join('');
            select.value = '0';
        }
        loadButton.disabled = app.scenarios.length === 0;
        if (fileInput && !fileInput.dataset.bound) {
            fileInput.dataset.bound = 'true';
            fileInput.addEventListener('change', () => {
                const files = fileInput.files;
                const file = files && files.length > 0 ? files[0] : null;
                if (!file) return;
                app.loadHtmlFile(file);
                fileInput.value = '';
            });
        }
    },

    toggleLoadPopup: () => {
        ui.hideOptionsPopup();
        const popup = document.getElementById('load-popup');
        if (!popup) return;
        popup.classList.toggle('visible');
        if (popup.classList.contains('visible')) {
            const select = document.getElementById('load-scenario-select');
            if (select) select.focus();
        }
    },

    applyScenario: (scenario) => {
        app.syncCurrentEditorBuffer();
        if (typeof ui.prepareBreakpointsForNewDocument === 'function') ui.prepareBreakpointsForNewDocument();
        if (scenario && scenario.ui && typeof scenario.ui === 'object') {
            app.applyEmbedUiOptions(scenario.ui);
        }
        let nextCode = formatLoadedText(scenario.code || '', 'js');
        if (scenario.kind === 'html') {
            const parsed = extractScenarioHtml(scenario.html);
            nextCode = formatLoadedText(parsed.code || '', 'js');
            app.editorBuffers.html = formatLoadedText(parsed.domHtml || '<body></body>', 'html');
            app.editorBuffers.css = formatLoadedText(parsed.css || '', 'css');
            app.currentDomHtml = app.editorBuffers.html;
            app.currentDomCss = app.editorBuffers.css;
            ui.updateDom(createVirtualDocument(app.currentDomHtml), app.currentDomCss);
        }
        app.editorBuffers.js = formatLoadedText(nextCode, 'js');
        app.currentEditorMode = 'js';
        app.applyEditorModeToInput();
        consoleUI.clear();
        const tag = scenario.kind === 'html' ? 'HTML' : 'JS';
        ui.log(`Scenario charge: [${tag}] ${scenario.title}`, 'info');
        const popup = document.getElementById('load-popup');
        if (popup) popup.classList.remove('visible');
    },

    loadSelectedScenario: () => {
        const select = document.getElementById('load-scenario-select');
        if (!select) return;
        const index = parseInt(select.value, 10);
        if (Number.isNaN(index) || index < 0 || index >= app.scenarios.length) return;
        const scenario = app.scenarios[index];

        if (app.pendingScenarioLoadTimer) {
            clearTimeout(app.pendingScenarioLoadTimer);
            app.pendingScenarioLoadTimer = null;
        }

        if (app.isRunning) {
            app.stop();
            app.pendingScenarioLoadTimer = setTimeout(() => {
                app.applyScenario(scenario);
                app.pendingScenarioLoadTimer = null;
            }, 90);
            return;
        }
        app.applyScenario(scenario);
    },
    applyHtmlSource: (htmlSource, label = 'Fichier HTML') => {
        const parsed = extractScenarioHtml(htmlSource);
        app.syncCurrentEditorBuffer();
        if (typeof ui.prepareBreakpointsForNewDocument === 'function') ui.prepareBreakpointsForNewDocument();
        app.editorBuffers.html = formatLoadedText(parsed.domHtml || '<body></body>', 'html');
        app.editorBuffers.css = formatLoadedText(parsed.css || '', 'css');
        app.editorBuffers.js = formatLoadedText(parsed.code || '', 'js');
        app.currentEditorMode = parsed.code ? 'js' : 'html';
        app.hydrateDomStateFromBuffers();
        ui.updateDom(createVirtualDocument(app.currentDomHtml), app.currentDomCss);
        app.applyEditorModeToInput();
        consoleUI.clear();
        ui.log(`Contenu charge (${label}).`, 'info');
        const popup = document.getElementById('load-popup');
        if (popup) popup.classList.remove('visible');
    },
    loadHtmlFile: (file) => {
        if (!file) return;
        const apply = () => {
            const reader = new FileReader();
            reader.onload = () => {
                const content = typeof reader.result === 'string' ? reader.result : '';
                app.applyHtmlSource(content, file.name || 'Fichier HTML');
            };
            reader.onerror = () => {
                ui.log('Lecture du fichier HTML impossible.', 'error');
            };
            reader.readAsText(file);
        };
        if (app.pendingScenarioLoadTimer) {
            clearTimeout(app.pendingScenarioLoadTimer);
            app.pendingScenarioLoadTimer = null;
        }
        if (app.isRunning) {
            app.stop();
            app.pendingScenarioLoadTimer = setTimeout(() => {
                apply();
                app.pendingScenarioLoadTimer = null;
            }, 90);
            return;
        }
        apply();
    },
    pickAndLoadHtmlFile: () => {
        const input = document.getElementById('load-html-file-input');
        if (!input) return;
        input.value = '';
        input.click();
    },

    loadExternalContent: (payload) => {
        const normalized = normalizeExternalContent(payload);
        if (normalized.uiOptions) app.applyEmbedUiOptions(normalized.uiOptions);
        if (!normalized.hasContent) {
            ui.log('Chargement externe ignore: aucun JS/HTML/CSS fourni.', 'warn');
            return false;
        }

        const apply = () => {
            app.syncCurrentEditorBuffer();
            if (typeof ui.prepareBreakpointsForNewDocument === 'function') ui.prepareBreakpointsForNewDocument();
            if (normalized.domHtml !== null) app.editorBuffers.html = formatLoadedText(normalized.domHtml || '<body></body>', 'html');
            if (normalized.css !== null) app.editorBuffers.css = formatLoadedText(String(normalized.css || ''), 'css');
            if (normalized.code !== null) app.editorBuffers.js = formatLoadedText(String(normalized.code), 'js');
            if (normalized.initialEditorMode && isEditorMode(normalized.initialEditorMode)) {
                app.currentEditorMode = normalized.initialEditorMode;
            } else if (normalized.code !== null) {
                app.currentEditorMode = 'js';
            }
            app.hydrateDomStateFromBuffers();
            ui.updateDom(createVirtualDocument(app.currentDomHtml), app.currentDomCss);
            app.applyEditorModeToInput();
            if (normalized.initialDrawerTab) ui.switchTab(normalized.initialDrawerTab);
            if (normalized.clearConsole) consoleUI.clear();
            ui.log(`Contenu charge (${normalized.label}).`, 'info');
            if (normalized.run) app.start();
        };

        if (app.pendingScenarioLoadTimer) {
            clearTimeout(app.pendingScenarioLoadTimer);
            app.pendingScenarioLoadTimer = null;
        }

        if (app.isRunning) {
            app.stop();
            app.pendingScenarioLoadTimer = setTimeout(() => {
                apply();
                app.pendingScenarioLoadTimer = null;
            }, 90);
            return true;
        }

        apply();
        return true;
    },

    applyEmbedUiOptions: (options) => {
        if (!options || typeof options !== 'object') return false;

        if (typeof options.flowLineEnabled === 'boolean') {
            ui.showFlowLine = options.flowLineEnabled;
            ui.updateFlowLineControl();
        }

        if (typeof options.showFlowLineToggle === 'boolean') {
            app.embedUiOptions.showFlowLineToggle = options.showFlowLineToggle;
            const flowControl = document.getElementById('option-row-flow-line');
            if (flowControl) flowControl.style.display = options.showFlowLineToggle ? '' : 'none';
        }

        if (typeof options.showLoadButton === 'boolean') {
            app.embedUiOptions.showLoadButton = options.showLoadButton;
            const loadButton = document.getElementById('btn-load');
            const loadFileInput = document.getElementById('load-html-file-input');
            if (loadButton) loadButton.style.display = options.showLoadButton ? '' : 'none';
            if (loadFileInput && !options.showLoadButton) loadFileInput.value = '';
            if (!options.showLoadButton) {
                const popup = document.getElementById('load-popup');
                if (popup) popup.classList.remove('visible');
            }
        }

        const p5ModeCandidate = (typeof options.p5ModeEnabled === 'boolean')
            ? options.p5ModeEnabled
            : ((typeof options.p5Enabled === 'boolean') ? options.p5Enabled : null);
        if (p5ModeCandidate !== null) app.setP5Mode(p5ModeCandidate, false);

        const p5FrameRateCandidate = Object.prototype.hasOwnProperty.call(options, 'p5FrameRate')
            ? options.p5FrameRate
            : (Object.prototype.hasOwnProperty.call(options, 'p5Fps')
                ? options.p5Fps
                : null);
        if (p5FrameRateCandidate !== null) {
            app.setP5FrameRate(p5FrameRateCandidate, false);
        } else {
            const p5DeltaCandidate = Object.prototype.hasOwnProperty.call(options, 'p5DeltaTimeMs')
                ? options.p5DeltaTimeMs
                : (Object.prototype.hasOwnProperty.call(options, 'p5DeltaTime')
                    ? options.p5DeltaTime
                    : null);
            if (p5DeltaCandidate !== null) app.setP5DeltaTime(p5DeltaCandidate, false);

            if (Object.prototype.hasOwnProperty.call(options, 'p5FrameDelayMs')) {
                app.setP5FrameDelay(options.p5FrameDelayMs);
            }
        }

        app.updateOptionsPopupControls();

        return true;
    },
    
    triggerEvent: () => {
        if (app.interpreter) app.interpreter.invokeEvent(app.eventFunctionName);
    },
    dispatchDomClick: async (domPath = '') => {
        if (!app.interpreter || typeof app.interpreter.invokeDomClick !== 'function') return;
        await app.interpreter.invokeDomClick(domPath);
    },
    dispatchDomInput: (domPath = '', value = '') => {
        if (app.interpreter && typeof app.interpreter.updateDomInputValue === 'function') {
            app.interpreter.updateDomInputValue(domPath, value);
        }
        if (ui && typeof ui.updateDomInputValue === 'function') {
            ui.updateDomInputValue(domPath, value);
        }
    },
    onP5ConsoleMessage: (payload = {}) => {
        if (!app.p5ModeEnabled) return;
        const args = Array.isArray(payload.args) ? payload.args : [];
        ui.consoleLog(args);
    },
    onP5ErrorMessage: (payload = {}) => {
        if (!app.p5ModeEnabled) return;
        const name = payload && payload.name ? String(payload.name) : 'Error';
        const message = payload && payload.message ? String(payload.message) : 'Erreur runtime';
        const line = Number.isFinite(payload && payload.line) ? Number(payload.line) : 0;
        if (typeof ui.renderError === 'function') {
            ui.renderError({
                prefix: 'Erreur p5',
                name,
                message,
                line
            });
            return;
        }
        ui.log(`Erreur p5: ${name}: ${message}${line > 0 ? ` (ligne ${line})` : ''}`, 'error');
    },
    onP5ReadyMessage: (payload = {}) => {
        if (!app.p5ModeEnabled || !app.p5RuntimeActive) return;
        app.p5RuntimeReady = true;
        if (Array.isArray(app.p5PendingCommands) && app.p5PendingCommands.length > 0) {
            const queued = [...app.p5PendingCommands];
            app.p5PendingCommands = [];
            queued.forEach((entry) => app.postP5Message(entry));
        }
        app.postP5Command('createCanvas', [app.p5CanvasSize.width, app.p5CanvasSize.height]);
    }
};
