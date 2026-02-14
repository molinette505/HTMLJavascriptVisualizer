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
    
    triggerEvent: () => {
        if (app.interpreter) app.interpreter.invokeEvent(app.eventFunctionName);
    }
};

