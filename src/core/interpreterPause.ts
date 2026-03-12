// @ts-nocheck
// File purpose: stepping and pause-control policy used by animated execution modes.

export function nextInterpreterStep(interpreter) {
    if (interpreter.resolveNext) {
        const resolver = interpreter.resolveNext;
        interpreter.resolveNext = null;
        resolver();
    }
}

export function stopInterpreter(interpreter) {
    interpreter.shouldStop = true;
    if (interpreter.resolveNext) interpreter.resolveNext();
}

export function shouldPauseInterpreter(interpreter, line) {
    interpreter.pendingPauseLineOverride = null;
    interpreter.pendingPauseSoft = false;
    interpreter.pendingPauseSkipMode = null;
    if (typeof interpreter.shouldPauseAtLine !== 'function') return true;
    try {
        const decision = interpreter.shouldPauseAtLine(line);
        if (decision && typeof decision === 'object') {
            const pauseLine = Number(
                Object.prototype.hasOwnProperty.call(decision, 'pauseLine')
                    ? decision.pauseLine
                    : decision.line
            );
            if (Number.isFinite(pauseLine) && pauseLine > 0) {
                interpreter.pendingPauseLineOverride = pauseLine;
            }
            if (Object.prototype.hasOwnProperty.call(decision, 'soft')) {
                interpreter.pendingPauseSoft = Boolean(decision.soft);
            }
            if (Object.prototype.hasOwnProperty.call(decision, 'skipMode')) {
                interpreter.pendingPauseSkipMode = Boolean(decision.skipMode);
            }
            if (Object.prototype.hasOwnProperty.call(decision, 'pause')) {
                return Boolean(decision.pause);
            }
            return true;
        }
        return Boolean(decision);
    } catch (error) {
        return true;
    }
}

export function shouldFastForwardInterpreter(interpreter) {
    if (typeof interpreter.shouldFastForwardExecution !== 'function') return false;
    try {
        return Boolean(interpreter.shouldFastForwardExecution());
    } catch (error) {
        return false;
    }
}

// Central pause gate shared by manual stepping and breakpoint-driven execution.
export async function pauseInterpreter(interpreter, line) {
    if (interpreter.shouldStop) throw new Error('STOP');
    if (interpreter.ui && interpreter.ui.stepMode === 'micro' && interpreter.ui.microSkipToNextInstruction) {
        interpreter.ui.microSkipToNextInstruction = false;
        interpreter.ui.skipMode = false;
    }
    if (interpreter.pauseSuppressionDepth > 0) return;
    const shouldPauseNow = shouldPauseInterpreter(interpreter, line);
    const pauseLine = shouldPauseNow
        ? (
            Number.isFinite(interpreter.pendingPauseLineOverride) && interpreter.pendingPauseLineOverride > 0
                ? interpreter.pendingPauseLineOverride
                : line
        )
        : line;
    const pauseIsSoft = shouldPauseNow ? Boolean(interpreter.pendingPauseSoft) : false;
    const skipModeOverride = interpreter.pendingPauseSkipMode;
    interpreter.pendingPauseLineOverride = null;
    interpreter.pendingPauseSoft = false;
    interpreter.pendingPauseSkipMode = null;
    interpreter.lastPausedLine = pauseLine;
    if (!shouldPauseNow) {
        interpreter.ui.skipMode = (typeof skipModeOverride === 'boolean') ? skipModeOverride : true;
        return;
    }
    if (interpreter.ui && typeof interpreter.ui.setPauseContext === 'function') {
        interpreter.ui.setPauseContext({ soft: pauseIsSoft, line: pauseLine });
    }
    interpreter.ui.skipMode = false;
    interpreter.ui.setStepButtonState(false);
    interpreter.ui.resetVisuals();
    const activeLines = [...interpreter.callStack, pauseLine];
    interpreter.ui.highlightLines(activeLines);
    await interpreter.ui.updateMemory(interpreter.scopeStack);
    interpreter.ui.setStepButtonState(true);
    await new Promise((resolve) => {
        interpreter.resolveNext = resolve;
    });
    interpreter.ui.setStepButtonState(false);
    if (interpreter.shouldStop) throw new Error('STOP');
}

export async function executeWithSuppressedPause(interpreter, node) {
    interpreter.pauseSuppressionDepth += 1;
    try {
        return await interpreter.execute(node);
    } finally {
        interpreter.pauseSuppressionDepth = Math.max(0, interpreter.pauseSuppressionDepth - 1);
    }
}

export function buildPedagogicalStack(interpreter, lineHint = interpreter.lastPausedLine) {
    const currentLine = Number.isFinite(lineHint) && lineHint > 0 ? Number(lineHint) : null;
    const functionScopes = interpreter.scopeStack
        .filter((scope) => scope && typeof scope.name === 'string')
        .filter((scope) => scope.name !== 'Global')
        .filter((scope) => !scope.name.startsWith('Block'));
    const frames = [];
    for (let index = functionScopes.length - 1; index >= 0; index--) {
        const scope = functionScopes[index];
        const callLine = Number.isFinite(interpreter.callStack[index]) && interpreter.callStack[index] > 0
            ? interpreter.callStack[index]
            : null;
        const line = (index === functionScopes.length - 1 ? currentLine : callLine) || callLine || currentLine;
        frames.push(line ? `${scope.name} (ligne ${line})` : `${scope.name}`);
    }
    if (frames.length === 0) {
        frames.push(currentLine ? `global (ligne ${currentLine})` : 'global');
    } else if (currentLine) {
        frames.push(`global (ligne ${currentLine})`);
    }
    return frames;
}
