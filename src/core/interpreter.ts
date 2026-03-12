// @ts-nocheck
import { Lexer, Parser, Identifier, CallExpr, MultiVarDecl, VarDecl, FunctionDecl } from './language';
import { Scope } from './scope';
import { createVirtualDocument } from './virtualDom';
import {
    buildPedagogicalStack as buildPedagogicalStackImpl,
    executeWithSuppressedPause as executeWithSuppressedPauseImpl,
    nextInterpreterStep,
    pauseInterpreter,
    shouldFastForwardInterpreter,
    shouldPauseInterpreter,
    stopInterpreter,
} from './interpreterPause';
import {
    evaluateTemplateExpression as evaluateTemplateExpressionImpl,
    evaluateTemplateLiteral as evaluateTemplateLiteralImpl,
} from './interpreterTemplate';
import { evaluateNode } from './interpreterEvaluate';
import {
    collapseExpressionTokens as collapseExpressionTokensImpl,
    findScopeForVariable as findScopeForVariableImpl,
    formatRuntimeError as formatRuntimeErrorImpl,
    getCallReplacementTokenId as getCallReplacementTokenIdImpl,
    getExpressionDisplayTokenId as getExpressionDisplayTokenIdImpl,
    getIdentifierTokenId as getIdentifierTokenIdImpl,
    getMemberPropertyTokenId as getMemberPropertyTokenIdImpl,
    isDomNodeVisible as isDomNodeVisibleImpl,
    logRuntimeError as logRuntimeErrorImpl,
    refreshDomView as refreshDomViewImpl,
    setMemberPropertyHoverSnapshot as setMemberPropertyHoverSnapshotImpl,
    setVariableFunctionAlias as setVariableFunctionAliasImpl,
} from './interpreterRuntimeHelpers';
import {
    buildDomEventPayload as buildDomEventPayloadImpl,
    executeInlineDomHandler as executeInlineDomHandlerImpl,
    findDomParent as findDomParentImpl,
    invokeCallableValue as invokeCallableValueImpl,
    invokeDomClick as invokeDomClickImpl,
    resolveCallableFromValue as resolveCallableFromValueImpl,
    resolveDomNodeByPath as resolveDomNodeByPathImpl,
    updateDomInputValue as updateDomInputValueImpl,
} from './interpreterDomEvents';
import { executeNode } from './interpreterExecute';

export class Interpreter {
    constructor(ui, options = {}) {
        this.ui = ui;
        this.globalScope = new Scope("Global");
        this.currentScope = this.globalScope;
        this.functions = {};
        this.callStack = []; 
        this.scopeStack = [this.globalScope];
        this.shouldStop = false;
        this.resolveNext = null;
        this.initialDomHtml = options.domHtml || '<body></body>';
        this.domDocument = createVirtualDocument(this.initialDomHtml);
        this.lastPausedLine = 0;
        this.isHandlingEvent = false;
        this.initialGlobals = (options && typeof options.initialGlobals === 'object' && options.initialGlobals)
            ? options.initialGlobals
            : {};
        this.onReadyForEvents = (options && typeof options.onReadyForEvents === 'function')
            ? options.onReadyForEvents
            : null;
        this.shouldPauseAtLine = (options && typeof options.shouldPauseAtLine === 'function')
            ? options.shouldPauseAtLine
            : null;
        this.shouldFastForwardExecution = (options && typeof options.shouldFastForwardExecution === 'function')
            ? options.shouldFastForwardExecution
            : null;
        this.pauseSuppressionDepth = 0;
        this.pendingPauseLineOverride = null;
        this.pendingPauseSoft = false;
        this.pendingPauseSkipMode = null;
    }

    applyInitialGlobals() {
        const entries = Object.entries(this.initialGlobals || {});
        for (const [name, descriptor] of entries) {
            if (!name || name === 'document') continue;
            const hasDescriptor = descriptor && typeof descriptor === 'object' && Object.prototype.hasOwnProperty.call(descriptor, 'value');
            const value = hasDescriptor ? descriptor.value : descriptor;
            const kind = hasDescriptor && descriptor.kind ? descriptor.kind : 'const';
            if (!Object.prototype.hasOwnProperty.call(this.globalScope.variables, name)) {
                this.globalScope.define(name, kind);
            }
            if (this.globalScope.variables[name].initialized === false) {
                this.globalScope.initialize(name, value);
            } else {
                this.globalScope.variables[name].value = value;
            }
            if (hasDescriptor) {
                this.globalScope.variables[name].hidden = Boolean(descriptor.hidden);
            }
        }
    }

    setGlobalValue(name, value) {
        if (!name) return false;
        if (!Object.prototype.hasOwnProperty.call(this.globalScope.variables, name)) {
            this.globalScope.define(name, 'let');
            this.globalScope.initialize(name, value);
            return true;
        }
        const variable = this.globalScope.variables[name];
        if (!variable) return false;
        if (variable.initialized === false) {
            this.globalScope.initialize(name, value);
            return true;
        }
        variable.value = value;
        return true;
    }

    async start(code) { 
        this.shouldStop = false; 
        this.functions = {};
        this.callStack = []; 
        this.domDocument = createVirtualDocument(this.initialDomHtml);
        this.globalScope = new Scope("Global");
        this.currentScope = this.globalScope;
        this.globalScope.define('document', 'const');
        this.globalScope.initialize('document', this.domDocument);
        this.applyInitialGlobals();
        this.scopeStack = [this.globalScope]; 
        this.lastPausedLine = 0;
        this.isHandlingEvent = false;
        if (typeof this.ui.updateDom === 'function') this.ui.updateDom(this.domDocument);
        await this.ui.updateMemory(this.scopeStack); 
        try { 
            const lexer = new Lexer(code); 
            const rawTokens = lexer.tokenize(); 
            this.ui.renderCode(rawTokens); 
            const parser = new Parser(rawTokens); 
            const ast = parser.parse(); 
            await this.executeBlock(ast.body); 
            await this.ui.wait(500); 
            this.ui.highlightLines([]); 
            this.ui.resetVisuals(); // Reset tokens
            this.ui.log("--- Fin de l'exécution. En attente d'événements... ---", "info");
            // Mode écoute activé
            this.ui.setEventMode(true);
            if (typeof this.onReadyForEvents === 'function') {
                try {
                    await this.onReadyForEvents(this);
                } catch (readyError) {
                    await this.logRuntimeError(readyError, "Erreur");
                }
            }
        } catch (e) { 
            if (e.message !== "STOP") { 
                await this.logRuntimeError(e, "Erreur");
            } else { 
                this.ui.log("--- Arrêt ---", "info"); 
            } 
            this.ui.setRunningState(false); 
            this.ui.resetDisplay({ keepConsole: true }); 
        }
    }
    
    async invokeEvent(funcName, options = {}) {
        if (this.shouldStop) return;
        if (this.isHandlingEvent) return;
        const quiet = Boolean(options && options.quiet);
        this.isHandlingEvent = true;
        this.callStack = [];
        if (this.ui && typeof this.ui.resetPauseProbeLine === 'function') this.ui.resetPauseProbeLine(0);
        
        // Désactiver les contrôles
        const triggerBtn = (typeof document !== 'undefined') ? document.getElementById('btn-trigger') : null;
        const setEventBtn = (typeof document !== 'undefined') ? document.getElementById('btn-set-event') : null;
        if (triggerBtn) triggerBtn.disabled = true;
        if (setEventBtn) setEventBtn.disabled = true;

        // Simuler un noeud d'appel
        const dummyId = new Identifier(funcName, 0);
        dummyId.domIds = []; // Pas de DOM pour l'événement externe
        const callNode = new CallExpr(dummyId, [], 0);
        callNode.domIds = []; 
        
        try {
            if (!quiet) this.ui.log(`> Événement: ${funcName}()`, "info");
            await this.evaluate(callNode);
        } catch (e) {
            await this.logRuntimeError(e, "Erreur evenement");
            this.stop();
            this.ui.setRunningState(false);
            this.ui.setEventMode(false);
            this.ui.resetDisplay({ keepConsole: true });
        } finally {
            this.ui.highlightLines([]); 
            this.ui.resetVisuals();
            this.isHandlingEvent = false;
            // Réactiver les contrôles si on n'a pas stoppé
            if (!this.shouldStop) {
                if (triggerBtn) triggerBtn.disabled = false;
                if (setEventBtn) setEventBtn.disabled = false;
            }
        }
    }

    findDomParent(rootNode, targetNode) {
        return findDomParentImpl(this, rootNode, targetNode);
    }

    resolveDomNodeByPath(path) {
        return resolveDomNodeByPathImpl(this, path);
    }

    updateDomInputValue(path = '', nextValue = '') {
        return updateDomInputValueImpl(this, path, nextValue);
    }

    buildDomEventPayload(targetNode, currentTargetNode, eventType = 'click') {
        return buildDomEventPayloadImpl(this, targetNode, currentTargetNode, eventType);
    }

    resolveCallableFromValue(value) {
        return resolveCallableFromValueImpl(this, value);
    }

    async invokeCallableValue(callableValue, argValues = [], callName = 'anonymous', lineHint = 0) {
        return await invokeCallableValueImpl(this, callableValue, argValues, callName, lineHint);
    }

    async executeInlineDomHandler(sourceCode, eventPayload, lineHint = 0) {
        await executeInlineDomHandlerImpl(this, sourceCode, eventPayload, lineHint);
    }

    async invokeDomClick(path = '') {
        await invokeDomClickImpl(this, path);
    }

    async nextStep() {
        nextInterpreterStep(this);
    }
    stop() {
        stopInterpreter(this);
    }
    shouldPause(line) {
        return shouldPauseInterpreter(this, line);
    }
    shouldFastForward() {
        return shouldFastForwardInterpreter(this);
    }
    async pause(line) {
        await pauseInterpreter(this, line);
    }
    async executeWithSuppressedPause(node) {
        return await executeWithSuppressedPauseImpl(this, node);
    }
    buildPedagogicalStack(lineHint = this.lastPausedLine) {
        return buildPedagogicalStackImpl(this, lineHint);
    }
    hoistVarDeclaration(node) {
        if (!node || !(node instanceof VarDecl)) return;
        if (Object.prototype.hasOwnProperty.call(this.currentScope.variables, node.name)) {
            const existing = this.currentScope.variables[node.name];
            const allowVarRedeclare = existing && existing.kind === 'var' && node.kind === 'var';
            if (allowVarRedeclare) return;
            throw new Error(`Variable ${node.name} déjà déclarée`);
        }
        this.currentScope.define(node.name, node.kind, false);
        if (node.kind === 'var') this.currentScope.initialize(node.name, undefined);
    }
    hoistDeclarations(stmts) {
        if (!Array.isArray(stmts)) return;
        for (const statement of stmts) {
            if (statement instanceof FunctionDecl) {
                this.functions[statement.name] = statement;
                continue;
            }
            if (statement instanceof VarDecl) {
                this.hoistVarDeclaration(statement);
                continue;
            }
            if (statement instanceof MultiVarDecl) {
                for (const declaration of statement.decls) this.hoistVarDeclaration(declaration);
            }
        }
    }
    async executeBlock(stmts) {
        this.hoistDeclarations(stmts);
        for (const s of stmts) {
            const res = await this.execute(s);
            if (res === 'BREAK') return 'BREAK';
            if (res && res.__isReturn) return res;
        }
    }
    formatRuntimeError(error) {
        return formatRuntimeErrorImpl(this, error);
    }
    async logRuntimeError(error, prefix = "Erreur") {
        await logRuntimeErrorImpl(this, error, prefix);
    }
    refreshDomView() {
        refreshDomViewImpl(this);
    }
    getExpressionDisplayTokenId(expressionNode) {
        return getExpressionDisplayTokenIdImpl(this, expressionNode);
    }
    getIdentifierTokenId(domIds, identifierName) {
        return getIdentifierTokenIdImpl(this, domIds, identifierName);
    }
    getMemberPropertyTokenId(node) {
        return getMemberPropertyTokenIdImpl(this, node);
    }
    setMemberPropertyHoverSnapshot(node, value) {
        setMemberPropertyHoverSnapshotImpl(this, node, value);
    }
    findScopeForVariable(name, scope = this.currentScope) {
        return findScopeForVariableImpl(this, name, scope);
    }
    setVariableFunctionAlias(name, alias = null, scope = null) {
        setVariableFunctionAliasImpl(this, name, alias, scope);
    }
    collapseExpressionTokens(domIds, keepTokenId) {
        collapseExpressionTokensImpl(this, domIds, keepTokenId);
    }
    getCallReplacementTokenId(callNode) {
        return getCallReplacementTokenIdImpl(this, callNode);
    }
    isDomNodeVisible(node) {
        return isDomNodeVisibleImpl(this, node);
    }

    async execute(node) {
        return await executeNode(this, node);
    }

    async evaluateTemplateExpression(exprSource) {
        return await evaluateTemplateExpressionImpl(this, exprSource);
    }

    async evaluateTemplateLiteral(templateSource, tokenId = null) {
        return await evaluateTemplateLiteralImpl(this, templateSource, tokenId);
    }

    async evaluate(node, options = {}) {
        return await evaluateNode(this, node, options);
    }
}
