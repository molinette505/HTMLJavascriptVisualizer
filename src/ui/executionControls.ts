// @ts-nocheck
// File purpose: breakpoint, pause-probe, and stepping-control methods attached to ui.
import { refreshIcons } from './icons';

// Attach stepping and breakpoint behavior used by interpreter pause decisions.
export const attachExecutionControls = (ui) => {
    Object.assign(ui, {
    hasAnyBreakpoints: () => (ui.breakpointLines.size + ui.softBreakpointLines.size) > 0,
    countHardBreakpointCandidates: () => {
        const count = Math.max(1, Number(ui.lineCount) || 1);
        let candidates = 0;
        for (let line = 1; line <= count; line++) {
            if (!ui.isEmptyEditorLine(line)) candidates += 1;
        }
        return candidates;
    },
    getEditorLineText: (line) => {
        const normalized = Number(line);
        if (!Number.isFinite(normalized) || normalized <= 0) return '';
        const input = document.getElementById('code-input');
        if (!input) return '';
        const lines = String(input.value || '').split('\n');
        return lines[normalized - 1] || '';
    },
    isEmptyEditorLine: (line) => String(ui.getEditorLineText(line)).trim().length === 0,
    clearBreakpoints: (resumeIfNeeded = false) => {
        ui.breakpointLines.clear();
        ui.softBreakpointLines.clear();
        ui.breakpointsDefaultAll = false;
        ui.refreshLineNumberBreakpointClasses();
        ui.updateBreakpointsToggleControl();
        if (resumeIfNeeded) ui.resumeExecutionIfNoBreakpoints();
    },
    prepareBreakpointsForNewDocument: () => {
        ui.pendingBreakpointReinit = true;
    },
    shouldFastForwardExecution: () => {
        if (ui.stepMode === 'automatic') return false;
        if (ui.stepMode === 'micro') return false;
        return !ui.hasAnyBreakpoints();
    },
    resumeExecutionIfNoBreakpoints: () => {
        if (ui.stepMode === 'automatic') return;
        if (ui.hasAnyBreakpoints()) return;
        ui.skipMode = true;
        const running = Boolean(window.app && window.app.isRunning);
        if (!running) return;
        if (window.app && typeof window.app.stepInstant === 'function') {
            window.app.stepInstant();
        }
    },
    setBreakpointState: (line, enabled) => {
        const normalized = Number(line);
        if (!Number.isFinite(normalized) || normalized <= 0) return false;
        if (enabled) {
            if (ui.isEmptyEditorLine(normalized)) return false;
            ui.breakpointLines.add(normalized);
            ui.softBreakpointLines.delete(normalized);
        }
        else ui.breakpointLines.delete(normalized);
        return true;
    },
    setSoftBreakpointState: (line, enabled) => {
        const normalized = Number(line);
        if (!Number.isFinite(normalized) || normalized <= 0) return false;
        if (enabled) {
            ui.softBreakpointLines.add(normalized);
            ui.breakpointLines.delete(normalized);
        } else {
            ui.softBreakpointLines.delete(normalized);
        }
        return true;
    },
    // Pointer drag lets users paint breakpoints quickly across many lines.
    bindLineNumberHandlers: () => {
        if (ui.lineNumberHandlersBound) return;
        const lineNumbers = document.getElementById('line-numbers');
        if (!lineNumbers) return;
        ui.lineNumberHandlersBound = true;

        const applyFromPointer = (event) => {
            const target = document.elementFromPoint(event.clientX, event.clientY);
            const button = target && target.closest ? target.closest('.line-number-item') : null;
            if (!button || !lineNumbers.contains(button)) return;
            const line = Number(button.getAttribute('data-line') || 0);
            if (!Number.isFinite(line) || line <= 0) return;
            if (!ui.setBreakpointState(line, ui.breakpointDragValue)) return;
            ui.refreshLineNumberBreakpointClasses();
            ui.updateBreakpointsToggleControl();
        };

        const stopDrag = (event = null) => {
            if (!ui.breakpointDragActive) return;
            if (event && lineNumbers.releasePointerCapture && ui.breakpointDragPointerId !== null) {
                try { lineNumbers.releasePointerCapture(ui.breakpointDragPointerId); } catch (error) { /* noop */ }
            }
            ui.breakpointDragActive = false;
            ui.breakpointDragPointerId = null;
            ui.resumeExecutionIfNoBreakpoints();
        };

        lineNumbers.addEventListener('pointerdown', (event) => {
            const target = event.target;
            const button = target && target.closest ? target.closest('.line-number-item') : null;
            if (!button) return;
            event.preventDefault();
            const line = Number(button.getAttribute('data-line') || 0);
            if (!Number.isFinite(line) || line <= 0) return;
            if (event.shiftKey && ui.isEmptyEditorLine(line)) {
                const wasEnabled = ui.softBreakpointLines.has(line);
                ui.setSoftBreakpointState(line, !wasEnabled);
                ui.refreshLineNumberBreakpointClasses();
                ui.updateBreakpointsToggleControl();
                ui.resumeExecutionIfNoBreakpoints();
                return;
            }
            if (ui.isEmptyEditorLine(line)) return;
            const wasEnabled = ui.breakpointLines.has(line);
            ui.breakpointDragValue = !wasEnabled;
            ui.breakpointDragActive = true;
            ui.breakpointDragPointerId = event.pointerId;
            if (lineNumbers.setPointerCapture) {
                try { lineNumbers.setPointerCapture(event.pointerId); } catch (error) { /* noop */ }
            }
            ui.setBreakpointState(line, ui.breakpointDragValue);
            ui.refreshLineNumberBreakpointClasses();
            ui.updateBreakpointsToggleControl();
        });

        lineNumbers.addEventListener('pointermove', (event) => {
            if (!ui.breakpointDragActive) return;
            applyFromPointer(event);
        });

        lineNumbers.addEventListener('pointerup', (event) => stopDrag(event));
        lineNumbers.addEventListener('pointercancel', (event) => stopDrag(event));
        lineNumbers.addEventListener('lostpointercapture', () => stopDrag());
    },
    normalizeBreakpoints: (lineCount) => {
        const count = Math.max(1, Number(lineCount) || 1);
        const previousCount = Math.max(0, Number(ui.lineCount) || 0);
        const previousSize = ui.breakpointLines.size;
        const hadAllSelected = previousCount > 0 && previousSize >= previousCount;
        const hadNoneSelected = previousSize === 0;
        const next = new Set();
        const nextSoft = new Set();
        if (!ui.breakpointsInitialized || ui.pendingBreakpointReinit) {
            if (ui.breakpointsDefaultAll) {
                for (let line = 1; line <= count; line++) {
                    if (!ui.isEmptyEditorLine(line)) next.add(line);
                }
            }
            ui.breakpointLines = next;
            ui.softBreakpointLines = nextSoft;
            ui.lineCount = count;
            ui.breakpointsInitialized = true;
            ui.pendingBreakpointReinit = false;
            return;
        }
        if (hadAllSelected) {
            for (let line = 1; line <= count; line++) {
                if (!ui.isEmptyEditorLine(line)) next.add(line);
            }
            ui.breakpointLines = next;
            ui.softBreakpointLines = nextSoft;
            ui.lineCount = count;
            return;
        }
        for (const line of ui.breakpointLines) {
            if (line >= 1 && line <= count && !ui.isEmptyEditorLine(line)) next.add(line);
        }
        for (const line of ui.softBreakpointLines) {
            if (line >= 1 && line <= count && !next.has(line)) nextSoft.add(line);
        }
        if (!hadNoneSelected && count > previousCount) {
            for (let line = previousCount + 1; line <= count; line++) next.add(line);
        }
        ui.breakpointLines = next;
        ui.softBreakpointLines = nextSoft;
        ui.lineCount = count;
    },
    refreshLineNumberBreakpointClasses: () => {
        const lineNumbers = document.getElementById('line-numbers');
        if (!lineNumbers) return;
        const kindForLine = (line) => {
            if (ui.breakpointLines.has(line)) return 'hard';
            if (ui.softBreakpointLines.has(line)) return 'soft';
            return 'none';
        };
        const items = lineNumbers.querySelectorAll('.line-number-item');
        items.forEach((item) => {
            const line = Number(item.getAttribute('data-line') || 0);
            const kind = kindForLine(line);
            const prevKind = kindForLine(line - 1);
            const nextKind = kindForLine(line + 1);
            item.classList.toggle('has-breakpoint', kind === 'hard');
            item.classList.toggle('has-soft-breakpoint', kind === 'soft');
            item.classList.remove('bp-single', 'bp-start', 'bp-mid', 'bp-end');
            if (kind === 'none') return;
            const samePrev = prevKind === kind;
            const sameNext = nextKind === kind;
            if (!samePrev && !sameNext) item.classList.add('bp-single');
            else if (!samePrev && sameNext) item.classList.add('bp-start');
            else if (samePrev && sameNext) item.classList.add('bp-mid');
            else item.classList.add('bp-end');
        });
    },
    updateBreakpointsToggleControl: () => {
        const button = document.getElementById('btn-breakpoints-toggle');
        if (!button) return;
        const candidateCount = ui.countHardBreakpointCandidates();
        const allSelected = candidateCount > 0 && ui.breakpointLines.size >= candidateCount && ui.softBreakpointLines.size === 0;
        const partial = !allSelected && ui.hasAnyBreakpoints();
        if (!ui.hasAnyBreakpoints()) ui.breakpointsDefaultAll = false;
        else if (allSelected) ui.breakpointsDefaultAll = true;
        button.setAttribute('data-tooltip', 'toggle break points');
        button.setAttribute('aria-pressed', allSelected ? 'true' : 'false');
        button.setAttribute('aria-label', 'toggle break points');
        button.classList.toggle('is-on', allSelected);
        button.classList.toggle('is-partial', partial);
    },
    toggleAllBreakpoints: () => {
        const count = Math.max(1, Number(ui.lineCount) || 1);
        const candidateCount = ui.countHardBreakpointCandidates();
        const allSelected = candidateCount > 0 && ui.breakpointLines.size >= candidateCount && ui.softBreakpointLines.size === 0;
        if (allSelected) {
            ui.breakpointLines.clear();
            ui.softBreakpointLines.clear();
            ui.breakpointsDefaultAll = false;
        } else {
            ui.breakpointLines = new Set();
            ui.softBreakpointLines.clear();
            for (let line = 1; line <= count; line++) {
                if (!ui.isEmptyEditorLine(line)) ui.breakpointLines.add(line);
            }
            ui.breakpointsDefaultAll = true;
        }
        ui.refreshLineNumberBreakpointClasses();
        ui.updateBreakpointsToggleControl();
        ui.resumeExecutionIfNoBreakpoints();
    },
    toggleBreakpoint: (line) => {
        const normalized = Number(line);
        if (!Number.isFinite(normalized) || normalized <= 0) return;
        if (ui.breakpointLines.has(normalized)) ui.setBreakpointState(normalized, false);
        else ui.setBreakpointState(normalized, true);
        ui.refreshLineNumberBreakpointClasses();
        ui.updateBreakpointsToggleControl();
        ui.resumeExecutionIfNoBreakpoints();
    },
    // Returns a rich pause decision object consumed by interpreter.pause().
    shouldPauseAtLine: (line) => {
        const normalized = Number(line);
        if (!Number.isFinite(normalized) || normalized <= 0) return false;
        const prev = Number(ui.lastPauseProbeLine);
        let softPauseBetweenLines = false;
        if (Number.isFinite(prev) && prev >= 0 && ui.softBreakpointLines.size > 0 && prev !== normalized) {
            const increasing = normalized > prev;
            const candidates = Array.from(ui.softBreakpointLines)
                .filter((softLine) => (
                    increasing
                        ? (softLine > prev && softLine < normalized)
                        : (softLine < prev && softLine > normalized)
                ))
                .sort((a, b) => increasing ? (a - b) : (b - a));
            if (candidates.length > 0) {
                softPauseBetweenLines = { pause: true, pauseLine: candidates[0], soft: true };
            }
        }
        if (ui.stepMode === 'automatic') {
            ui.lastPauseProbeLine = normalized;
            return { pause: false, skipMode: false };
        }
        if (ui.stepMode === 'micro') {
            if (softPauseBetweenLines) {
                ui.lastPauseProbeLine = normalized;
                return softPauseBetweenLines;
            }
            const hasHardBreakpoint = ui.breakpointLines.has(normalized);
            const hasSoftBreakpoint = ui.softBreakpointLines.has(normalized);
            ui.lastPauseProbeLine = normalized;
            if (hasSoftBreakpoint) return { pause: true, pauseLine: normalized, soft: true };
            if (hasHardBreakpoint) return true;
            return { pause: false, skipMode: true };
        }
        let pauseDecision = softPauseBetweenLines;
        if (pauseDecision) {
            ui.lastPauseProbeLine = normalized;
            return pauseDecision;
        }
        if (ui.breakpointLines.has(normalized)) {
            ui.lastPauseProbeLine = normalized;
            return true;
        }
        if (ui.softBreakpointLines.has(normalized)) {
            ui.lastPauseProbeLine = normalized;
            return { pause: true, pauseLine: normalized, soft: true };
        }
        ui.lastPauseProbeLine = normalized;
        return pauseDecision;
    },
    resetPauseProbeLine: (line = 0) => {
        const normalized = Number(line);
        ui.lastPauseProbeLine = Number.isFinite(normalized) ? normalized : 0;
    },
    setStepMode: (mode = 'instruction') => {
        const normalized = String(mode || '').trim().toLowerCase();
        const nextMode = ['micro', 'instruction', 'automatic'].includes(normalized) ? normalized : 'instruction';
        ui.stepMode = nextMode;
        ui.pendingAutoMicroPause = false;
        if (nextMode === 'automatic') ui.skipMode = false;
        ui.updateStepModeControl();
    },
    cycleStepMode: () => {
        const order = ['micro', 'instruction'];
        const index = order.indexOf(ui.stepMode);
        const safeIndex = index >= 0 ? index : 1;
        const next = order[(safeIndex + 1) % order.length];
        ui.setStepMode(next);
    },
    getStepModeLabel: () => {
        if (ui.stepMode === 'micro') return 'Micro';
        if (ui.stepMode === 'automatic') return 'Automatique';
        return 'Instruction';
    },
    updateStepModeControl: () => {
        const button = document.getElementById('btn-step-mode') || document.getElementById('btn-toggle-step-mode');
        if (!button) return;
        button.classList.add('is-on');
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('data-state', ui.stepMode);
        const modeMeta = {
            micro: { icon: 'between-vertical-start', label: 'Mode Micro' },
            instruction: { icon: 'between-horizontal-start', label: 'Mode Instruction' },
            automatic: { icon: 'list-video', label: 'Mode Automatique' }
        };
        const current = modeMeta[ui.stepMode] || modeMeta.instruction;
        const useIconButton = button.classList.contains('icon-btn') || button.id === 'btn-step-mode';
        if (useIconButton) {
            button.innerHTML = `<i data-lucide="${current.icon}"></i>`;
            button.setAttribute('data-tooltip', 'toggle step size');
            button.setAttribute('aria-label', `toggle step size (${current.label})`);
            refreshIcons();
        } else {
            button.innerText = ui.getStepModeLabel();
        }
    },
    requestAutoMicroPause: () => {
        ui.pendingAutoMicroPause = true;
    },
    pauseAtMicroCheckpoint: async () => {
        ui.setStepButtonState(true);
        await new Promise((resolve) => {
            ui.currentWaitResolver = () => {
                ui.currentWaitResolver = null;
                resolve();
            };
        });
        ui.setStepButtonState(false);
    },
    maybePauseAfterMicroStep: async () => {
        if (ui.isStopping) return;
        const appRunning = Boolean(window.app && window.app.isRunning);
        if (!appRunning) return;
        if (ui.stepMode === 'micro') {
            if (ui.skipMode) return;
            if (ui.microSkipToNextInstruction) return;
            ui.skipMode = false;
            await ui.pauseAtMicroCheckpoint();
            return;
        }
        if (ui.stepMode === 'automatic' && ui.pendingAutoMicroPause) {
            ui.pendingAutoMicroPause = false;
            ui.skipMode = false;
            await ui.pauseAtMicroCheckpoint();
        }
    },
    setPauseContext: (context = {}) => {
        const line = Number(context && context.line);
        ui.pauseContext = {
            soft: Boolean(context && context.soft),
            line: Number.isFinite(line) && line > 0 ? line : 0
        };
    },
    consumeSoftPauseContext: () => {
        const shouldResumeRealtime = Boolean(ui.pauseContext && ui.pauseContext.soft);
        ui.pauseContext = { soft: false, line: 0 };
        return shouldResumeRealtime;
    },
    });
};
