// @ts-nocheck
// File purpose: primary UI state container that composes specialized UI method modules.
import { TokenType } from '../core/language';
import { formatValue } from '../core/config';
import { isVirtualDomValue } from '../core/virtualDom';
import { refreshIcons } from './icons';
import {
    escapeHtml,
    classNameForTokenType,
    renderTemplateStringValue,
    renderHtmlCode,
    renderCssCode
} from './markup';
import {
    valueToVisualText,
    valueToCodeVisualText,
    valueToCodePreviewText,
    getCodePreviewTypeLabel,
    getMemoryTypeLabel,
    buildMemoryMetaHtml,
    wrapMemoryValueMarkup,
    applyToggleButtonState
} from './valueFormatting';
import { createConsoleValueNode, filterRuntimeStack } from './consoleTree';
import {
    resolveVirtualDomNodeByPath,
    buildDomPreviewDocument,
    getDomTreeRef,
    buildDomTreeMarkup,
    buildDomInlineValueMarkup,
    mapDomPropertyToAttr,
    createDomFlyBadgeElement
} from './domHelpers';
import { getFlowVisualElement, createFlowGuideLine } from './flowGuide';
import { attachExecutionControls } from './executionControls';
import { attachDomMethods } from './domAnimationPanel';
import { attachMemoryMethods } from './memoryPanel';
import { attachTokenAnimationMethods } from './tokenAnimations';
import { attachOptionsMethods } from './uiOptions';
import { attachTooltipMethods } from './uiTooltips';
import { attachLayoutMethods } from './uiLayout';

export const ui = {
    modifiedTokens: new Map(), lockedTokens: new Set(), 
    speedMultiplier: 1, baseDelay: 800, globalScale: 14, 
    skipMode: false, isDrawerOpen: false, isStopping: false,
    currentWaitResolver: null,
    heapRefs: new WeakMap(),
    heapRefCounter: 1,
    currentMemoryVarSnapshot: new Map(),
    currentPropertyTokenSnapshot: new Map(),
    memoryDomPreviewRefs: new Map(),
    memoryDomTooltipEl: null,
    memoryDomTooltipAnchorEl: null,
    memoryDomTooltipBound: false,
    memoryArrayPortalEl: null,
    memoryArrayPortalCleanup: null,
    detachedDomPortalEl: null,
    detachedDomPortalPanelEl: null,
    detachedDomPortalCleanup: null,
    codeValueTooltipEl: null,
    codeValueTooltipAnchorEl: null,
    codeValueTooltipBound: false,
    domDocument: null,
    domCss: '',
    p5ModeEnabled: false,
    p5RuntimeSrcdoc: '',
    p5RuntimeKey: '',
    domViewMode: 'tree',
    showDomRender: true,
    readVisualizationMode: 'both',
    showFlowLine: true,
    showDataFlow: true,
    showMemoryTypes: false,
    showMemoryAddresses: false,
    breakpointLines: new Set(),
    softBreakpointLines: new Set(),
    lineCount: 0,
    breakpointsInitialized: false,
    breakpointsDefaultAll: true,
    pendingBreakpointReinit: false,
    lineNumberHandlersBound: false,
    breakpointDragActive: false,
    breakpointDragValue: true,
    breakpointDragPointerId: null,
    lastPauseProbeLine: null,
    pauseContext: {
        soft: false,
        line: 0
    },
    stepMode: 'instruction',
    pendingAutoMicroPause: false,
    microSkipToNextInstruction: false,
    lastScopeStack: null,
    activeSubTool: null,
    
    speeds: [0.1, 0.25, 0.5, 1, 1.5, 2, 4],
    speedIndex: 3, 
    adjustSpeed: (delta) => {
        ui.speedIndex = Math.max(0, Math.min(ui.speeds.length - 1, ui.speedIndex + delta));
        ui.speedMultiplier = ui.speeds[ui.speedIndex];
        document.getElementById('speed-display').innerText = ui.speedMultiplier + 'x';
        document.documentElement.style.setProperty('--time-scale', 1 / ui.speedMultiplier);
    },
    getReadVisualizationLabel: (mode = ui.readVisualizationMode) => {
        if (mode === 'line') return 'Liaison';
        if (mode === 'data') return 'Donnees';
        return 'Liaison + donnees';
    },
    setReadVisualizationMode: (mode = 'both') => {
        const normalized = String(mode || '').trim().toLowerCase();
        const nextMode = ['line', 'data', 'both'].includes(normalized) ? normalized : 'both';
        ui.readVisualizationMode = nextMode;
        ui.showFlowLine = nextMode !== 'data';
        ui.showDataFlow = nextMode !== 'line';
        if (!ui.showDataFlow) {
            document.querySelectorAll('.flying-element').forEach((el) => el.remove());
            document.querySelectorAll('.flying-dom-node').forEach((el) => el.remove());
        }
        if (!ui.showFlowLine) {
            document.querySelectorAll('.flow-link-line').forEach((el) => el.remove());
            document.querySelectorAll('.flow-link-highlight').forEach((el) => el.classList.remove('flow-link-highlight'));
        }
        ui.updateReadVisualizationControl();
    },
    updateReadVisualizationControl: () => {
        const button = document.getElementById('btn-toggle-read-visualization');
        if (!button) return;
        button.innerText = ui.getReadVisualizationLabel();
        button.classList.add('is-on');
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('data-state', ui.readVisualizationMode);
    },
    cycleReadVisualizationMode: () => {
        const order = ['both', 'line', 'data'];
        const index = order.indexOf(ui.readVisualizationMode);
        const next = order[(index + 1) % order.length];
        ui.setReadVisualizationMode(next);
    },
    updateFlowLineControl: () => {
        ui.updateReadVisualizationControl();
    },
    updateDataFlowControl: () => {
        ui.updateReadVisualizationControl();
    },
    updateMemoryTypesControl: () => {
        const button = document.getElementById('btn-toggle-memory-types');
        applyToggleButtonState(button, ui.showMemoryTypes);
    },
    updateMemoryAddressesControl: () => {
        const button = document.getElementById('btn-toggle-memory-addresses');
        applyToggleButtonState(button, ui.showMemoryAddresses);
    },
    updateDisplayOptionsControls: () => {
        ui.updateReadVisualizationControl();
        ui.updateStepModeControl();
        ui.updateMemoryTypesControl();
        ui.updateMemoryAddressesControl();
        ui.updateBreakpointsToggleControl();
    },
    updateDomRenderToggleControl: () => {
        const button = document.getElementById('btn-toggle-dom-render');
        if (!button) return;
        button.innerText = ui.showDomRender ? 'Rendu ON' : 'Rendu OFF';
        button.classList.toggle('is-on', ui.showDomRender);
        button.setAttribute('aria-pressed', ui.showDomRender ? 'true' : 'false');
    },
    toggleDomRender: (forceState = null) => {
        ui.showDomRender = forceState === null ? !ui.showDomRender : Boolean(forceState);
        ui.renderDomPanel();
    },
    refreshMemoryFromSnapshot: () => {
        if (!ui.lastScopeStack) return;
        ui.updateMemory(ui.lastScopeStack, null, 'none', null, false);
    },
    toggleFlowLine: () => {
        if (ui.readVisualizationMode === 'both') ui.setReadVisualizationMode('data');
        else if (ui.readVisualizationMode === 'data') ui.setReadVisualizationMode('both');
        else ui.setReadVisualizationMode('both');
    },
    toggleDataFlow: () => {
        if (ui.readVisualizationMode === 'both') ui.setReadVisualizationMode('line');
        else if (ui.readVisualizationMode === 'line') ui.setReadVisualizationMode('both');
        else ui.setReadVisualizationMode('both');
    },
    toggleMemoryTypes: () => {
        ui.showMemoryTypes = !ui.showMemoryTypes;
        ui.updateMemoryTypesControl();
        ui.refreshMemoryFromSnapshot();
    },
    toggleMemoryAddresses: () => {
        ui.showMemoryAddresses = !ui.showMemoryAddresses;
        ui.updateMemoryAddressesControl();
        ui.refreshMemoryFromSnapshot();
    },

    updateGlobalFontSize: (delta) => { const newSize = ui.globalScale + delta; if(newSize >= 10 && newSize <= 24) { ui.globalScale = newSize; document.documentElement.style.setProperty('--content-scale', `${newSize}px`); } },
    
    wait: (ms) => { 
        if (ui.isStopping) return Promise.resolve();
        const appRunning = Boolean(window.app && window.app.isRunning);
        if (ui.skipMode) return Promise.resolve(); 
        if (appRunning && ui.shouldFastForwardExecution()) return Promise.resolve();
        return new Promise(resolve => {
            ui.currentWaitResolver = resolve;
            setTimeout(() => {
                if (ui.currentWaitResolver === resolve) {
                    ui.currentWaitResolver = null;
                    resolve();
                }
            }, ms / ui.speedMultiplier);
        });
    },

    stopAnimations: () => {
        ui.hideMemoryDomTooltip();
        ui.hideCodeValueTooltip();
        ui.hideMemoryArrayPortal();
        ui.hideDetachedDomPortal();
        document.querySelectorAll('.flying-element').forEach(el => el.remove());
        document.querySelectorAll('.flying-dom-node').forEach(el => el.remove());
        document.querySelectorAll('.flow-link-line').forEach(el => el.remove());
        document.querySelectorAll('.expr-flow-target').forEach(el => el.remove());
        document.querySelectorAll('.expr-collapse-highlight').forEach(el => el.remove());
        document.querySelectorAll('.dom-group-highlight-box').forEach(el => el.remove());
        document.querySelectorAll('.dom-insert-target').forEach(el => el.remove());
        document.querySelectorAll('.flow-link-highlight').forEach(el => el.classList.remove('flow-link-highlight'));
        document.querySelectorAll('.dom-highlight').forEach(el => el.classList.remove('dom-highlight'));
        document.querySelectorAll('.dom-parent-highlight').forEach(el => el.classList.remove('dom-parent-highlight'));
        document.querySelectorAll('.dom-replaced-highlight').forEach(el => el.classList.remove('dom-replaced-highlight'));
        document.querySelectorAll('.dom-insert-space').forEach(el => el.classList.remove('dom-insert-space'));
        document.querySelectorAll('.dom-remove-leave').forEach(el => el.classList.remove('dom-remove-leave'));
        document.querySelectorAll('.dom-attr-highlight').forEach(el => el.classList.remove('dom-attr-highlight'));
        document.querySelectorAll('.line-number-item.is-current-line, .line-number-item.is-stack-frame').forEach((el) => {
            el.classList.remove('is-current-line');
            el.classList.remove('is-stack-frame');
        });
    },

    renderCode: (tokens) => {
        const display = document.getElementById('code-display');
        display.innerHTML = ''; let html = '';
        tokens.forEach(t => {
            const className = classNameForTokenType(t.type);
            if (t.type === 'WHITESPACE') {
                html += t.value;
            } else if (t.type === TokenType.STRING && t.value.startsWith('`') && t.value.endsWith('`')) {
                html += `<span id="${t.id}" data-code-token-id="${t.id}" class="${className}">${renderTemplateStringValue(t.value)}</span>`;
            } else {
                const varAttr = t.type === TokenType.IDENTIFIER ? ` data-code-var="${escapeHtml(t.value)}"` : '';
                html += `<span id="${t.id}" data-code-token-id="${t.id}" class="${className}"${varAttr}>${escapeHtml(t.value)}</span>`;
            }
        });
        display.innerHTML = html;
        ui.initCodeValueTooltip();
        ui.currentPropertyTokenSnapshot.clear();
        ui.modifiedTokens.clear(); ui.lockedTokens.clear();
    },
    renderPlainCode: (text, mode = 'text') => {
        const display = document.getElementById('code-display');
        if (!display) return;
        const rawText = String(text || '');
        let markup = '';
        if (mode === 'html') markup = renderHtmlCode(rawText);
        else if (mode === 'css') markup = renderCssCode(rawText);
        else markup = `<span class="tok-ident">${escapeHtml(rawText)}</span>`;
        display.innerHTML = markup;
        ui.currentPropertyTokenSnapshot.clear();
        ui.modifiedTokens.clear();
        ui.lockedTokens.clear();
    },
    resetDisplay: (options = {}) => { 
        const keepConsole = typeof options === 'boolean' ? options : Boolean(options.keepConsole);
        const globalEditor = window.editor;
        if (globalEditor && typeof globalEditor.refresh === 'function') {
            globalEditor.refresh();
        }
        ui.resetVisuals();
        document.getElementById('highlight-layer').innerHTML = ''; 
        document.getElementById('memory-container').innerHTML = ''; 
        if (!keepConsole) document.getElementById('console-output').innerHTML = '';
        ui.hideMemoryDomTooltip();
        ui.hideCodeValueTooltip();
        ui.hideMemoryArrayPortal();
        ui.hideDetachedDomPortal();
        ui.currentMemoryVarSnapshot.clear();
        ui.currentPropertyTokenSnapshot.clear();
        ui.modifiedTokens.clear(); 
        ui.lockedTokens.clear(); 
        ui.setStepButtonState(false); 
        ui.setEventMode(false);
        if(window.innerWidth < 800) {
            document.getElementById('right-panel').classList.remove('open');
            ui.isDrawerOpen = false;
        }
        document.getElementById('code-wrapper').scrollTo(0, 0);
        ui.currentWaitResolver = null;
        ui.lastPauseProbeLine = null;
        ui.pauseContext = { soft: false, line: 0 };
        ui.pendingAutoMicroPause = false;
        ui.microSkipToNextInstruction = false;
    },
    updateLineNumbers: (text) => {
        const lines = Math.max(1, String(text || '').split('\n').length);
        ui.bindLineNumberHandlers();
        ui.normalizeBreakpoints(lines);
        for (const line of Array.from(ui.breakpointLines)) {
            if (ui.isEmptyEditorLine(line)) ui.breakpointLines.delete(line);
        }
        const lineNumbers = document.getElementById('line-numbers');
        if (!lineNumbers) return;
        const itemsHtml = Array(lines)
            .fill(0)
            .map((_, index) => {
                const line = index + 1;
                return `<button type="button" class="line-number-item" data-line="${line}">${line}</button>`;
            })
            .join('');
        lineNumbers.innerHTML = itemsHtml;
        ui.refreshLineNumberBreakpointClasses();
        ui.updateBreakpointsToggleControl();
    },
    syncScroll: () => { 
        const wrapper = document.getElementById('code-wrapper'); 
        const lineNums = document.getElementById('line-numbers');
        lineNums.scrollTop = wrapper.scrollTop;
    },
    setRunningState: (running) => { 
        // Mise à jour de l'état du bouton Play/Stop
        const btnRun = document.getElementById('btn-toggle-run');
        if (running) {
            ui.lastPauseProbeLine = 0;
            btnRun.innerHTML = '<i data-lucide="square"></i>';
            btnRun.classList.add('btn-stop-mode');
            btnRun.setAttribute('data-tooltip', 'play/stop');
            btnRun.setAttribute('aria-label', 'play/stop');
            refreshIcons();
        } else {
            btnRun.innerHTML = '<i data-lucide="play"></i>';
            btnRun.classList.remove('btn-stop-mode');
            btnRun.setAttribute('data-tooltip', 'play/stop');
            btnRun.setAttribute('aria-label', 'play/stop');
            refreshIcons();
        }
        
        document.getElementById('btn-next').disabled = !running; 
        document.getElementById('btn-skip').disabled = !running; 
        document.getElementById('code-input').readOnly = running; 
        document.getElementById('code-input').style.pointerEvents = running ? 'none' : 'auto';
        document.getElementById('code-display').style.pointerEvents = running ? 'auto' : 'none';
        if(!running) document.getElementById('highlight-layer').innerHTML = ''; 
        if(!running) {
            ui.hideCodeValueTooltip();
            ui.pauseContext = { soft: false, line: 0 };
            ui.pendingAutoMicroPause = false;
            const lineNumbers = document.getElementById('line-numbers');
            if (lineNumbers) {
                lineNumbers.querySelectorAll('.line-number-item.is-current-line, .line-number-item.is-stack-frame').forEach((element) => {
                    element.classList.remove('is-current-line');
                    element.classList.remove('is-stack-frame');
                });
            }
        }
    },
    setStepButtonState: (enabled) => { 
        document.getElementById('btn-next').disabled = !enabled; 
        document.getElementById('btn-skip').disabled = !ui.isStopping && !enabled && false; 
    },
    setEventMode: (enabled) => {
        const triggerBtn = document.getElementById('btn-trigger');
        if (triggerBtn) triggerBtn.disabled = !enabled;
        const nextBtn = document.getElementById('btn-next');
        const skipBtn = document.getElementById('btn-skip');
        if (nextBtn) nextBtn.disabled = true;
        if (skipBtn) skipBtn.disabled = true;
    },
    switchDomView: () => {},
    updateDom: (domDocument, domCss = undefined) => {
        ui.domDocument = domDocument || null;
        if (domCss !== undefined) ui.domCss = String(domCss || '');
        ui.renderDomPanel();
    },
    getP5RuntimeFrame: () => {
        const memoryPanel = document.getElementById('memory-render-panel');
        if (memoryPanel) {
            const frameInMemory = memoryPanel.querySelector('iframe.p5-runtime-frame');
            if (frameInMemory) return frameInMemory;
        }
        const renderView = document.getElementById('dom-view-render');
        if (!renderView) return null;
        return renderView.querySelector('iframe.p5-runtime-frame');
    },
    renderP5RuntimeInContainer: (container) => {
        if (!container) return;
        const currentKey = String(ui.p5RuntimeKey || '');
        const existingFrame = container.querySelector('iframe.p5-runtime-frame');
        if (existingFrame && existingFrame.dataset.runtimeKey === currentKey) return;
        const iframe = document.createElement('iframe');
        iframe.className = 'dom-render-frame p5-runtime-frame';
        iframe.setAttribute('title', 'Apercu p5.js');
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
        iframe.dataset.runtimeKey = currentKey;
        iframe.srcdoc = ui.p5RuntimeSrcdoc || '<!doctype html><html><body></body></html>';
        container.innerHTML = '';
        container.appendChild(iframe);
    },
    updateP5PanelsLayout: () => {
        const tabDom = document.getElementById('tab-dom');
        const viewMemory = document.getElementById('view-memory');
        const memoryRenderPanel = document.getElementById('memory-render-panel');
        if (tabDom) tabDom.style.display = ui.p5ModeEnabled ? 'none' : '';
        if (viewMemory) viewMemory.classList.toggle('p5-split', Boolean(ui.p5ModeEnabled && ui.showDomRender));
        if (!memoryRenderPanel) return;
        if (ui.p5ModeEnabled && ui.showDomRender) {
            memoryRenderPanel.classList.add('active');
            ui.renderP5RuntimeInContainer(memoryRenderPanel);
        } else {
            memoryRenderPanel.classList.remove('active');
            memoryRenderPanel.innerHTML = '';
        }
    },
    setP5RuntimeMode: (enabled = false, srcdoc = '', runtimeKey = '') => {
        ui.p5ModeEnabled = Boolean(enabled);
        if (ui.p5ModeEnabled) {
            ui.p5RuntimeSrcdoc = String(srcdoc || '');
            ui.p5RuntimeKey = String(runtimeKey || '');
        } else {
            ui.p5RuntimeSrcdoc = '';
            ui.p5RuntimeKey = '';
        }
        if (ui.p5ModeEnabled) {
            const domTab = document.getElementById('tab-dom');
            if (domTab && domTab.classList.contains('active')) ui.switchTab('memory');
        }
        ui.updateP5PanelsLayout();
        ui.renderDomPanel();
    },
    log: (msg, type='info') => {
        if(ui.isStopping) return;
        const div = document.createElement('div');
        div.className = `log-entry log-${type}`;
        div.innerText = msg;
        const box = document.getElementById('console-output');
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
        div.classList.add('console-flash');
        const duration = Math.max(200, Math.round(600 / Math.max(0.1, ui.speedMultiplier || 1)));
        window.setTimeout(() => {
            div.classList.remove('console-flash');
        }, duration);
    },
    renderError: async (errorObj = {}) => {
        if (ui.isStopping) return;
        await ui.ensureDrawerOpen('console');
        const box = document.getElementById('console-output');
        if (!box) return;

        const rawError = errorObj.errorObject;
        const name = errorObj.name
            || ((rawError && rawError.name) ? String(rawError.name) : 'Error');
        const friendlyMessage = (errorObj.message !== undefined && errorObj.message !== null)
            ? String(errorObj.message)
            : ((rawError && rawError.message) ? String(rawError.message) : 'Erreur runtime');
        const prefix = errorObj.prefix ? `${String(errorObj.prefix)}: ` : '';
        const lineSuffix = (Number.isFinite(errorObj.line) && Number(errorObj.line) > 0 && !String(friendlyMessage).includes('ligne'))
            ? ` (ligne ${Number(errorObj.line)})`
            : '';

        const entry = document.createElement('div');
        entry.className = 'log-entry log-error-entry';

        const title = document.createElement('div');
        title.className = 'console-error-title';
        title.innerText = `${prefix}${name}: ${friendlyMessage}${lineSuffix}`;
        entry.appendChild(title);

        box.appendChild(entry);
        box.scrollTop = box.scrollHeight;
        entry.classList.add('console-flash');
        await ui.wait(600);
        entry.classList.remove('console-flash');
    },
    consoleLog: async (args) => {
        if(ui.isStopping) return;
        await ui.ensureDrawerOpen('console');
        const box = document.getElementById('console-output');
        if (!box) return;
        const entry = document.createElement('div');
        entry.className = 'log-entry log-console-entry';
        const values = Array.isArray(args) ? args : [args];
        values.forEach((arg, index) => {
            const argWrap = document.createElement('span');
            argWrap.className = 'console-arg';
            argWrap.appendChild(createConsoleValueNode(arg, []));
            entry.appendChild(argWrap);
            if (index < values.length - 1) entry.appendChild(document.createTextNode(' '));
        });
        box.appendChild(entry);
        box.scrollTop = box.scrollHeight;
        entry.classList.add('console-flash');
        await ui.wait(600);
        entry.classList.remove('console-flash');
    },

    scrollToLine: (lineNumber) => {
        if(ui.skipMode || ui.isStopping) return;
        const wrapper = document.getElementById('code-wrapper');
        const lineHeight = parseFloat(getComputedStyle(document.getElementById('code-display')).lineHeight) || 24;
        const targetY = (lineNumber - 1) * lineHeight;
        const containerHeight = wrapper.clientHeight;
        
        if (targetY < wrapper.scrollTop + 20 || targetY > wrapper.scrollTop + containerHeight - 60) {
            wrapper.scrollTo({
                top: Math.max(0, targetY - containerHeight / 2),
                behavior: 'smooth'
            });
        }
    },

    highlightLines: (lineNumbers) => {
        if(ui.isStopping) return;
        const layer = document.getElementById('highlight-layer'); layer.innerHTML = ''; 
        const lh = parseFloat(getComputedStyle(document.getElementById('code-display')).lineHeight);
        const lineNumberContainer = document.getElementById('line-numbers');
        if (lineNumberContainer) {
            lineNumberContainer.querySelectorAll('.line-number-item.is-current-line, .line-number-item.is-stack-frame').forEach((element) => {
                element.classList.remove('is-current-line');
                element.classList.remove('is-stack-frame');
            });
        }
        if (lineNumbers.length > 0) {
            ui.scrollToLine(lineNumbers[lineNumbers.length - 1]);
        }
        for(let i=0; i<lineNumbers.length - 1; i++) {
            const div = document.createElement('div');
            div.className = 'exec-line-stack';
            div.style.top = `${(lineNumbers[i] - 1) * lh + 10}px`;
            layer.appendChild(div);
            if (lineNumberContainer) {
                const marker = lineNumberContainer.querySelector(`.line-number-item[data-line="${lineNumbers[i]}"]`);
                if (marker) marker.classList.add('is-stack-frame');
            }
        }
        if (lineNumbers.length > 0) {
            const currentLine = lineNumbers[lineNumbers.length - 1];
            const div = document.createElement('div');
            div.className = 'exec-line';
            div.style.top = `${(currentLine - 1) * lh + 10}px`;
            layer.appendChild(div);
            if (lineNumberContainer) {
                const marker = lineNumberContainer.querySelector(`.line-number-item[data-line="${currentLine}"]`);
                if (marker) marker.classList.add('is-current-line');
            }
        }
    },

    ensureVisible: (elementId) => { 
        const el = document.getElementById(elementId); 
        if (el) { el.scrollIntoView({ behavior: 'auto', block: 'center' }); }
    },

};

// Compose specialized UI behaviors into one shared `ui` state object.
attachExecutionControls(ui);
attachOptionsMethods(ui);
attachLayoutMethods(ui);
attachTooltipMethods(ui, {
    getCodePreviewTypeLabel,
    isVirtualDomValue,
    buildDomTreeMarkup,
    valueToCodePreviewText,
    escapeHtml,
    getMemoryTypeLabel,
    valueToVisualText,
    buildMemoryMetaHtml,
    wrapMemoryValueMarkup
});
attachDomMethods(ui, {
    resolveVirtualDomNodeByPath,
    getDomTreeRef,
    mapDomPropertyToAttr,
    getFlowVisualElement,
    createFlowGuideLine,
    formatValue,
    createDomFlyBadgeElement,
    buildDomTreeMarkup,
    buildDomPreviewDocument
});
attachMemoryMethods(ui, {
    isVirtualDomValue,
    escapeHtml,
    buildDomInlineValueMarkup,
    buildMemoryMetaHtml,
    wrapMemoryValueMarkup,
    valueToVisualText,
    getMemoryTypeLabel
});
attachTokenAnimationMethods(ui, {
    getFlowVisualElement,
    createFlowGuideLine,
    valueToVisualText,
    valueToCodeVisualText,
    formatValue,
    isVirtualDomValue,
    buildDomInlineValueMarkup
});

export const consoleUI = { clear: () => document.getElementById('console-output').innerHTML = '' };
