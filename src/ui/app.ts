// @ts-nocheck
// File purpose: app controller for run lifecycle, scenario loading, and editor mode coordination.
import { Interpreter } from '../core/interpreter';
import { SCENARIOS } from '../core/scenarios';
import { createVirtualDocument } from '../core/virtualDom';
import { ui, consoleUI } from './ui';
import { editor } from './editor';
import {
    EDITOR_MODES,
    isEditorMode,
    formatLoadedText,
    extractScenarioHtml,
    setEditorCode,
    normalizeExternalContent
} from './appContent';
import { attachP5Methods } from './appP5';

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
        setEditorCode(nextCode, editor);
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
        if (ui.currentWaitResolver) {
            const resolver = ui.currentWaitResolver;
            ui.currentWaitResolver = null;
            ui.skipMode = false;
            resolver();
            return;
        }
        if (ui.stepMode === 'automatic') {
            if (typeof ui.requestAutoMicroPause === 'function') ui.requestAutoMicroPause();
            return;
        }
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
        if (ui.currentWaitResolver) {
            const resolver = ui.currentWaitResolver;
            ui.currentWaitResolver = null;
            if (ui.stepMode === 'micro') {
                ui.microSkipToNextInstruction = true;
                ui.skipMode = true;
            } else {
                ui.skipMode = true;
            }
            if (typeof ui.consumeSoftPauseContext === 'function') ui.consumeSoftPauseContext();
            resolver();
            return;
        }
        if (ui.stepMode === 'micro') {
            ui.microSkipToNextInstruction = true;
            ui.skipMode = true;
            app.nextStep();
            return;
        }
        if (ui.stepMode === 'automatic') {
            // Ignore le reste de l'instruction en cours, puis reprend en automatique.
            ui.skipMode = true;
            return;
        }
        if (typeof ui.consumeSoftPauseContext === 'function') ui.consumeSoftPauseContext();
        ui.skipMode = true; 
        app.nextStep(); 
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

        if (typeof options.readVisualizationMode === 'string' && typeof ui.setReadVisualizationMode === 'function') {
            ui.setReadVisualizationMode(options.readVisualizationMode);
        } else if (typeof options.flowLineEnabled === 'boolean' || typeof options.dataFlowEnabled === 'boolean') {
            const flowEnabled = typeof options.flowLineEnabled === 'boolean' ? options.flowLineEnabled : ui.showFlowLine;
            const dataEnabledRaw = typeof options.dataFlowEnabled === 'boolean' ? options.dataFlowEnabled : ui.showDataFlow;
            const dataEnabled = (!flowEnabled && !dataEnabledRaw) ? true : dataEnabledRaw;
            if (flowEnabled && dataEnabled) ui.setReadVisualizationMode('both');
            else if (flowEnabled) ui.setReadVisualizationMode('line');
            else ui.setReadVisualizationMode('data');
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

        if (typeof options.stepMode === 'string' && typeof ui.setStepMode === 'function') {
            ui.setStepMode(options.stepMode);
        }

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
};

attachP5Methods(app, ui);
