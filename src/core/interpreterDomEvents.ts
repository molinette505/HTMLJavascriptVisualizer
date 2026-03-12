// @ts-nocheck
import { Lexer, Parser, BlockStmt } from './language';
import { Scope } from './scope';

export function findDomParent(interpreter, rootNode, targetNode) {
    if (!rootNode || !targetNode || !rootNode.children || rootNode.children.length === 0) return null;
    for (const child of rootNode.children) {
        if (child === targetNode) return rootNode;
        const nested = findDomParent(interpreter, child, targetNode);
        if (nested) return nested;
    }
    return null;
}

export function resolveDomNodeByPath(interpreter, path) {
    const root = interpreter.domDocument && interpreter.domDocument.body ? interpreter.domDocument.body : null;
    if (!root) return null;
    const normalized = String(path || '').trim();
    if (!normalized || normalized === '0') return root;
    const parts = normalized.split('.').map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
    if (parts.length === 0) return root;
    let cursor = root;
    const startIndex = parts[0] === 0 ? 1 : 0;
    for (let index = startIndex; index < parts.length; index++) {
        const childIndex = parts[index];
        if (!cursor || !Array.isArray(cursor.children) || childIndex < 0 || childIndex >= cursor.children.length) {
            return cursor;
        }
        cursor = cursor.children[childIndex];
    }
    return cursor || root;
}

export function updateDomInputValue(interpreter, path = '', nextValue = '') {
    const targetNode = resolveDomNodeByPath(interpreter, path);
    if (!targetNode || targetNode.__domType !== 'element') return false;
    targetNode.value = String(nextValue ?? '');
    return true;
}

export function buildDomEventPayload(interpreter, targetNode, currentTargetNode, eventType = 'click') {
    return {
        type: String(eventType || 'click'),
        target: targetNode || null,
        currentTarget: currentTargetNode || targetNode || null,
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        }
    };
}

export function resolveCallableFromValue(interpreter, value) {
    if (!value) return null;
    if (value.type === 'function_decl_ref') {
        const fnNode = value.node;
        if (!fnNode) return null;
        return {
            funcNode: fnNode,
            closureScope: value.scope || interpreter.globalScope,
            paramNames: fnNode.params.map((param) => param.name),
            paramIds: fnNode.params.map((param) => param.id),
            funcName: value.name || fnNode.name || 'anonymous'
        };
    }
    if (value.type === 'arrow_func' || value.type === 'function_expr') {
        return {
            funcNode: value,
            closureScope: value.scope || interpreter.currentScope || interpreter.globalScope,
            paramNames: Array.isArray(value.params) ? value.params : [],
            paramIds: Array.isArray(value.paramIds) ? value.paramIds : [],
            funcName: value.name || 'anonymous'
        };
    }
    return null;
}

export async function invokeCallableValue(interpreter, callableValue, argValues = [], callName = 'anonymous', lineHint = 0) {
    const callable = resolveCallableFromValue(interpreter, callableValue);
    if (!callable) throw new TypeError(`${callName} is not a function`);
    const fnScope = new Scope(`${callable.funcName}(${callable.paramNames.join(', ')})`, callable.closureScope, interpreter.currentScope);
    interpreter.scopeStack.push(fnScope);
    const previousScope = interpreter.currentScope;
    let callFramePushed = false;
    try {
        if (interpreter.ui && typeof interpreter.ui.resetPauseProbeLine === 'function') interpreter.ui.resetPauseProbeLine(0);
        for (let index = 0; index < callable.paramNames.length; index++) {
            const paramName = callable.paramNames[index];
            const paramValue = index < argValues.length ? argValues[index] : undefined;
            fnScope.define(paramName, 'let');
            fnScope.initialize(paramName, paramValue);
            interpreter.setVariableFunctionAlias(paramName, null, fnScope);
            await interpreter.ui.updateMemory(interpreter.scopeStack, paramName, 'declare');
        }
        await interpreter.ui.wait(300);
        interpreter.currentScope = fnScope;
        await interpreter.ui.updateMemory(interpreter.scopeStack);
        interpreter.callStack.push(Number.isFinite(lineHint) && lineHint > 0 ? Number(lineHint) : interpreter.lastPausedLine);
        callFramePushed = true;

        let result = undefined;
        const body = callable.funcNode.body;
        if (body instanceof BlockStmt) {
            const blockResult = await interpreter.executeBlock(body.body);
            if (blockResult && blockResult.__isReturn) result = blockResult.value;
        } else {
            await interpreter.pause(interpreter.lastPausedLine || 1);
            result = await interpreter.evaluate(body);
        }
        return result;
    } finally {
        if (callFramePushed) interpreter.callStack.pop();
        interpreter.currentScope = previousScope;
        const scopeIndex = interpreter.scopeStack.lastIndexOf(fnScope);
        if (scopeIndex !== -1) interpreter.scopeStack.splice(scopeIndex, 1);
        await interpreter.ui.updateMemory(interpreter.scopeStack);
    }
}

export async function executeInlineDomHandler(interpreter, sourceCode, eventPayload, lineHint = 0) {
    const code = String(sourceCode || '').trim();
    if (!code) return;
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const inlineScope = new Scope('EventInline', interpreter.currentScope, interpreter.currentScope);
    interpreter.scopeStack.push(inlineScope);
    const previousScope = interpreter.currentScope;
    let callFramePushed = false;
    try {
        if (interpreter.ui && typeof interpreter.ui.resetPauseProbeLine === 'function') interpreter.ui.resetPauseProbeLine(0);
        inlineScope.define('event', 'const');
        inlineScope.initialize('event', eventPayload);
        await interpreter.ui.updateMemory(interpreter.scopeStack, 'event', 'declare');
        await interpreter.ui.wait(200);
        interpreter.currentScope = inlineScope;
        await interpreter.ui.updateMemory(interpreter.scopeStack);
        interpreter.callStack.push(Number.isFinite(lineHint) && lineHint > 0 ? Number(lineHint) : interpreter.lastPausedLine);
        callFramePushed = true;
        await interpreter.executeBlock(ast.body || []);
    } finally {
        if (callFramePushed) interpreter.callStack.pop();
        interpreter.currentScope = previousScope;
        const scopeIndex = interpreter.scopeStack.lastIndexOf(inlineScope);
        if (scopeIndex !== -1) interpreter.scopeStack.splice(scopeIndex, 1);
        await interpreter.ui.updateMemory(interpreter.scopeStack);
    }
}

export async function invokeDomClick(interpreter, path = '') {
    if (interpreter.shouldStop) return;
    if (interpreter.isHandlingEvent) return;
    interpreter.isHandlingEvent = true;
    interpreter.callStack = [];
    const triggerBtn = (typeof document !== 'undefined') ? document.getElementById('btn-trigger') : null;
    const setEventBtn = (typeof document !== 'undefined') ? document.getElementById('btn-set-event') : null;
    if (triggerBtn) triggerBtn.disabled = true;
    if (setEventBtn) setEventBtn.disabled = true;
    try {
        const clickedNode = resolveDomNodeByPath(interpreter, path);
        if (!clickedNode) return;
        const targetLine = interpreter.lastPausedLine || 1;
        interpreter.ui.log('> Evenement: click', 'info');
        const propagation = [];
        let cursor = clickedNode;
        while (cursor) {
            propagation.push(cursor);
            cursor = findDomParent(interpreter, interpreter.domDocument && interpreter.domDocument.body, cursor);
        }
        for (const currentTarget of propagation) {
            if (!currentTarget || typeof currentTarget.getEventHandlers !== 'function') continue;
            const handlers = currentTarget.getEventHandlers('click');
            if (!Array.isArray(handlers) || handlers.length === 0) continue;
            for (const entry of handlers) {
                if (!entry) continue;
                const payload = buildDomEventPayload(interpreter, clickedNode, currentTarget, 'click');
                if (entry.kind === 'inline-attr') {
                    await executeInlineDomHandler(interpreter, entry.handler, payload, targetLine);
                    continue;
                }
                await invokeCallableValue(interpreter, entry.handler, [payload], 'click', targetLine);
            }
        }
    } catch (error) {
        await interpreter.logRuntimeError(error, 'Erreur evenement');
        interpreter.stop();
        interpreter.ui.setRunningState(false);
        interpreter.ui.setEventMode(false);
        interpreter.ui.resetDisplay({ keepConsole: true });
    } finally {
        interpreter.ui.highlightLines([]);
        interpreter.ui.resetVisuals();
        interpreter.isHandlingEvent = false;
        if (!interpreter.shouldStop) {
            if (triggerBtn) triggerBtn.disabled = false;
            if (setEventBtn) setEventBtn.disabled = false;
        }
    }
}
