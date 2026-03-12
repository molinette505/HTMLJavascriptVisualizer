// @ts-nocheck
import { createVirtualDocument } from '../core/virtualDom';

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
    canvas.style.background = 'transparent';
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


export const attachP5Methods = (app, ui) => {
    Object.assign(app, {
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
            width: { kind: 'let', value: Number(app.p5CanvasSize.width) || 520, hidden: true },
            height: { kind: 'let', value: Number(app.p5CanvasSize.height) || 300, hidden: true },
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
    });
};
