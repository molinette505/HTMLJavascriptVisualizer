// @ts-nocheck
import { Interpreter } from '../core/interpreter';
import { SCENARIOS } from '../core/scenarios';
import { createVirtualDocument } from '../core/virtualDom';
import { ui, consoleUI } from './ui';
import { editor } from './editor';

const extractScenarioHtml = (rawHtml) => {
    const source = String(rawHtml || '').trim();
    if (!source) return { code: '', domHtml: '<body></body>' };
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/i;
    const match = source.match(scriptRegex);
    const code = match ? String(match[1] || '').trim() : '';
    const domHtml = (match ? source.replace(scriptRegex, '').trim() : source) || '<body></body>';
    return { code, domHtml };
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
    let label = 'Externe';
    let clearConsole = true;
    let run = false;

    if (typeof payload === 'string') {
        code = payload;
    } else if (payload && typeof payload === 'object') {
        if (typeof payload.js === 'string') code = payload.js;
        else if (typeof payload.code === 'string') code = payload.code;

        if (typeof payload.html === 'string') {
            const parsed = extractScenarioHtml(payload.html);
            domHtml = parsed.domHtml;
            if (code === null && parsed.code) code = parsed.code;
        } else if (typeof payload.domHtml === 'string') {
            domHtml = payload.domHtml || '<body></body>';
        }

        if (typeof payload.label === 'string' && payload.label.trim()) label = payload.label.trim();
        else if (typeof payload.source === 'string' && payload.source.trim()) label = payload.source.trim();
        else if (typeof payload.title === 'string' && payload.title.trim()) label = payload.title.trim();

        if (typeof payload.clearConsole === 'boolean') clearConsole = payload.clearConsole;
        if (typeof payload.run === 'boolean') run = payload.run;
    }

    return {
        code,
        domHtml,
        label,
        clearConsole,
        run,
        hasContent: code !== null || domHtml !== null
    };
};

export const app = {
    interpreter: null,
    isRunning: false,
    eventFunctionName: 'onClick',
    scenarios: SCENARIOS,
    currentDomHtml: '<body></body>',
    pendingScenarioLoadTimer: null,
    
    toggleRun: () => {
        if (app.isRunning) app.stop();
        else app.start();
    },
    
    start: () => {
        const code = document.getElementById('code-input').value;
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
    },

    toggleLoadPopup: () => {
        const eventPopup = document.getElementById('event-popup');
        if (eventPopup) eventPopup.classList.remove('visible');
        const popup = document.getElementById('load-popup');
        if (!popup) return;
        popup.classList.toggle('visible');
        if (popup.classList.contains('visible')) {
            const select = document.getElementById('load-scenario-select');
            if (select) select.focus();
        }
    },

    applyScenario: (scenario) => {
        const input = document.getElementById('code-input');
        if (!input) return;
        let nextCode = String(scenario.code || '');
        if (scenario.kind === 'html') {
            const parsed = extractScenarioHtml(scenario.html);
            nextCode = parsed.code;
            app.currentDomHtml = parsed.domHtml;
            ui.updateDom(createVirtualDocument(app.currentDomHtml));
        }
        input.value = nextCode;
        editor.history = [nextCode];
        editor.historyIdx = 0;
        editor.adjustHeight();
        editor.refresh();
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

    loadExternalContent: (payload) => {
        const normalized = normalizeExternalContent(payload);
        if (!normalized.hasContent) {
            ui.log('Chargement externe ignore: aucun JS/HTML fourni.', 'warn');
            return false;
        }

        const apply = () => {
            if (normalized.domHtml !== null) {
                app.currentDomHtml = normalized.domHtml || '<body></body>';
                ui.updateDom(createVirtualDocument(app.currentDomHtml));
            }
            if (normalized.code !== null) setEditorCode(String(normalized.code));
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
    
    triggerEvent: () => {
        if (app.interpreter) app.interpreter.invokeEvent(app.eventFunctionName);
    }
};
