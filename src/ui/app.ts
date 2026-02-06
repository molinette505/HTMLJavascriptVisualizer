// @ts-nocheck
import { Interpreter } from '../core/interpreter';
import { ui, consoleUI } from './ui';

export const app = {
    interpreter: null,
    isRunning: false,
    eventFunctionName: 'onClick',
    
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
        app.interpreter = new Interpreter(ui);
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
    
    triggerEvent: () => {
        if (app.interpreter) {
            app.interpreter.invokeEvent(app.eventFunctionName);
        }
    }
};
