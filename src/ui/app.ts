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
        app.editorBuffers.js = formatLoadedText(defaultJsCode || '', 'js');
        app.editorBuffers.html = formatLoadedText('<body></body>', 'html');
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

        return true;
    },
    
    triggerEvent: () => {
        if (app.interpreter) app.interpreter.invokeEvent(app.eventFunctionName);
    },
    dispatchDomClick: async (domPath = '') => {
        if (!app.interpreter || typeof app.interpreter.invokeDomClick !== 'function') return;
        await app.interpreter.invokeDomClick(domPath);
    }
};
