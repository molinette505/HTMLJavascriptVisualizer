// @ts-nocheck
import { formatValue } from './config';
import {
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
    ReturnStmt,
} from './language';
import { Scope } from './scope';
import { isVirtualDomValue } from './virtualDom';

export async function executeNode(interpreter, node) {
    if (interpreter.shouldStop) return;
    if (node instanceof BlockStmt) { const blockScope = new Scope("Block", interpreter.currentScope, interpreter.currentScope); interpreter.scopeStack.push(blockScope); const prevScope = interpreter.currentScope; interpreter.currentScope = blockScope; let result; try { result = await interpreter.executeBlock(node.body); } finally { interpreter.currentScope = prevScope; interpreter.scopeStack.pop(); await interpreter.ui.updateMemory(interpreter.scopeStack); } return result; }
    if (node instanceof MultiVarDecl) { for (const decl of node.decls) { await interpreter.execute(decl); } return; }
    if (node instanceof VarDecl) {
        await interpreter.pause(node.line);
        const hasOwnBinding = Object.prototype.hasOwnProperty.call(interpreter.currentScope.variables, node.name);
        const existingBinding = hasOwnBinding ? interpreter.currentScope.variables[node.name] : null;
        let declarationVisualized = false;
        if (!hasOwnBinding) {
            interpreter.currentScope.define(node.name, node.kind);
            await interpreter.ui.updateMemory(interpreter.scopeStack, node.name, 'declare');
            await interpreter.ui.wait(600);
            declarationVisualized = true;
        } else if (existingBinding && existingBinding.declared === false) {
            existingBinding.declared = true;
            await interpreter.ui.updateMemory(interpreter.scopeStack, node.name, 'declare');
            await interpreter.ui.wait(600);
            declarationVisualized = true;
        }
        const varTokenId = interpreter.getIdentifierTokenId(node.domIds, node.name);
        if (node.init) {
            if (node.init instanceof ArrayLiteral) {
                const arr = new Array(node.init.elements.length).fill(undefined);
                interpreter.currentScope.initialize(node.name, arr);
                interpreter.setVariableFunctionAlias(node.name, null, interpreter.currentScope);
                await interpreter.ui.updateMemory(interpreter.scopeStack, node.name, 'write');
                for (let i = 0; i < node.init.elements.length; i++) {
                    const val = await interpreter.evaluate(node.init.elements[i]);
                    arr[i] = val;
                    await interpreter.ui.animateAssignment(node.name, val, interpreter.getExpressionDisplayTokenId(node.init.elements[i]), i, varTokenId);
                    await interpreter.ui.updateMemory(interpreter.scopeStack, node.name, 'write', i);
                }
            } else if (node.init instanceof ArrowFunctionExpr) {
                const func = { type: 'arrow_func', params: node.init.params.map(p=>p.name), body: node.init.body, scope: interpreter.currentScope, paramIds: node.init.params.map(p=>p.id) };
                interpreter.currentScope.initialize(node.name, func);
                interpreter.setVariableFunctionAlias(node.name, null, interpreter.currentScope);
                await interpreter.ui.updateMemory(interpreter.scopeStack, node.name, 'write');
            } else if (node.init instanceof FunctionExpression) {
                const func = await interpreter.evaluate(node.init);
                interpreter.currentScope.initialize(node.name, func);
                interpreter.setVariableFunctionAlias(node.name, null, interpreter.currentScope);
                await interpreter.ui.updateMemory(interpreter.scopeStack, node.name, 'write');
            } else {
                const val = await interpreter.evaluate(node.init);
                interpreter.currentScope.initialize(node.name, val);
                const aliasName = (node.init instanceof Identifier && val && (val.type === 'arrow_func' || val.type === 'function_expr'))
                    ? node.init.name
                    : null;
                interpreter.setVariableFunctionAlias(node.name, aliasName, interpreter.currentScope);
                await interpreter.ui.animateAssignment(node.name, val, interpreter.getExpressionDisplayTokenId(node.init), null, varTokenId);
                await interpreter.ui.updateMemory(interpreter.scopeStack, node.name, 'write');
            }
        } else if (hasOwnBinding && interpreter.currentScope.variables[node.name].initialized === false) {
            interpreter.currentScope.initialize(node.name, undefined);
            await interpreter.ui.updateMemory(interpreter.scopeStack, node.name, 'write');
            declarationVisualized = true;
        }
        if (!node.init && declarationVisualized && interpreter.ui && typeof interpreter.ui.maybePauseAfterMicroStep === 'function') {
            await interpreter.ui.maybePauseAfterMicroStep();
        }
    }
    else if (node instanceof Assignment) {
        await interpreter.pause(node.line);
        let val;
        if (node.value instanceof ArrowFunctionExpr) {
            val = { type: 'arrow_func', params: node.value.params.map(p=>p.name), body: node.value.body, scope: interpreter.currentScope, paramIds: node.value.params.map(p=>p.id) };
        } else {
            val = await interpreter.evaluate(node.value);
        }
        if (node.left instanceof Identifier) {
            interpreter.currentScope.assign(node.left.name, val);
            const aliasName = (node.value instanceof Identifier && val && (val.type === 'arrow_func' || val.type === 'function_expr'))
                ? node.value.name
                : null;
            interpreter.setVariableFunctionAlias(node.left.name, aliasName);
            const leftVarTokenId = interpreter.getIdentifierTokenId(node.left.domIds, node.left.name);
            if (typeof val !== 'object' || (val.type !== 'arrow_func' && val.type !== 'function_expr')) {
                await interpreter.ui.animateAssignment(node.left.name, val, interpreter.getExpressionDisplayTokenId(node.value), null, leftVarTokenId);
            }
            await interpreter.ui.updateMemory(interpreter.scopeStack, node.left.name, 'write');
        } else if (node.left instanceof MemberExpr) {
            let obj;
            let targetName = null;
            if (node.left.object instanceof Identifier) {
                targetName = node.left.object.name;
                const scopedVar = interpreter.currentScope.get(targetName);
                obj = scopedVar.value;
            } else {
                obj = await interpreter.evaluate(node.left.object);
            }
            const prop = node.left.computed ? await interpreter.evaluate(node.left.property) : node.left.property.value;
            if (Array.isArray(obj)) {
                obj[prop] = val;
                if (targetName) {
                    const targetVarTokenId = interpreter.getIdentifierTokenId(node.left.object.domIds, targetName);
                    const targetIndexTokenId = (node.left.computed && node.left.property)
                        ? interpreter.getExpressionDisplayTokenId(node.left.property)
                        : null;
                    await interpreter.ui.animateAssignment(targetName, val, interpreter.getExpressionDisplayTokenId(node.value), prop, targetVarTokenId, targetIndexTokenId);
                    await interpreter.ui.updateMemory(interpreter.scopeStack, targetName, 'write', prop);
                }
            } else if (obj && (typeof obj === 'object' || typeof obj === 'function')) {
                if (isVirtualDomValue(obj)) {
                    const sourceTokenId = interpreter.getExpressionDisplayTokenId(node.value);
                    const domNodeVisible = interpreter.isDomNodeVisible(obj);
                    const targetVarTokenId = interpreter.getIdentifierTokenId(node.left.object.domIds, targetName);
                    if (!domNodeVisible && targetName && targetName !== 'document') {
                        await interpreter.ui.updateMemory(interpreter.scopeStack, targetName, 'read');
                        await interpreter.ui.wait(220);
                    }
                    if (!domNodeVisible) {
                        if (typeof interpreter.ui.animateDetachedDomPropertyMutation === 'function') {
                            await interpreter.ui.animateDetachedDomPropertyMutation({
                                targetNode: obj,
                                sourceTokenId,
                                payload: val,
                                property: prop,
                                applyMutation: async () => { obj[prop] = val; }
                            });
                        } else {
                            obj[prop] = val;
                            if (targetName && targetName !== 'document') {
                                await interpreter.ui.animateAssignment(targetName, obj, sourceTokenId, null, targetVarTokenId);
                            }
                        }
                    } else {
                        if (typeof interpreter.ui.animateDomPropertyMutation === 'function') {
                            await interpreter.ui.animateDomPropertyMutation({
                                targetNode: obj,
                                sourceTokenId,
                                payload: val,
                                property: prop,
                                applyMutation: async () => { obj[prop] = val; }
                            });
                            interpreter.refreshDomView();
                        } else {
                            obj[prop] = val;
                            interpreter.refreshDomView();
                            if (typeof interpreter.ui.animateDomMutation === 'function') {
                                await interpreter.ui.animateDomMutation(obj, sourceTokenId, val);
                            }
                        }
                    }
                    if (targetName && targetName !== 'document') {
                        await interpreter.ui.updateMemory(interpreter.scopeStack, targetName, 'write', null, !domNodeVisible);
                    }
                } else {
                    obj[prop] = val;
                }
            }
        }
    }
    else if (node instanceof CallExpr) {
        await interpreter.pause(node.line);
        node.__suppressResultVisual = true;
        try {
            await interpreter.evaluate(node, { suppressResultVisual: true });
        } finally {
            delete node.__suppressResultVisual;
        }
        // Appel expression seul (ex: tableau.pop();) :
        // on garde les effets de bord, mais on n'affiche pas la valeur de retour dans le code.
        interpreter.ui.resetVisuals();
    }
    else if (node instanceof UpdateExpr) { await interpreter.pause(node.line); await interpreter.evaluate(node); }
    else if (node instanceof IfStmt) { await interpreter.pause(node.line); const test = await interpreter.evaluate(node.test); interpreter.ui.lockTokens(node.test.domIds||[]); let res; try { if (test) { if (node.consequent instanceof BlockStmt) res = await interpreter.executeBlock(node.consequent.body); else res = await interpreter.execute(node.consequent); } else if (node.alternate) { if (node.alternate instanceof BlockStmt) res = await interpreter.executeBlock(node.alternate.body); else res = await interpreter.execute(node.alternate); } } finally { interpreter.ui.unlockTokens(node.test.domIds||[]); } if (res) return res; }
    else if (node instanceof WhileStmt) {
        while(true) {
            await interpreter.pause(node.line);
            const test = await interpreter.evaluate(node.test);
            interpreter.ui.lockTokens(node.test.domIds||[]);
            if(!test) {
                interpreter.ui.unlockTokens(node.test.domIds||[]);
                break;
            }
            const loopScope = new Scope("Loop", interpreter.currentScope, interpreter.currentScope);
            interpreter.scopeStack.push(loopScope);
            const prevScope = interpreter.currentScope;
            interpreter.currentScope = loopScope;
            try {
                const res = (node.body instanceof BlockStmt) ? await interpreter.executeBlock(node.body.body) : await interpreter.execute(node.body);
                if(res==='BREAK') {
                    interpreter.ui.unlockTokens(node.test.domIds||[]);
                    break;
                }
                if(res&&res.__isReturn) return res;
            } finally {
                interpreter.currentScope = prevScope;
                interpreter.scopeStack.pop();
                await interpreter.ui.updateMemory(interpreter.scopeStack);
            }
            interpreter.ui.unlockTokens(node.test.domIds||[]);
        }
    }
    else if (node instanceof DoWhileStmt) {
        do {
            const loopScope = new Scope("Loop", interpreter.currentScope, interpreter.currentScope);
            interpreter.scopeStack.push(loopScope);
            const prevScope = interpreter.currentScope;
            interpreter.currentScope = loopScope;
            try {
                const res = (node.body instanceof BlockStmt) ? await interpreter.executeBlock(node.body.body) : await interpreter.execute(node.body);
                if(res==='BREAK') {
                    interpreter.ui.unlockTokens(node.test.domIds||[]);
                    break;
                }
                if(res&&res.__isReturn) return res;
            } finally {
                interpreter.currentScope = prevScope;
                interpreter.scopeStack.pop();
                await interpreter.ui.updateMemory(interpreter.scopeStack);
            }
            await interpreter.pause(node.line);
            const test = await interpreter.evaluate(node.test);
            interpreter.ui.lockTokens(node.test.domIds||[]);
            if(!test) {
                interpreter.ui.unlockTokens(node.test.domIds||[]);
                break;
            }
            interpreter.ui.unlockTokens(node.test.domIds||[]);
        } while(true);
    }
    else if (node instanceof ForStmt) {
        const loopScope = new Scope("Loop", interpreter.currentScope, interpreter.currentScope);
        interpreter.scopeStack.push(loopScope);
        const prevScope = interpreter.currentScope;
        interpreter.currentScope = loopScope;
        try {
            if (node.init) {
                if (node.init instanceof VarDecl || node.init instanceof BlockStmt || node.init instanceof MultiVarDecl) await interpreter.execute(node.init);
                else {
                    if (node.init instanceof Assignment || node.init instanceof UpdateExpr || node.init instanceof CallExpr) {
                        await interpreter.pause(node.line);
                        await interpreter.executeWithSuppressedPause(node.init);
                    } else {
                        await interpreter.pause(node.init.line);
                        await interpreter.evaluate(node.init);
                    }
                }
            }
            while (true) {
                if (node.test) {
                    await interpreter.pause(node.line);
                    const test = await interpreter.evaluate(node.test);
                    if (!test) break;
                }

                const iterationScope = new Scope("Loop", interpreter.currentScope, interpreter.currentScope);
                interpreter.scopeStack.push(iterationScope);
                const prevIterationScope = interpreter.currentScope;
                interpreter.currentScope = iterationScope;
                let bodyResult;
                try {
                    bodyResult = (node.body instanceof BlockStmt) ? await interpreter.executeBlock(node.body.body) : await interpreter.execute(node.body);
                } finally {
                    interpreter.currentScope = prevIterationScope;
                    interpreter.scopeStack.pop();
                    await interpreter.ui.updateMemory(interpreter.scopeStack);
                }

                if (bodyResult === 'BREAK') {
                    break;
                }
                if (bodyResult && bodyResult.__isReturn) {
                    return bodyResult;
                }

                if (node.update) {
                    if (node.update instanceof Assignment || node.update instanceof UpdateExpr || node.update instanceof CallExpr) {
                        await interpreter.pause(node.line);
                        await interpreter.executeWithSuppressedPause(node.update);
                    } else {
                        await interpreter.pause(node.line);
                        await interpreter.evaluate(node.update);
                    }
                }
            }
        } finally {
            interpreter.currentScope = prevScope;
            interpreter.scopeStack.pop();
            await interpreter.ui.updateMemory(interpreter.scopeStack);
        }
    }
    else if (node instanceof SwitchStmt) { await interpreter.pause(node.line); const disc = await interpreter.evaluate(node.discriminant); let start=-1; let def=-1; for(let i=0;i<node.cases.length;i++){ const c=node.cases[i]; if(c.test){ await interpreter.pause(c.line); const tv=await interpreter.evaluate(c.test); const v1=JSON.stringify(formatValue(disc)); const v2=JSON.stringify(formatValue(tv)); const compStr=`${v1} === ${v2}`; if(c.test.domIds.length>0){ interpreter.ui.setRawTokenText(c.test.domIds[0], compStr, true); for(let k=1;k<c.test.domIds.length;k++){ const el=document.getElementById(c.test.domIds[k]); if(el){ if(!interpreter.ui.modifiedTokens.has(c.test.domIds[k])) interpreter.ui.modifiedTokens.set(c.test.domIds[k], {original:el.innerText, transient:true}); el.style.display='none'; } } } await interpreter.ui.wait(800); const isMatch=(tv===disc); await interpreter.ui.animateOperationCollapse(c.test.domIds, isMatch); await interpreter.ui.wait(800); if(isMatch){ start=i; break; } } else { def=i; } } if(start===-1) start=def; if(start!==-1){ for(let i=start; i<node.cases.length; i++){ const c=node.cases[i]; for(const s of c.consequent){ const res=await interpreter.execute(s); if(res==='BREAK') return; if(res&&res.__isReturn) return res; } } } }
    else if (node instanceof BreakStmt) { await interpreter.pause(node.line); return 'BREAK'; }
    else if (node instanceof ReturnStmt) {
        await interpreter.pause(node.line);
        const value = node.argument ? await interpreter.evaluate(node.argument) : undefined;
        const sourceId = (node.argument && node.argument.domIds && node.argument.domIds.length > 0)
            ? interpreter.getExpressionDisplayTokenId(node.argument)
            : ((node.domIds && node.domIds.length > 0) ? node.domIds[0] : null);
        return { __isReturn: true, value, sourceId };
    }
    else if (node instanceof FunctionDecl) { await interpreter.pause(node.line); interpreter.functions[node.name] = node; }
}
