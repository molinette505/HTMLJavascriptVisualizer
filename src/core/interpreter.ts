// @ts-nocheck
import { formatValue } from './config';
import {
    Lexer,
    Parser,
    Identifier,
    CallExpr,
    BlockStmt,
    MultiVarDecl,
    VarDecl,
    ArrayLiteral,
    ArrowFunctionExpr,
    FunctionExpression,
    Assignment,
    MemberExpr,
    UpdateExpr,
    IfStmt,
    WhileStmt,
    DoWhileStmt,
    ForStmt,
    SwitchStmt,
    BreakStmt,
    FunctionDecl,
    Literal,
    UnaryExpr,
    NewExpr,
    ArgumentsNode,
    BinaryExpr,
    TernaryExpr,
    ReturnStmt,
} from './language';
import { Scope } from './scope';
import { createVirtualDocument, isVirtualDomValue } from './virtualDom';
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
        if (this.shouldStop) return;
        if (node instanceof BlockStmt) { const blockScope = new Scope("Block", this.currentScope, this.currentScope); this.scopeStack.push(blockScope); const prevScope = this.currentScope; this.currentScope = blockScope; let result; try { result = await this.executeBlock(node.body); } finally { this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); } return result; }
        if (node instanceof MultiVarDecl) { for (const decl of node.decls) { await this.execute(decl); } return; }
        if (node instanceof VarDecl) {
            await this.pause(node.line);
            const hasOwnBinding = Object.prototype.hasOwnProperty.call(this.currentScope.variables, node.name);
            const existingBinding = hasOwnBinding ? this.currentScope.variables[node.name] : null;
            let declarationVisualized = false;
            if (!hasOwnBinding) {
                this.currentScope.define(node.name, node.kind);
                await this.ui.updateMemory(this.scopeStack, node.name, 'declare');
                await this.ui.wait(600);
                declarationVisualized = true;
            } else if (existingBinding && existingBinding.declared === false) {
                existingBinding.declared = true;
                await this.ui.updateMemory(this.scopeStack, node.name, 'declare');
                await this.ui.wait(600);
                declarationVisualized = true;
            }
            const varTokenId = this.getIdentifierTokenId(node.domIds, node.name);
            if (node.init) {
                if (node.init instanceof ArrayLiteral) {
                    const arr = new Array(node.init.elements.length).fill(undefined);
                    this.currentScope.initialize(node.name, arr);
                    this.setVariableFunctionAlias(node.name, null, this.currentScope);
                    await this.ui.updateMemory(this.scopeStack, node.name, 'write');
                    for (let i = 0; i < node.init.elements.length; i++) {
                        const val = await this.evaluate(node.init.elements[i]);
                        arr[i] = val;
                        await this.ui.animateAssignment(node.name, val, this.getExpressionDisplayTokenId(node.init.elements[i]), i, varTokenId);
                        await this.ui.updateMemory(this.scopeStack, node.name, 'write', i);
                    }
                } else if (node.init instanceof ArrowFunctionExpr) {
                    const func = { type: 'arrow_func', params: node.init.params.map(p=>p.name), body: node.init.body, scope: this.currentScope, paramIds: node.init.params.map(p=>p.id) };
                    this.currentScope.initialize(node.name, func);
                    this.setVariableFunctionAlias(node.name, null, this.currentScope);
                    await this.ui.updateMemory(this.scopeStack, node.name, 'write');
                } else if (node.init instanceof FunctionExpression) {
                    const func = await this.evaluate(node.init);
                    this.currentScope.initialize(node.name, func);
                    this.setVariableFunctionAlias(node.name, null, this.currentScope);
                    await this.ui.updateMemory(this.scopeStack, node.name, 'write');
                } else {
                    const val = await this.evaluate(node.init);
                    this.currentScope.initialize(node.name, val);
                    const aliasName = (node.init instanceof Identifier && val && (val.type === 'arrow_func' || val.type === 'function_expr'))
                        ? node.init.name
                        : null;
                    this.setVariableFunctionAlias(node.name, aliasName, this.currentScope);
                    await this.ui.animateAssignment(node.name, val, this.getExpressionDisplayTokenId(node.init), null, varTokenId);
                    await this.ui.updateMemory(this.scopeStack, node.name, 'write');
                }
            } else if (hasOwnBinding && this.currentScope.variables[node.name].initialized === false) {
                this.currentScope.initialize(node.name, undefined);
                await this.ui.updateMemory(this.scopeStack, node.name, 'write');
                declarationVisualized = true;
            }
            if (!node.init && declarationVisualized && this.ui && typeof this.ui.maybePauseAfterMicroStep === 'function') {
                await this.ui.maybePauseAfterMicroStep();
            }
        }
        else if (node instanceof Assignment) {
            await this.pause(node.line);
            let val;
            if (node.value instanceof ArrowFunctionExpr) {
                val = { type: 'arrow_func', params: node.value.params.map(p=>p.name), body: node.value.body, scope: this.currentScope, paramIds: node.value.params.map(p=>p.id) };
            } else {
                val = await this.evaluate(node.value);
            }
            if (node.left instanceof Identifier) {
                this.currentScope.assign(node.left.name, val);
                const aliasName = (node.value instanceof Identifier && val && (val.type === 'arrow_func' || val.type === 'function_expr'))
                    ? node.value.name
                    : null;
                this.setVariableFunctionAlias(node.left.name, aliasName);
                const leftVarTokenId = this.getIdentifierTokenId(node.left.domIds, node.left.name);
                if (typeof val !== 'object' || (val.type !== 'arrow_func' && val.type !== 'function_expr')) {
                    await this.ui.animateAssignment(node.left.name, val, this.getExpressionDisplayTokenId(node.value), null, leftVarTokenId);
                }
                await this.ui.updateMemory(this.scopeStack, node.left.name, 'write');
            } else if (node.left instanceof MemberExpr) {
                let obj;
                let targetName = null;
                if (node.left.object instanceof Identifier) {
                    targetName = node.left.object.name;
                    const scopedVar = this.currentScope.get(targetName);
                    obj = scopedVar.value;
                } else {
                    obj = await this.evaluate(node.left.object);
                }
                const prop = node.left.computed ? await this.evaluate(node.left.property) : node.left.property.value;
                if (Array.isArray(obj)) {
                    obj[prop] = val;
                    if (targetName) {
                        const targetVarTokenId = this.getIdentifierTokenId(node.left.object.domIds, targetName);
                        const targetIndexTokenId = (node.left.computed && node.left.property)
                            ? this.getExpressionDisplayTokenId(node.left.property)
                            : null;
                        await this.ui.animateAssignment(targetName, val, this.getExpressionDisplayTokenId(node.value), prop, targetVarTokenId, targetIndexTokenId);
                        await this.ui.updateMemory(this.scopeStack, targetName, 'write', prop);
                    }
                } else if (obj && (typeof obj === 'object' || typeof obj === 'function')) {
                    if (isVirtualDomValue(obj)) {
                        const sourceTokenId = this.getExpressionDisplayTokenId(node.value);
                        const domNodeVisible = this.isDomNodeVisible(obj);
                        const targetVarTokenId = this.getIdentifierTokenId(node.left.object.domIds, targetName);
                        if (!domNodeVisible && targetName && targetName !== 'document') {
                            await this.ui.updateMemory(this.scopeStack, targetName, 'read');
                            await this.ui.wait(220);
                        }
                        if (!domNodeVisible) {
                            if (typeof this.ui.animateDetachedDomPropertyMutation === 'function') {
                                await this.ui.animateDetachedDomPropertyMutation({
                                    targetNode: obj,
                                    sourceTokenId,
                                    payload: val,
                                    property: prop,
                                    applyMutation: async () => { obj[prop] = val; }
                                });
                            } else {
                                obj[prop] = val;
                                if (targetName && targetName !== 'document') {
                                    await this.ui.animateAssignment(targetName, obj, sourceTokenId, null, targetVarTokenId);
                                }
                            }
                        } else {
                            if (typeof this.ui.animateDomPropertyMutation === 'function') {
                                await this.ui.animateDomPropertyMutation({
                                    targetNode: obj,
                                    sourceTokenId,
                                    payload: val,
                                    property: prop,
                                    applyMutation: async () => { obj[prop] = val; }
                                });
                                this.refreshDomView();
                            } else {
                                obj[prop] = val;
                                this.refreshDomView();
                                if (typeof this.ui.animateDomMutation === 'function') {
                                    await this.ui.animateDomMutation(obj, sourceTokenId, val);
                                }
                            }
                        }
                        if (targetName && targetName !== 'document') {
                            await this.ui.updateMemory(this.scopeStack, targetName, 'write', null, !domNodeVisible);
                        }
                    } else {
                        obj[prop] = val;
                    }
                }
            }
        }
        else if (node instanceof CallExpr) {
            await this.pause(node.line);
            node.__suppressResultVisual = true;
            try {
                await this.evaluate(node, { suppressResultVisual: true });
            } finally {
                delete node.__suppressResultVisual;
            }
            // Appel expression seul (ex: tableau.pop();) :
            // on garde les effets de bord, mais on n'affiche pas la valeur de retour dans le code.
            this.ui.resetVisuals();
        }
        else if (node instanceof UpdateExpr) { await this.pause(node.line); await this.evaluate(node); }
        else if (node instanceof IfStmt) { await this.pause(node.line); const test = await this.evaluate(node.test); this.ui.lockTokens(node.test.domIds||[]); let res; try { if (test) { if (node.consequent instanceof BlockStmt) res = await this.executeBlock(node.consequent.body); else res = await this.execute(node.consequent); } else if (node.alternate) { if (node.alternate instanceof BlockStmt) res = await this.executeBlock(node.alternate.body); else res = await this.execute(node.alternate); } } finally { this.ui.unlockTokens(node.test.domIds||[]); } if (res) return res; }
        else if (node instanceof WhileStmt) {
            while(true) {
                await this.pause(node.line);
                const test = await this.evaluate(node.test);
                this.ui.lockTokens(node.test.domIds||[]);
                if(!test) {
                    this.ui.unlockTokens(node.test.domIds||[]);
                    break;
                }
                const loopScope = new Scope("Loop", this.currentScope, this.currentScope);
                this.scopeStack.push(loopScope);
                const prevScope = this.currentScope;
                this.currentScope = loopScope;
                try {
                    const res = (node.body instanceof BlockStmt) ? await this.executeBlock(node.body.body) : await this.execute(node.body);
                    if(res==='BREAK') {
                        this.ui.unlockTokens(node.test.domIds||[]);
                        break;
                    }
                    if(res&&res.__isReturn) return res;
                } finally {
                    this.currentScope = prevScope;
                    this.scopeStack.pop();
                    await this.ui.updateMemory(this.scopeStack);
                }
                this.ui.unlockTokens(node.test.domIds||[]);
            }
        }
        else if (node instanceof DoWhileStmt) {
            do {
                const loopScope = new Scope("Loop", this.currentScope, this.currentScope);
                this.scopeStack.push(loopScope);
                const prevScope = this.currentScope;
                this.currentScope = loopScope;
                try {
                    const res = (node.body instanceof BlockStmt) ? await this.executeBlock(node.body.body) : await this.execute(node.body);
                    if(res==='BREAK') {
                        this.ui.unlockTokens(node.test.domIds||[]);
                        break;
                    }
                    if(res&&res.__isReturn) return res;
                } finally {
                    this.currentScope = prevScope;
                    this.scopeStack.pop();
                    await this.ui.updateMemory(this.scopeStack);
                }
                await this.pause(node.line);
                const test = await this.evaluate(node.test);
                this.ui.lockTokens(node.test.domIds||[]);
                if(!test) {
                    this.ui.unlockTokens(node.test.domIds||[]);
                    break;
                }
                this.ui.unlockTokens(node.test.domIds||[]);
            } while(true);
        }
        else if (node instanceof ForStmt) {
            const loopScope = new Scope("Loop", this.currentScope, this.currentScope);
            this.scopeStack.push(loopScope);
            const prevScope = this.currentScope;
            this.currentScope = loopScope;
            try {
                if (node.init) {
                    if (node.init instanceof VarDecl || node.init instanceof BlockStmt || node.init instanceof MultiVarDecl) await this.execute(node.init);
                    else {
                        if (node.init instanceof Assignment || node.init instanceof UpdateExpr || node.init instanceof CallExpr) {
                            await this.pause(node.line);
                            await this.executeWithSuppressedPause(node.init);
                        } else {
                            await this.pause(node.init.line);
                            await this.evaluate(node.init);
                        }
                    }
                }
                while (true) {
                    if (node.test) {
                        await this.pause(node.line);
                        const test = await this.evaluate(node.test);
                        if (!test) break;
                    }

                    const iterationScope = new Scope("Loop", this.currentScope, this.currentScope);
                    this.scopeStack.push(iterationScope);
                    const prevIterationScope = this.currentScope;
                    this.currentScope = iterationScope;
                    let bodyResult;
                    try {
                        bodyResult = (node.body instanceof BlockStmt) ? await this.executeBlock(node.body.body) : await this.execute(node.body);
                    } finally {
                        this.currentScope = prevIterationScope;
                        this.scopeStack.pop();
                        await this.ui.updateMemory(this.scopeStack);
                    }

                    if (bodyResult === 'BREAK') {
                        break;
                    }
                    if (bodyResult && bodyResult.__isReturn) {
                        return bodyResult;
                    }

                    if (node.update) {
                        if (node.update instanceof Assignment || node.update instanceof UpdateExpr || node.update instanceof CallExpr) {
                            await this.pause(node.line);
                            await this.executeWithSuppressedPause(node.update);
                        } else {
                            await this.pause(node.line);
                            await this.evaluate(node.update);
                        }
                    }
                }
            } finally {
                this.currentScope = prevScope;
                this.scopeStack.pop();
                await this.ui.updateMemory(this.scopeStack);
            }
        }
        else if (node instanceof SwitchStmt) { await this.pause(node.line); const disc = await this.evaluate(node.discriminant); let start=-1; let def=-1; for(let i=0;i<node.cases.length;i++){ const c=node.cases[i]; if(c.test){ await this.pause(c.line); const tv=await this.evaluate(c.test); const v1=JSON.stringify(formatValue(disc)); const v2=JSON.stringify(formatValue(tv)); const compStr=`${v1} === ${v2}`; if(c.test.domIds.length>0){ this.ui.setRawTokenText(c.test.domIds[0], compStr, true); for(let k=1;k<c.test.domIds.length;k++){ const el=document.getElementById(c.test.domIds[k]); if(el){ if(!this.ui.modifiedTokens.has(c.test.domIds[k])) this.ui.modifiedTokens.set(c.test.domIds[k], {original:el.innerText, transient:true}); el.style.display='none'; } } } await this.ui.wait(800); const isMatch=(tv===disc); await this.ui.animateOperationCollapse(c.test.domIds, isMatch); await this.ui.wait(800); if(isMatch){ start=i; break; } } else { def=i; } } if(start===-1) start=def; if(start!==-1){ for(let i=start; i<node.cases.length; i++){ const c=node.cases[i]; for(const s of c.consequent){ const res=await this.execute(s); if(res==='BREAK') return; if(res&&res.__isReturn) return res; } } } }
        else if (node instanceof BreakStmt) { await this.pause(node.line); return 'BREAK'; }
        else if (node instanceof ReturnStmt) {
            await this.pause(node.line);
            const value = node.argument ? await this.evaluate(node.argument) : undefined;
            const sourceId = (node.argument && node.argument.domIds && node.argument.domIds.length > 0)
                ? this.getExpressionDisplayTokenId(node.argument)
                : ((node.domIds && node.domIds.length > 0) ? node.domIds[0] : null);
            return { __isReturn: true, value, sourceId };
        }
        else if (node instanceof FunctionDecl) { await this.pause(node.line); this.functions[node.name] = node; }
    }

    async evaluateTemplateExpression(exprSource) {
        return await evaluateTemplateExpressionImpl(this, exprSource);
    }

    async evaluateTemplateLiteral(templateSource, tokenId = null) {
        return await evaluateTemplateLiteralImpl(this, templateSource, tokenId);
    }

    async evaluate(node, options = {}) {
        if (node instanceof Literal) {
            if (node.isTemplate) {
                const tokenId = node.domIds && node.domIds.length > 0 ? node.domIds[0] : null;
                return await this.evaluateTemplateLiteral(node.value, tokenId);
            }
            return node.value;
        }
        if (node instanceof UnaryExpr) { const arg = await this.evaluate(node.arg); let res; if (node.op === '!') res = !arg; else if (node.op === '-') res = -arg; else if (node.op === '+') res = +arg; await this.ui.animateOperationCollapse(node.domIds, res); await this.ui.wait(800); return res; }
        if (node instanceof FunctionExpression) { return { type: 'function_expr', name: node.name || 'anonymous', params: node.params.map(p => p.name), paramIds: node.params.map(p => p.id), body: node.body, scope: this.currentScope }; }
        if (node instanceof ArrowFunctionExpr) { return { type: 'arrow_func', params: node.params.map(p => p.name), paramIds: node.params.map(p => p.id), body: node.body, scope: this.currentScope }; }
        if (node instanceof ArrayLiteral) { const elements = []; for (const el of node.elements) { elements.push(await this.evaluate(el)); } return elements; }
        if (node instanceof NewExpr) { if (node.callee instanceof Identifier && node.callee.name === 'Array') { const args = []; for(const arg of node.args) args.push(await this.evaluate(arg)); if(args.length === 1 && typeof args[0] === 'number') { return new Array(args[0]).fill(undefined); } return new Array(...args); } }
        if (node instanceof ArgumentsNode) { let result; for(const arg of node.args) { result = await this.evaluate(arg); } return result; }
        if (node instanceof Identifier) {
            let variable;
            try {
                variable = this.currentScope.get(node.name);
            } catch (error) {
                const rawMessage = (error && error.message) ? String(error.message) : '';
                const isUndefinedBinding = rawMessage.includes('non définie');
                if (isUndefinedBinding && this.functions[node.name]) {
                    return {
                        type: 'function_decl_ref',
                        name: node.name,
                        node: this.functions[node.name],
                        scope: this.currentScope
                    };
                }
                throw error;
            }
            if (variable.value && variable.value.type === 'arrow_func') return variable.value;
            if (variable.value && variable.value.type === 'function_expr') return variable.value;
            if (variable.value && variable.value.type === 'function_decl_ref') return variable.value;
            await this.ui.animateRead(node.name, variable.value, node.domIds[0], null, null, null, {
                onArrive: async () => {
                    this.ui.replaceTokenText(node.domIds[0], variable.value, true);
                    for (let i = 1; i < node.domIds.length; i++) {
                        const el = document.getElementById(node.domIds[i]);
                        if (!el) continue;
                        if (!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], { original: el.innerText, transient: true });
                        el.style.display = 'none';
                    }
                    await this.ui.wait(120);
                }
            });
            return variable.value;
        }
        if (node instanceof MemberExpr) {
            let obj;
            if (node.object instanceof Identifier) {
                const varName = node.object.name;
                const scopedVar = this.currentScope.get(varName);
                obj = scopedVar.value;
            } else {
                obj = await this.evaluate(node.object);
            }
            const prop = node.computed ? await this.evaluate(node.property) : node.property.value;
            if (Array.isArray(obj) && prop === 'length' && node.object instanceof Identifier) {
                this.setMemberPropertyHoverSnapshot(node, obj.length);
                await this.ui.animateReadHeader(node.object.name, obj.length, node.domIds);
                await this.ui.animateOperationCollapse(node.domIds, obj.length);
                await this.ui.wait(800);
                return obj.length;
            }
            if (Array.isArray(obj) && node.object instanceof Identifier) {
                const val = obj[prop];
                this.setMemberPropertyHoverSnapshot(node, val);
                const sourceVarTokenId = this.getIdentifierTokenId(node.object.domIds, node.object.name);
                const sourceIndexTokenId = (node.computed && node.property)
                    ? this.getExpressionDisplayTokenId(node.property)
                    : null;
                await this.ui.animateRead(node.object.name, val, node.domIds, prop, sourceVarTokenId, sourceIndexTokenId, {
                    onArrive: async () => {
                        const replacementTargetId = this.getExpressionDisplayTokenId(node) || (node.domIds && node.domIds.length > 0 ? node.domIds[0] : null);
                        if (replacementTargetId) {
                            this.ui.replaceTokenText(replacementTargetId, val, true);
                            this.collapseExpressionTokens(node.domIds, replacementTargetId);
                        }
                        await this.ui.wait(120);
                    }
                });
                return val;
            }
            if (typeof obj === 'string' && prop === 'length' && node.object instanceof Identifier) {
                const len = obj.length;
                this.setMemberPropertyHoverSnapshot(node, len);
                await this.ui.animateRead(node.object.name, len, node.domIds);
                await this.ui.animateOperationCollapse(node.domIds, len);
                await this.ui.wait(800);
                return len;
            }
            if (typeof obj === 'string' && node.object instanceof Identifier) {
                const val = obj[prop];
                this.setMemberPropertyHoverSnapshot(node, val);
                if (typeof val === 'function') return val.bind(obj);
                await this.ui.animateRead(node.object.name, val, node.domIds);
                await this.ui.animateOperationCollapse(node.domIds, val);
                await this.ui.wait(800);
                return val;
            }
            if (isVirtualDomValue(obj)) {
                const domValue = obj[prop];
                this.setMemberPropertyHoverSnapshot(node, domValue);
                if (typeof domValue === 'function') return domValue.bind(obj);
                if (node.domIds && node.domIds.length > 0) {
                    if (typeof this.ui.animateDomReadToToken === 'function') await this.ui.animateDomReadToToken(obj, node.domIds[0], domValue, node.domIds, prop);
                    else this.ui.replaceTokenText(node.domIds[0], domValue, true);
                    this.collapseExpressionTokens(node.domIds, node.domIds[0]);
                }
                return domValue;
            }
            const genericValue = obj[prop];
            this.setMemberPropertyHoverSnapshot(node, genericValue);
            return genericValue;
        }
        if (node instanceof UpdateExpr) {
            const name = node.arg.name;
            const currentVal = this.currentScope.get(name).value;
            const isInc = node.op === '++';
            const newVal = isInc ? currentVal + 1 : currentVal - 1;
            const varTokenId = this.getIdentifierTokenId(node.arg.domIds, name);
            await this.ui.animateRead(name, currentVal, node.arg.domIds[0], null, varTokenId, null, {
                onArrive: async () => {
                    this.ui.replaceTokenText(node.arg.domIds[0], currentVal, true);
                }
            });
            if (node.prefix) {
                await this.ui.animateOperationCollapse(node.domIds, newVal);
                await this.ui.wait(800);
                this.currentScope.assign(name, newVal);
                const sourceTokenId = this.getExpressionDisplayTokenId(node) || node.domIds[0];
                this.ui.replaceTokenText(sourceTokenId, newVal, true);
                await this.ui.animateAssignment(name, newVal, sourceTokenId, null, varTokenId);
                await this.ui.updateMemory(this.scopeStack, name, 'write');
                return newVal;
            } else {
                await this.ui.animateOperationCollapse(node.domIds, currentVal);
                await this.ui.wait(800);
                this.currentScope.assign(name, newVal);
                const sourceTokenId = this.getExpressionDisplayTokenId(node) || node.domIds[0];
                this.ui.replaceTokenText(sourceTokenId, newVal, true);
                await this.ui.animateAssignment(name, newVal, sourceTokenId, null, varTokenId);
                await this.ui.updateMemory(this.scopeStack, name, 'write');
                return currentVal;
            }
        }
        if (node instanceof TernaryExpr) { const condition = await this.evaluate(node.test); const result = condition ? await this.evaluate(node.consequent) : await this.evaluate(node.alternate); await this.ui.animateOperationCollapse(node.domIds, result); await this.ui.wait(800); return result; }
        if (node instanceof BinaryExpr) { const left = await this.evaluate(node.left); if (node.op === '&&' && !left) { if (node.right instanceof Identifier) { try { const val = this.currentScope.get(node.right.name).value; await this.ui.visualizeIdentifier(node.right.name, val, node.right.domIds); } catch(e) { } } await this.ui.animateOperationCollapse(node.domIds, false); await this.ui.wait(800); return false; } if (node.op === '||' && left) { if (node.right instanceof Identifier) { try { const val = this.currentScope.get(node.right.name).value; await this.ui.visualizeIdentifier(node.right.name, val, node.right.domIds); } catch(e) { } } await this.ui.animateOperationCollapse(node.domIds, true); await this.ui.wait(800); return true; } const right = await this.evaluate(node.right); let result; switch(node.op) { case '+': result = left + right; break; case '-': result = left - right; break; case '*': result = left * right; break; case '/': result = left / right; break; case '%': result = left % right; break; case '>': result = left > right; break; case '<': result = left < right; break; case '>=': result = left >= right; break; case '<=': result = left <= right; break; case '==': result = left == right; break; case '!=': result = left != right; break; case '===': result = left === right; break; case '!==': result = left !== right; break; case '&&': result = left && right; break; case '||': result = left || right; break; } await this.ui.animateOperationCollapse(node.domIds, result); await this.ui.wait(800); return result; }
        if (node instanceof CallExpr) {
            const suppressResultVisual = Boolean(options && options.suppressResultVisual) || Boolean(node.__suppressResultVisual);
            const showCollapseResult = async (result, waitMs = 800) => {
                if (suppressResultVisual) return;
                await this.ui.animateOperationCollapse(node.domIds, result);
                if (waitMs > 0) await this.ui.wait(waitMs);
            };
            const showCallResultReplacement = async (result, waitMs = 800) => {
                if (suppressResultVisual) return;
                const callTargetTokenId = this.getCallReplacementTokenId(node);
                node.resultTokenId = callTargetTokenId;
                this.ui.replaceTokenText(callTargetTokenId, result, true);
                this.collapseExpressionTokens(node.domIds, callTargetTokenId);
                if (waitMs > 0) await this.ui.wait(waitMs);
            };
            const argValues = []; for (const arg of node.args) argValues.push(await this.evaluate(arg)); await this.ui.wait(800);
            if (node.callee instanceof Identifier) {
                let nativeBinding = null;
                try {
                    nativeBinding = this.currentScope.get(node.callee.name);
                } catch (error) {
                    nativeBinding = null;
                }
                const nativeFn = nativeBinding && nativeBinding.value;
                if (typeof nativeFn === 'function' && nativeFn.__nativeCallable === true) {
                    const result = await nativeFn(...argValues);
                    await showCollapseResult(result, 300);
                    return result;
                }
            }
            if (node.callee instanceof MemberExpr) {
                let obj; let arrName = null; let arrVarTokenId = null;
                let domOwner = null;
                let domOwnerName = null;
                let classListProxy = false;
                let styleProxy = false;
                if (node.callee.object instanceof Identifier) {
                    arrName = node.callee.object.name;
                    arrVarTokenId = this.getIdentifierTokenId(node.callee.object.domIds, arrName);
                    const scopedVar = this.currentScope.get(arrName);
                    obj = scopedVar.value;
                    if (isVirtualDomValue(obj)) {
                        domOwner = obj;
                        domOwnerName = arrName;
                    }
                } else if (node.callee.object instanceof MemberExpr && !node.callee.object.computed && node.callee.object.property && node.callee.object.property.value === 'classList') {
                    const ownerExpr = node.callee.object.object;
                    if (ownerExpr instanceof Identifier) {
                        domOwnerName = ownerExpr.name;
                        const ownerScopedVar = this.currentScope.get(domOwnerName);
                        domOwner = ownerScopedVar.value;
                    } else {
                        domOwner = await this.evaluate(ownerExpr);
                    }
                    if (domOwner && (typeof domOwner === 'object' || typeof domOwner === 'function')) {
                        obj = domOwner.classList;
                        classListProxy = true;
                    } else {
                        obj = undefined;
                    }
                } else if (node.callee.object instanceof MemberExpr && !node.callee.object.computed && node.callee.object.property && node.callee.object.property.value === 'style') {
                    const ownerExpr = node.callee.object.object;
                    if (ownerExpr instanceof Identifier) {
                        domOwnerName = ownerExpr.name;
                        const ownerScopedVar = this.currentScope.get(domOwnerName);
                        domOwner = ownerScopedVar.value;
                    } else {
                        domOwner = await this.evaluate(ownerExpr);
                    }
                    if (domOwner && (typeof domOwner === 'object' || typeof domOwner === 'function')) {
                        obj = domOwner.style;
                        styleProxy = true;
                    } else {
                        obj = undefined;
                    }
                } else { obj = await this.evaluate(node.callee.object); }
                if (Array.isArray(obj) && arrName) {
                    const method = node.callee.property instanceof Identifier ? node.callee.property.name : node.callee.property.value; let result;
                    if (method === 'push') { const newIndex = obj.length; for (let i = 0; i < argValues.length; i++) { const val = argValues[i]; const currentIdx = newIndex + i; obj[currentIdx] = undefined; await this.ui.updateMemory(this.scopeStack); if (node.args[i]) { await this.ui.animateAssignment(arrName, val, node.args[i].domIds[0], currentIdx, arrVarTokenId); } obj[currentIdx] = val; await this.ui.updateMemory(this.scopeStack, arrName, 'write', currentIdx); } result = obj.length; if (!suppressResultVisual) await this.ui.animateReturnHeader(arrName, result, node.domIds); await showCollapseResult(result, 800); return result; } 
                    else if (method === 'pop') { const lastIndex = obj.length - 1; const val = obj[lastIndex]; await this.ui.animateRead(arrName, val, node.domIds, lastIndex, arrVarTokenId); await this.ui.animateArrayPop(arrName, lastIndex); result = obj.pop(); await this.ui.updateMemory(this.scopeStack, arrName, 'write'); await showCollapseResult(result, 800); return result; }
                    else if (method === 'splice') { const start = argValues[0]; const count = argValues[1] || 0; const removedItems = obj.slice(start, start + count); if (removedItems.length > 0) { const indicesToHighlight = []; for(let i=0; i<count; i++) indicesToHighlight.push(start + i); await this.ui.highlightArrayElements(arrName, indicesToHighlight, 'delete'); await this.ui.wait(500); await this.ui.animateSpliceRead(arrName, removedItems, node.domIds, start); } result = obj.splice(...argValues); await this.ui.updateMemory(this.scopeStack, arrName, 'write'); await showCollapseResult(result, 800); return result; }
                    else if (method === 'slice') { const start = argValues.length > 0 ? argValues[0] : 0; const normalizedStart = typeof start === 'number' && start < 0 ? Math.max(obj.length + start, 0) : (start || 0); result = obj.slice(...argValues); if (result.length > 0) { await this.ui.animateSpliceRead(arrName, result, node.domIds, normalizedStart); } await showCollapseResult(result, 800); return result; }
                    if (method === 'shift') {
                        if (obj.length === 0) {
                            result = undefined;
                        } else {
                            const originalLength = obj.length;
                            const firstVal = obj[0];
                            await this.ui.animateRead(arrName, firstVal, node.domIds, 0, arrVarTokenId);
                            for (let index = 1; index < originalLength; index++) {
                                obj[index - 1] = obj[index];
                                await this.ui.updateMemory(this.scopeStack, arrName, 'none', index - 1, false);
                            }
                            obj[originalLength - 1] = undefined;
                            await this.ui.updateMemory(this.scopeStack, arrName, 'none', originalLength - 1, false);
                            await this.ui.animateArrayPop(arrName, originalLength - 1);
                            obj.pop();
                            result = firstVal;
                            await this.ui.updateMemory(this.scopeStack, arrName, 'write');
                        }
                        await showCollapseResult(result, 800);
                        return result;
                    }
                    if (method === 'unshift') {
                        const insertCount = argValues.length;
                        if (insertCount > 0) {
                            const originalLength = obj.length;
                            for (let i = 0; i < insertCount; i++) obj.push(undefined);
                            await this.ui.updateMemory(this.scopeStack, arrName, 'none', originalLength, false);
                            await this.ui.wait(90);
                            for (let index = originalLength - 1; index >= 0; index--) {
                                obj[index + insertCount] = obj[index];
                                await this.ui.updateMemory(this.scopeStack, arrName, 'none', index + insertCount, false);
                            }
                            for (let index = 0; index < insertCount; index++) {
                                obj[index] = undefined;
                            }
                            await this.ui.updateMemory(this.scopeStack, arrName, 'none', 0, false);
                            for (let index = 0; index < insertCount; index++) {
                                const sourceTokenId = (node.args[index] && node.args[index].domIds) ? this.getExpressionDisplayTokenId(node.args[index]) : null;
                                if (sourceTokenId) await this.ui.animateAssignment(arrName, argValues[index], sourceTokenId, index, arrVarTokenId);
                                obj[index] = argValues[index];
                                await this.ui.updateMemory(this.scopeStack, arrName, 'write', index, false);
                            }
                        }
                        result = obj.length;
                        if (!suppressResultVisual) await this.ui.animateReturnHeader(arrName, result, node.domIds);
                        await showCollapseResult(result, 800);
                        return result;
                    }
                    if (result !== undefined) return result;
                }
                if (typeof obj === 'string') {
                    const method = node.callee.property instanceof Identifier ? node.callee.property.name : node.callee.property.value;
                    if (['replace', 'toUpperCase', 'trim', 'includes', 'slice'].includes(method) && typeof obj[method] === 'function') {
                        const result = obj[method](...argValues);
                        await showCollapseResult(result, 800);
                        return result;
                    }
                }
                if (obj && (typeof obj === 'object' || typeof obj === 'function')) {
                    const method = node.callee.property instanceof Identifier ? node.callee.property.name : node.callee.property.value;
                    if (typeof obj[method] === 'function') {
                        if (classListProxy && domOwner && (method === 'add' || method === 'remove')) {
                            let result;
                            const sourceTokenId = node.args.length > 0 && node.args[0].domIds ? this.getExpressionDisplayTokenId(node.args[0]) : null;
                            const payload = argValues.length > 0 ? argValues.join(' ') : '';
                            const domNodeVisible = this.isDomNodeVisible(domOwner);
                            if (!domNodeVisible && domOwnerName && domOwnerName !== 'document') {
                                await this.ui.updateMemory(this.scopeStack, domOwnerName, 'read');
                                await this.ui.wait(220);
                            }
                            if (!domNodeVisible) {
                                result = obj[method](...argValues);
                                if (domOwnerName && domOwnerName !== 'document') {
                                    await this.ui.animateAssignment(domOwnerName, domOwner, sourceTokenId);
                                }
                            } else {
                                if (typeof this.ui.animateDomPropertyMutation === 'function') {
                                    await this.ui.animateDomPropertyMutation({
                                        targetNode: domOwner,
                                        sourceTokenId,
                                        payload,
                                        property: 'class',
                                        applyMutation: async () => { result = obj[method](...argValues); }
                                    });
                                } else {
                                    result = obj[method](...argValues);
                                    this.refreshDomView();
                                    if (typeof this.ui.animateDomMutation === 'function') await this.ui.animateDomMutation(domOwner, sourceTokenId, payload);
                                }
                            }
                            this.refreshDomView();
                            if (domOwnerName && domOwnerName !== 'document') {
                                await this.ui.updateMemory(this.scopeStack, domOwnerName, 'write', null, !domNodeVisible);
                            }
                            await showCallResultReplacement(result, 800);
                            return result;
                        }
                        if (styleProxy && domOwner && (method === 'addProperty' || method === 'setProperty' || method === 'removeProperty')) {
                            let result;
                            const sourceTokenId = (method === 'removeProperty')
                                ? (node.args.length > 0 && node.args[0].domIds ? this.getExpressionDisplayTokenId(node.args[0]) : null)
                                : ((node.args.length > 1 && node.args[1].domIds)
                                    ? this.getExpressionDisplayTokenId(node.args[1])
                                    : (node.args.length > 0 && node.args[0].domIds ? this.getExpressionDisplayTokenId(node.args[0]) : null));
                            const payload = (method === 'removeProperty')
                                ? (argValues.length > 0 ? argValues[0] : '')
                                : (argValues.length > 1 ? argValues[1] : '');
                            const domNodeVisible = this.isDomNodeVisible(domOwner);
                            if (!domNodeVisible && domOwnerName && domOwnerName !== 'document') {
                                await this.ui.updateMemory(this.scopeStack, domOwnerName, 'read');
                                await this.ui.wait(220);
                            }
                            if (!domNodeVisible) {
                                result = obj[method](...argValues);
                                if (domOwnerName && domOwnerName !== 'document') {
                                    await this.ui.animateAssignment(domOwnerName, domOwner, sourceTokenId);
                                }
                            } else {
                                if (typeof this.ui.animateDomPropertyMutation === 'function') {
                                    await this.ui.animateDomPropertyMutation({
                                        targetNode: domOwner,
                                        sourceTokenId,
                                        payload,
                                        property: 'style',
                                        applyMutation: async () => { result = obj[method](...argValues); }
                                    });
                                } else {
                                    result = obj[method](...argValues);
                                    this.refreshDomView();
                                    if (typeof this.ui.animateDomMutation === 'function') await this.ui.animateDomMutation(domOwner, sourceTokenId, payload);
                                }
                            }
                            this.refreshDomView();
                            if (domOwnerName && domOwnerName !== 'document') {
                                await this.ui.updateMemory(this.scopeStack, domOwnerName, 'write', null, !domNodeVisible);
                            }
                            await showCallResultReplacement(result, 800);
                            return result;
                        }
                        if (isVirtualDomValue(obj)) {
                            let result;
                            if (method === 'addEventListener' || method === 'removeEventListener') {
                                result = obj[method](...argValues);
                                await showCallResultReplacement(result, 500);
                                return result;
                            }
                            if (method === 'click') {
                                const targetRef = (typeof obj.__domType === 'string') ? obj : null;
                                if (targetRef) {
                                    const root = this.domDocument && this.domDocument.body ? this.domDocument.body : null;
                                    const findPath = (node, target, currentPath = '0') => {
                                        if (node === target) return currentPath;
                                        if (!node || !Array.isArray(node.children)) return null;
                                        for (let idx = 0; idx < node.children.length; idx++) {
                                            const child = node.children[idx];
                                            const nested = findPath(child, target, `${currentPath}.${idx}`);
                                            if (nested) return nested;
                                        }
                                        return null;
                                    };
                                    const path = root ? findPath(root, targetRef, '0') : '0';
                                    await this.invokeDomClick(path || '0');
                                }
                                return undefined;
                            }
                            if (method === 'appendChild') {
                                const sourceTokenId = node.args.length > 0 && node.args[0].domIds ? this.getExpressionDisplayTokenId(node.args[0]) : null;
                                const domNodeVisible = this.isDomNodeVisible(obj);
                                if (!domNodeVisible && typeof this.ui.animateDetachedDomAppendMutation === 'function') {
                                    await this.ui.animateDetachedDomAppendMutation({
                                        parentNode: obj,
                                        childNode: argValues[0],
                                        sourceTokenId,
                                        applyMutation: async () => { result = obj[method](...argValues); }
                                    });
                                } else if (typeof this.ui.animateDomAppendMutation === 'function') {
                                    await this.ui.animateDomAppendMutation({
                                        parentNode: obj,
                                        childNode: argValues[0],
                                        sourceTokenId,
                                        applyMutation: async () => { result = obj[method](...argValues); }
                                    });
                                } else {
                                    result = obj[method](...argValues);
                                    this.refreshDomView();
                                    if (typeof this.ui.animateDomMutation === 'function') await this.ui.animateDomMutation(obj, sourceTokenId, argValues[0]);
                                }
                                this.refreshDomView();
                                await showCallResultReplacement(result, 800);
                                return result;
                            }
                            if (method === 'removeChild') {
                                const sourceTokenId = node.args.length > 0 && node.args[0].domIds ? this.getExpressionDisplayTokenId(node.args[0]) : null;
                                const domNodeVisible = this.isDomNodeVisible(obj);
                                if (!domNodeVisible && typeof this.ui.animateDetachedDomRemoveMutation === 'function') {
                                    await this.ui.animateDetachedDomRemoveMutation({
                                        parentNode: obj,
                                        removedNode: argValues[0],
                                        sourceTokenId,
                                        applyMutation: async () => { result = obj[method](...argValues); }
                                    });
                                } else if (typeof this.ui.animateDomRemoveMutation === 'function') {
                                    await this.ui.animateDomRemoveMutation({
                                        parentNode: obj,
                                        removedNode: argValues[0],
                                        sourceTokenId,
                                        applyMutation: async () => { result = obj[method](...argValues); }
                                    });
                                } else {
                                    result = obj[method](...argValues);
                                    this.refreshDomView();
                                    if (typeof this.ui.animateDomMutation === 'function') await this.ui.animateDomMutation(obj, sourceTokenId, argValues[0]);
                                }
                                this.refreshDomView();
                                await showCallResultReplacement(result, 800);
                                return result;
                            }
                            if (['getElementById', 'querySelector'].includes(method)) {
                                result = obj[method](...argValues);
                                if (result && !suppressResultVisual) {
                                    const callTargetTokenId = this.getCallReplacementTokenId(node);
                                    node.resultTokenId = callTargetTokenId;
                                    if (typeof this.ui.animateDomReadToToken === 'function') await this.ui.animateDomReadToToken(result, callTargetTokenId, result, node.domIds);
                                    else this.ui.replaceTokenText(callTargetTokenId, result, true);
                                    this.collapseExpressionTokens(node.domIds, callTargetTokenId);
                                }
                                return result;
                            }
                            if (method === 'getAttribute') {
                                result = obj[method](...argValues);
                                const attrName = (argValues.length > 0) ? String(argValues[0]) : '';
                                if (!suppressResultVisual) {
                                    const callTargetTokenId = this.getCallReplacementTokenId(node);
                                    node.resultTokenId = callTargetTokenId;
                                    if (typeof this.ui.animateDomReadToToken === 'function') await this.ui.animateDomReadToToken(obj, callTargetTokenId, result, node.domIds, attrName);
                                    else this.ui.replaceTokenText(callTargetTokenId, result, true);
                                    this.collapseExpressionTokens(node.domIds, callTargetTokenId);
                                }
                                return result;
                            }
                            if (method === 'setAttribute') {
                                const attrName = (argValues.length > 0) ? String(argValues[0]) : '';
                                const attrValue = (argValues.length > 1) ? argValues[1] : '';
                                const sourceTokenId = (node.args.length > 1 && node.args[1].domIds)
                                    ? this.getExpressionDisplayTokenId(node.args[1])
                                    : ((node.args.length > 0 && node.args[0].domIds) ? this.getExpressionDisplayTokenId(node.args[0]) : null);
                                const domNodeVisible = this.isDomNodeVisible(obj);
                                if (!domNodeVisible && arrName && arrName !== 'document') {
                                    await this.ui.updateMemory(this.scopeStack, arrName, 'read');
                                    await this.ui.wait(220);
                                }
                                if (!domNodeVisible) {
                                    result = obj[method](...argValues);
                                    if (arrName && arrName !== 'document') {
                                        await this.ui.animateAssignment(arrName, obj, sourceTokenId);
                                    }
                                } else {
                                    if (typeof this.ui.animateDomPropertyMutation === 'function') {
                                        await this.ui.animateDomPropertyMutation({
                                            targetNode: obj,
                                            sourceTokenId,
                                            payload: attrValue,
                                            property: attrName,
                                            applyMutation: async () => { result = obj[method](...argValues); }
                                        });
                                    } else {
                                        result = obj[method](...argValues);
                                        this.refreshDomView();
                                        if (typeof this.ui.animateDomMutation === 'function') await this.ui.animateDomMutation(obj, sourceTokenId, attrValue);
                                    }
                                }
                                this.refreshDomView();
                                if (arrName && arrName !== 'document') {
                                    await this.ui.updateMemory(this.scopeStack, arrName, 'write', null, !domNodeVisible);
                                }
                                await showCallResultReplacement(result, 800);
                                return result;
                            }
                            if (method === 'removeAttribute') {
                                const attrName = (argValues.length > 0) ? String(argValues[0]) : '';
                                const sourceTokenId = (node.args.length > 0 && node.args[0].domIds)
                                    ? this.getExpressionDisplayTokenId(node.args[0])
                                    : null;
                                const domNodeVisible = this.isDomNodeVisible(obj);
                                if (!domNodeVisible && arrName && arrName !== 'document') {
                                    await this.ui.updateMemory(this.scopeStack, arrName, 'read');
                                    await this.ui.wait(220);
                                }
                                if (!domNodeVisible) {
                                    result = obj[method](...argValues);
                                    if (arrName && arrName !== 'document') {
                                        await this.ui.animateAssignment(arrName, obj, sourceTokenId);
                                    }
                                } else {
                                    if (typeof this.ui.animateDomPropertyMutation === 'function') {
                                        await this.ui.animateDomPropertyMutation({
                                            targetNode: obj,
                                            sourceTokenId,
                                            payload: '',
                                            property: attrName,
                                            applyMutation: async () => { result = obj[method](...argValues); }
                                        });
                                    } else {
                                        result = obj[method](...argValues);
                                        this.refreshDomView();
                                        if (typeof this.ui.animateDomMutation === 'function') await this.ui.animateDomMutation(obj, sourceTokenId, attrName);
                                    }
                                }
                                this.refreshDomView();
                                if (arrName && arrName !== 'document') {
                                    await this.ui.updateMemory(this.scopeStack, arrName, 'write', null, !domNodeVisible);
                                }
                                await showCallResultReplacement(result, 800);
                                return result;
                            }
                            if (method === 'createElement') {
                                result = obj[method](...argValues);
                                const tokenEls = (node.domIds || []).map((id) => document.getElementById(id)).filter(Boolean);
                                if (!suppressResultVisual) {
                                    const callTargetTokenId = this.getCallReplacementTokenId(node);
                                    node.resultTokenId = callTargetTokenId;
                                    if (tokenEls.length > 0 && typeof this.ui.setFlowHighlight === 'function') this.ui.setFlowHighlight(tokenEls, true);
                                    await this.ui.wait(180);
                                    this.ui.replaceTokenText(callTargetTokenId, result, true);
                                    await this.ui.wait(180);
                                    if (tokenEls.length > 0 && typeof this.ui.setFlowHighlight === 'function') this.ui.setFlowHighlight(tokenEls, false);
                                    this.collapseExpressionTokens(node.domIds, callTargetTokenId);
                                    await this.ui.wait(220);
                                }
                                return result;
                            }
                            result = obj[method](...argValues);
                            this.refreshDomView();
                            if (typeof this.ui.animateDomMutation === 'function') await this.ui.animateDomMutation(obj, null, result);
                            await showCallResultReplacement(result, 800);
                            return result;
                        }
                        const result = obj[method](...argValues);
                        await showCollapseResult(result, 800);
                        return result;
                    }
                }
                const unresolvedMethod = node.callee.property instanceof Identifier ? node.callee.property.name : node.callee.property.value;
                if (obj === null || obj === undefined) {
                    throw new TypeError(`Cannot read properties of ${obj} (reading '${unresolvedMethod}')`);
                }
                if (typeof obj[unresolvedMethod] !== 'function') {
                    throw new TypeError(`${unresolvedMethod} is not a function`);
                }
            }
            if (node.callee instanceof Identifier && node.callee.name === 'console.log') { 
                await this.ui.highlightLines([node.line]); // Redundant highlight fix
                await this.ui.consoleLog(argValues); 
                return undefined; 
            }
            if (node.callee instanceof Identifier) { 
                if (node.callee.name === 'parseInt') { 
                    const res = parseInt(...argValues); 
                    await showCollapseResult(res, 800);
                    return res; 
                } 
                if (node.callee.name.startsWith('Math.')) { 
                    const method = node.callee.name.split('.')[1]; 
                    if (typeof Math[method] === 'function') {
                        let res = Math[method](...argValues); 
                        await showCollapseResult(res, 800);
                        return res; 
                    }
                } 
            }
            if (node.callee instanceof MemberExpr) { const objVal = await this.evaluate(node.callee.object); const propName = node.callee.property instanceof Identifier ? node.callee.property.name : node.callee.property.value; if (propName === 'toFixed' && typeof objVal === 'number') { const digits = argValues.length > 0 ? argValues[0] : 0; const res = objVal.toFixed(digits); await showCollapseResult(`"${res}"`, 800); return res; } }
            let funcNode; let closureScope = this.globalScope; let paramNames = []; let funcName = "anonymous"; let paramIds = []; let calleeDisplayName = null;
            if (node.callee instanceof Identifier) {
                funcName = node.callee.name;
                let val = null;
                try {
                    val = this.currentScope.get(node.callee.name);
                } catch(e) {
                    const rawMessage = (e && e.message) ? String(e.message) : '';
                    if (!rawMessage.includes('non définie')) throw e;
                }
                if (val && val.value && (val.value.type === 'arrow_func' || val.value.type === 'function_expr' || val.value.type === 'function_decl_ref')) {
                    if (val.value.type === 'function_decl_ref') {
                        funcNode = val.value.node;
                        closureScope = val.value.scope || this.globalScope;
                        paramNames = funcNode.params.map(p => p.name);
                        paramIds = funcNode.params.map(p => p.id);
                    } else {
                        funcNode = val.value;
                        closureScope = val.value.scope;
                        paramNames = val.value.params;
                        paramIds = val.value.paramIds || [];
                    }
                    if (val.functionAlias) calleeDisplayName = val.functionAlias;
                } else if (this.functions[node.callee.name]) {
                    funcNode = this.functions[node.callee.name];
                    paramNames = funcNode.params.map(p => p.name);
                    paramIds = funcNode.params.map(p => p.id);
                } else {
                    throw new ReferenceError(`${node.callee.name} is not defined`);
                }
            }
            if (funcNode) {
                if (calleeDisplayName && node.callee && node.callee.domIds && node.callee.domIds.length > 0) {
                    await this.ui.animateRead(node.callee.name, calleeDisplayName, node.callee.domIds[0], null, node.callee.domIds[0], null, {
                        onArrive: async () => {
                            this.ui.setRawTokenText(node.callee.domIds[0], calleeDisplayName, true);
                            await this.ui.wait(180);
                        }
                    });
                }
                const displayFuncName = calleeDisplayName || funcName;
                const fnScope = new Scope(`${displayFuncName}(${paramNames.join(', ')})`, closureScope, this.currentScope);
                this.scopeStack.push(fnScope);
                const prevScope = this.currentScope;
                let callFramePushed = false;
                let tokensLocked = false;
                try {
                    for (let i=0; i<paramNames.length; i++) {
                        const pName = paramNames[i];
                        const argNode = node.args[i];
                        const argValue = argValues[i];
                        const isFunctionIdentifierArg = (argNode instanceof Identifier)
                            && argValue
                            && (argValue.type === 'arrow_func' || argValue.type === 'function_expr' || argValue.type === 'function_decl_ref');
                        const argVisualValue = isFunctionIdentifierArg ? argNode.name : argValue;
                        if (argNode && paramIds[i]) {
                            await this.ui.animateParamPass(argVisualValue, argNode.domIds[0], paramIds[i]);
                        }
                        fnScope.define(pName, 'let');
                        fnScope.initialize(pName, argValue);
                        if (paramIds[i]) {
                            const aliasName = isFunctionIdentifierArg ? argNode.name : null;
                            this.setVariableFunctionAlias(pName, aliasName, fnScope);
                            if (isFunctionIdentifierArg) this.ui.setRawTokenText(paramIds[i], argNode.name, false);
                            else this.ui.replaceTokenText(paramIds[i], argValue, false);
                        } else {
                            this.setVariableFunctionAlias(pName, null, fnScope);
                        }
                        await this.ui.updateMemory(this.scopeStack, pName, 'declare');
                    }
                    await this.ui.wait(600);
                    this.currentScope = fnScope;
                    await this.ui.updateMemory(this.scopeStack);
                    for (let i=0; i<paramIds.length; i++) {
                        if (paramIds[i]) this.ui.resetTokenText(paramIds[i]);
                    }
                    this.ui.lockTokens(node.domIds || []);
                    tokensLocked = true;
                    this.callStack.push(node.line);
                    callFramePushed = true;
                    let result = undefined;
                    let returnSourceId = null;
                    const body = funcNode.body;
                    if (body instanceof BlockStmt) {
                        const blockResult = await this.executeBlock(body.body);
                        if (blockResult && blockResult.__isReturn) {
                            result = blockResult.value;
                            returnSourceId = blockResult.sourceId || null;
                        }
                    } else {
                        await this.pause(node.line);
                        result = await this.evaluate(body);
                        returnSourceId = body.domIds ? body.domIds[0] : null;
                    }
                    if (!suppressResultVisual && result !== undefined) {
                        if(returnSourceId) await this.ui.animateReturnToCall(node.domIds, result, returnSourceId);
                        else await this.ui.animateReturnToCall(node.domIds, result);
                        await this.ui.wait(800);
                    }
                    return result;
                } catch (runtimeError) {
                    if (!runtimeError || !Array.isArray(runtimeError.__pedagogicalStack) || runtimeError.__pedagogicalStack.length === 0) {
                        if (runtimeError && typeof runtimeError === 'object') runtimeError.__pedagogicalStack = this.buildPedagogicalStack(this.lastPausedLine);
                    }
                    throw runtimeError;
                } finally {
                    if (callFramePushed) this.callStack.pop();
                    if (tokensLocked) this.ui.unlockTokens(node.domIds || []);
                    this.currentScope = prevScope;
                    const scopeIndex = this.scopeStack.lastIndexOf(fnScope);
                    if (scopeIndex !== -1) this.scopeStack.splice(scopeIndex, 1);
                    await this.ui.updateMemory(this.scopeStack);
                    for (let i=0; i<paramIds.length; i++) {
                        if (paramIds[i]) this.ui.resetTokenText(paramIds[i]);
                    }
                }
            }
        }
    }
}
