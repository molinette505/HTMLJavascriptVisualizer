// @ts-nocheck
import { Interpreter } from '../core/interpreter';
import { SCENARIOS } from '../core/scenarios';
import { DOM_DOCUMENTS } from '../core/domDocuments';
import { createVirtualDocument } from '../core/virtualDom';
import { ui, consoleUI } from './ui';
import { editor } from './editor';

export const app = {
    interpreter: null,
    isRunning: false,
    eventFunctionName: 'onClick',
    scenarios: SCENARIOS,
    domDocuments: DOM_DOCUMENTS,
    currentDomHtml: DOM_DOCUMENTS.length > 0 ? DOM_DOCUMENTS[0].html : '<body></body>',
    pendingScenarioLoadTimer: null,
    
    toggleRun: () => {
        if (app.isRunning) {
            app.stop();
        } else {
            app.start();
        }
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
        if(app.interpreter) { app.interpreter.stop(); }
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
        const domSelect = document.getElementById('load-dom-select');
        const loadButton = document.getElementById('btn-load');
        if (!select || !domSelect || !loadButton) return;
        if (app.scenarios.length === 0) {
            select.innerHTML = '<option value="">Aucune sauvegarde</option>';
        } else {
            select.innerHTML = app.scenarios
                .map((scenario, index) => `<option value="${index}">${scenario.title}</option>`)
                .join('');
            select.value = '0';
        }
        if (app.domDocuments.length === 0) {
            domSelect.innerHTML = '<option value="">Aucun document HTML</option>';
        } else {
            domSelect.innerHTML = app.domDocuments
                .map((documentItem, index) => `<option value="${index}">${documentItem.title}</option>`)
                .join('');
            domSelect.value = '0';
            app.currentDomHtml = app.domDocuments[0].html;
            ui.updateDom(createVirtualDocument(app.currentDomHtml));
        }
        loadButton.disabled = app.scenarios.length === 0 && app.domDocuments.length === 0;
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
        input.value = scenario.code;
        editor.history = [scenario.code];
        editor.historyIdx = 0;
        editor.adjustHeight();
        editor.refresh();
        consoleUI.clear();
        if (scenario.domDocumentId) {
            const domIndex = app.domDocuments.findIndex((doc) => doc.id === scenario.domDocumentId);
            if (domIndex !== -1) {
                const domItem = app.domDocuments[domIndex];
                app.currentDomHtml = domItem.html;
                ui.updateDom(createVirtualDocument(app.currentDomHtml));
                const domSelect = document.getElementById('load-dom-select');
                if (domSelect) domSelect.value = String(domIndex);
                ui.log(`Document HTML associe charge: ${domItem.title}`, 'info');
            }
        }
        ui.log(`Sauvegarde chargee: ${scenario.title}`, 'info');
        const popup = document.getElementById('load-popup');
        if (popup) popup.classList.remove('visible');
    },

    applyDomDocument: (documentItem) => {
        app.currentDomHtml = documentItem.html;
        ui.updateDom(createVirtualDocument(app.currentDomHtml));
        ui.log(`Document HTML charge: ${documentItem.title}`, 'info');
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

    loadSelectedDomDocument: () => {
        const domSelect = document.getElementById('load-dom-select');
        if (!domSelect) return;
        const index = parseInt(domSelect.value, 10);
        if (Number.isNaN(index) || index < 0 || index >= app.domDocuments.length) return;
        const documentItem = app.domDocuments[index];
        if (app.isRunning) {
            app.stop();
            app.pendingScenarioLoadTimer = setTimeout(() => {
                app.applyDomDocument(documentItem);
                app.pendingScenarioLoadTimer = null;
            }, 90);
            return;
        }
        app.applyDomDocument(documentItem);
    },
    
    triggerEvent: () => {
        if (app.interpreter) {
            app.interpreter.invokeEvent(app.eventFunctionName);
        }
    }
};
