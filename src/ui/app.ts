// @ts-nocheck
import { Interpreter } from '../core/interpreter';
import { SCENARIOS } from '../core/scenarios';
import { createVirtualDocument } from '../core/virtualDom';
import { ui, consoleUI } from './ui';
import { editor } from './editor';

const EDITOR_MODES = ['js', 'html', 'css'];
const isEditorMode = (mode) => EDITOR_MODES.includes(mode);

const extractScenarioHtml = (rawHtml) => {
    const source = String(rawHtml || '').trim();
    if (!source) return { code: '', css: '', domHtml: '<body></body>' };

    const scriptBlocks = [];
    const styleBlocks = [];
    const withoutScripts = source.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, content = '') => {
        scriptBlocks.push(String(content));
        return '';
    });
    const withoutScriptsAndStyles = withoutScripts.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, content = '') => {
        styleBlocks.push(String(content));
        return '';
    });

    const code = scriptBlocks.join('\n\n').trim();
    const css = styleBlocks.join('\n\n').trim();
    const domHtml = withoutScriptsAndStyles.trim() || '<body></body>';
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

    if (typeof payload === 'string') {
        code = payload;
    } else if (payload && typeof payload === 'object') {
        if (typeof payload.js === 'string') code = payload.js;
        else if (typeof payload.code === 'string') code = payload.code;

        if (typeof payload.html === 'string') {
            const parsed = extractScenarioHtml(payload.html);
            domHtml = parsed.domHtml;
            if (code === null && parsed.code) code = parsed.code;
            if (parsed.css) cssChunks.push(parsed.css);
        } else if (typeof payload.domHtml === 'string') {
            domHtml = payload.domHtml || '<body></body>';
        }
        if (typeof payload.css === 'string') cssChunks.push(payload.css);
        else if (typeof payload.domCss === 'string') cssChunks.push(payload.domCss);

        if (typeof payload.label === 'string' && payload.label.trim()) label = payload.label.trim();
        else if (typeof payload.source === 'string' && payload.source.trim()) label = payload.source.trim();
        else if (typeof payload.title === 'string' && payload.title.trim()) label = payload.title.trim();

        if (typeof payload.clearConsole === 'boolean') clearConsole = payload.clearConsole;
        if (typeof payload.run === 'boolean') run = payload.run;
        if (payload.ui && typeof payload.ui === 'object') uiOptions = payload.ui;
    }

    const finalCss = cssChunks.length > 0 ? cssChunks.join('\n\n') : css;
    return {
        code,
        domHtml,
        css: finalCss,
        label,
        clearConsole,
        run,
        uiOptions,
        hasContent: code !== null || domHtml !== null || finalCss !== null
    };
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
        app.editorBuffers.js = String(defaultJsCode || '');
        app.editorBuffers.html = '<body></body>';
        app.editorBuffers.css = '';
        app.currentEditorMode = 'js';
        app.hydrateDomStateFromBuffers();
        ui.updateDom(createVirtualDocument(app.currentDomHtml), app.currentDomCss);
        app.updateEditorModeControls();
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
        app.isRunning = true;
        ui.setRunningState(true);
        consoleUI.clear();
        app.interpreter = new Interpreter(ui, { domHtml: app.currentDomHtml });
        app.interpreter.start(code);
    },
    
    nextStep: () => { if(app.interpreter) app.interpreter.nextStep(); },
    stepAnimated: () => { ui.skipMode = false; app.nextStep(); },
    stepInstant: () => { 
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
        ui.isStopping = true; 
        ui.stopAnimations();
        if(app.interpreter) app.interpreter.stop();
        setTimeout(() => { 
            ui.resetDisplay(); 
            app.isRunning = false;
            ui.setRunningState(false); 
            ui.isStopping = false; 
        }, 50);
    },
    
    toggleEventPopup: () => {
        const loadPopup = document.getElementById('load-popup');
        if (loadPopup) loadPopup.classList.remove('visible');
        ui.hideOptionsPopup();
        const popup = document.getElementById('event-popup');
        popup.classList.toggle('visible');
        if (popup.classList.contains('visible')) {
            const input = document.getElementById('event-name-input');
            input.focus();
            input.select();
        }
    },
    
    saveEventName: () => {
        const input = document.getElementById('event-name-input');
        if (input.value.trim()) {
            app.eventFunctionName = input.value.trim();
            document.getElementById('event-popup').classList.remove('visible');
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
        const eventPopup = document.getElementById('event-popup');
        if (eventPopup) eventPopup.classList.remove('visible');
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
        let nextCode = String(scenario.code || '');
        if (scenario.kind === 'html') {
            const parsed = extractScenarioHtml(scenario.html);
            nextCode = parsed.code;
            app.editorBuffers.html = parsed.domHtml || '<body></body>';
            app.editorBuffers.css = parsed.css || '';
            app.currentDomHtml = app.editorBuffers.html;
            app.currentDomCss = app.editorBuffers.css;
            ui.updateDom(createVirtualDocument(app.currentDomHtml), app.currentDomCss);
        }
        app.editorBuffers.js = nextCode;
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
        app.editorBuffers.html = parsed.domHtml || '<body></body>';
        app.editorBuffers.css = parsed.css || '';
        app.editorBuffers.js = parsed.code || '';
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
            if (normalized.domHtml !== null) app.editorBuffers.html = normalized.domHtml || '<body></body>';
            if (normalized.css !== null) app.editorBuffers.css = String(normalized.css || '');
            if (normalized.code !== null) app.editorBuffers.js = String(normalized.code);
            if (normalized.code !== null) app.currentEditorMode = 'js';
            app.hydrateDomStateFromBuffers();
            ui.updateDom(createVirtualDocument(app.currentDomHtml), app.currentDomCss);
            app.applyEditorModeToInput();
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

        return true;
    },
    
    triggerEvent: () => {
        if (app.interpreter) app.interpreter.invokeEvent(app.eventFunctionName);
    }
};
