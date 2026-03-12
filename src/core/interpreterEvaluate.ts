// @ts-nocheck
// File purpose: expression-level evaluator (reads, calls, operators) with visual side effects.
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
    Literal,
    UnaryExpr,
    NewExpr,
    ArgumentsNode,
    BinaryExpr,
    TernaryExpr,
    ReturnStmt,
} from './language';
import { Scope } from './scope';
import { isVirtualDomValue } from './virtualDom';

// Evaluate one expression AST node and return the computed runtime value.
// Unlike executeNode, this function may still trigger animations for readability.
export async function evaluateNode(interpreter, node, options = {}) {
    if (node instanceof Literal) {
        if (node.isTemplate) {
            const tokenId = node.domIds && node.domIds.length > 0 ? node.domIds[0] : null;
            return await interpreter.evaluateTemplateLiteral(node.value, tokenId);
        }
        return node.value;
    }
    if (node instanceof UnaryExpr) { const arg = await interpreter.evaluate(node.arg); let res; if (node.op === '!') res = !arg; else if (node.op === '-') res = -arg; else if (node.op === '+') res = +arg; await interpreter.ui.animateOperationCollapse(node.domIds, res); await interpreter.ui.wait(800); return res; }
    if (node instanceof FunctionExpression) { return { type: 'function_expr', name: node.name || 'anonymous', params: node.params.map(p => p.name), paramIds: node.params.map(p => p.id), body: node.body, scope: interpreter.currentScope }; }
    if (node instanceof ArrowFunctionExpr) { return { type: 'arrow_func', params: node.params.map(p => p.name), paramIds: node.params.map(p => p.id), body: node.body, scope: interpreter.currentScope }; }
    if (node instanceof ArrayLiteral) { const elements = []; for (const el of node.elements) { elements.push(await interpreter.evaluate(el)); } return elements; }
    if (node instanceof NewExpr) { if (node.callee instanceof Identifier && node.callee.name === 'Array') { const args = []; for(const arg of node.args) args.push(await interpreter.evaluate(arg)); if(args.length === 1 && typeof args[0] === 'number') { return new Array(args[0]).fill(undefined); } return new Array(...args); } }
    if (node instanceof ArgumentsNode) { let result; for(const arg of node.args) { result = await interpreter.evaluate(arg); } return result; }
    // Identifier reads can resolve to both variable bindings and hoisted function refs.
    if (node instanceof Identifier) {
        let variable;
        try {
            variable = interpreter.currentScope.get(node.name);
        } catch (error) {
            const rawMessage = (error && error.message) ? String(error.message) : '';
            const isUndefinedBinding = rawMessage.includes('non définie');
            if (isUndefinedBinding && interpreter.functions[node.name]) {
                return {
                    type: 'function_decl_ref',
                    name: node.name,
                    node: interpreter.functions[node.name],
                    scope: interpreter.currentScope
                };
            }
            throw error;
        }
        if (variable.value && variable.value.type === 'arrow_func') return variable.value;
        if (variable.value && variable.value.type === 'function_expr') return variable.value;
        if (variable.value && variable.value.type === 'function_decl_ref') return variable.value;
        await interpreter.ui.animateRead(node.name, variable.value, node.domIds[0], null, null, null, {
            onArrive: async () => {
                interpreter.ui.replaceTokenText(node.domIds[0], variable.value, true);
                for (let i = 1; i < node.domIds.length; i++) {
                    const el = document.getElementById(node.domIds[i]);
                    if (!el) continue;
                    if (!interpreter.ui.modifiedTokens.has(node.domIds[i])) interpreter.ui.modifiedTokens.set(node.domIds[i], { original: el.innerText, transient: true });
                    el.style.display = 'none';
                }
                await interpreter.ui.wait(120);
            }
        });
        return variable.value;
    }
    // Member access supports arrays, strings, virtual DOM nodes, and generic objects.
    if (node instanceof MemberExpr) {
        let obj;
        // For common `.length` chains (e.g. callResult.length), avoid rendering noisy
        // intermediate array/object values in code before collapsing to the final number.
        const staticPropName = (!node.computed && node.property && Object.prototype.hasOwnProperty.call(node.property, 'value'))
            ? node.property.value
            : null;
        const shouldSuppressObjectResultVisual = staticPropName === 'length';
        if (node.object instanceof Identifier) {
            const varName = node.object.name;
            const scopedVar = interpreter.currentScope.get(varName);
            obj = scopedVar.value;
        } else {
            obj = await interpreter.evaluate(
                node.object,
                shouldSuppressObjectResultVisual ? { suppressResultVisual: true } : {}
            );
        }
        const prop = node.computed ? await interpreter.evaluate(node.property) : node.property.value;
        if (Array.isArray(obj) && prop === 'length' && node.object instanceof Identifier) {
            interpreter.setMemberPropertyHoverSnapshot(node, obj.length);
            await interpreter.ui.animateReadHeader(node.object.name, obj.length, node.domIds, {
                onArrive: async () => {
                    const replacementTargetId = interpreter.getExpressionDisplayTokenId(node)
                        || (node.domIds && node.domIds.length > 0 ? node.domIds[0] : null);
                    if (!replacementTargetId) return;
                    interpreter.ui.replaceTokenText(replacementTargetId, obj.length, true);
                    interpreter.collapseExpressionTokens(node.domIds, replacementTargetId);
                    await interpreter.ui.wait(120);
                }
            });
            return obj.length;
        }
        if (Array.isArray(obj) && prop === 'length') {
            const len = obj.length;
            interpreter.setMemberPropertyHoverSnapshot(node, len);
            const replacementTargetId = interpreter.getExpressionDisplayTokenId(node)
                || (node.domIds && node.domIds.length > 0 ? node.domIds[0] : null);
            if (replacementTargetId) {
                interpreter.ui.replaceTokenText(replacementTargetId, len, true);
                interpreter.collapseExpressionTokens(node.domIds, replacementTargetId);
                await interpreter.ui.wait(120);
            }
            return len;
        }
        if (Array.isArray(obj) && node.object instanceof Identifier) {
            const val = obj[prop];
            interpreter.setMemberPropertyHoverSnapshot(node, val);
            const sourceVarTokenId = interpreter.getIdentifierTokenId(node.object.domIds, node.object.name);
            const sourceIndexTokenId = (node.computed && node.property)
                ? interpreter.getExpressionDisplayTokenId(node.property)
                : null;
            await interpreter.ui.animateRead(node.object.name, val, node.domIds, prop, sourceVarTokenId, sourceIndexTokenId, {
                onArrive: async () => {
                    const replacementTargetId = interpreter.getExpressionDisplayTokenId(node) || (node.domIds && node.domIds.length > 0 ? node.domIds[0] : null);
                    if (replacementTargetId) {
                        interpreter.ui.replaceTokenText(replacementTargetId, val, true);
                        interpreter.collapseExpressionTokens(node.domIds, replacementTargetId);
                    }
                    await interpreter.ui.wait(120);
                }
            });
            return val;
        }
        if (typeof obj === 'string' && prop === 'length' && node.object instanceof Identifier) {
            const len = obj.length;
            interpreter.setMemberPropertyHoverSnapshot(node, len);
            await interpreter.ui.animateRead(node.object.name, len, node.domIds, null, null, null, {
                onArrive: async () => {
                    const replacementTargetId = interpreter.getExpressionDisplayTokenId(node)
                        || (node.domIds && node.domIds.length > 0 ? node.domIds[0] : null);
                    if (!replacementTargetId) return;
                    interpreter.ui.replaceTokenText(replacementTargetId, len, true);
                    interpreter.collapseExpressionTokens(node.domIds, replacementTargetId);
                    await interpreter.ui.wait(120);
                }
            });
            return len;
        }
        if (typeof obj === 'string' && node.object instanceof Identifier) {
            const val = obj[prop];
            interpreter.setMemberPropertyHoverSnapshot(node, val);
            if (typeof val === 'function') return val.bind(obj);
            await interpreter.ui.animateRead(node.object.name, val, node.domIds);
            await interpreter.ui.animateOperationCollapse(node.domIds, val);
            await interpreter.ui.wait(800);
            return val;
        }
        if (isVirtualDomValue(obj)) {
            const domValue = obj[prop];
            interpreter.setMemberPropertyHoverSnapshot(node, domValue);
            if (typeof domValue === 'function') return domValue.bind(obj);
            if (node.domIds && node.domIds.length > 0) {
                if (typeof interpreter.ui.animateDomReadToToken === 'function') await interpreter.ui.animateDomReadToToken(obj, node.domIds[0], domValue, node.domIds, prop);
                else interpreter.ui.replaceTokenText(node.domIds[0], domValue, true);
                interpreter.collapseExpressionTokens(node.domIds, node.domIds[0]);
            }
            return domValue;
        }
        const genericValue = obj[prop];
        interpreter.setMemberPropertyHoverSnapshot(node, genericValue);
        return genericValue;
    }
    if (node instanceof UpdateExpr) {
        const name = node.arg.name;
        const currentVal = interpreter.currentScope.get(name).value;
        const isInc = node.op === '++';
        const newVal = isInc ? currentVal + 1 : currentVal - 1;
        const varTokenId = interpreter.getIdentifierTokenId(node.arg.domIds, name);
        await interpreter.ui.animateRead(name, currentVal, node.arg.domIds[0], null, varTokenId, null, {
            onArrive: async () => {
                interpreter.ui.replaceTokenText(node.arg.domIds[0], currentVal, true);
            }
        });
        if (node.prefix) {
            await interpreter.ui.animateOperationCollapse(node.domIds, newVal);
            await interpreter.ui.wait(800);
            interpreter.currentScope.assign(name, newVal);
            const sourceTokenId = interpreter.getExpressionDisplayTokenId(node) || node.domIds[0];
            interpreter.ui.replaceTokenText(sourceTokenId, newVal, true);
            await interpreter.ui.animateAssignment(name, newVal, sourceTokenId, null, varTokenId);
            await interpreter.ui.updateMemory(interpreter.scopeStack, name, 'write');
            return newVal;
        } else {
            await interpreter.ui.animateOperationCollapse(node.domIds, currentVal);
            await interpreter.ui.wait(800);
            interpreter.currentScope.assign(name, newVal);
            const sourceTokenId = interpreter.getExpressionDisplayTokenId(node) || node.domIds[0];
            interpreter.ui.replaceTokenText(sourceTokenId, newVal, true);
            await interpreter.ui.animateAssignment(name, newVal, sourceTokenId, null, varTokenId);
            await interpreter.ui.updateMemory(interpreter.scopeStack, name, 'write');
            return currentVal;
        }
    }
    if (node instanceof TernaryExpr) { const condition = await interpreter.evaluate(node.test); const result = condition ? await interpreter.evaluate(node.consequent) : await interpreter.evaluate(node.alternate); await interpreter.ui.animateOperationCollapse(node.domIds, result); await interpreter.ui.wait(800); return result; }
    if (node instanceof BinaryExpr) { const left = await interpreter.evaluate(node.left); if (node.op === '&&' && !left) { if (node.right instanceof Identifier) { try { const val = interpreter.currentScope.get(node.right.name).value; await interpreter.ui.visualizeIdentifier(node.right.name, val, node.right.domIds); } catch(e) { } } await interpreter.ui.animateOperationCollapse(node.domIds, false); await interpreter.ui.wait(800); return false; } if (node.op === '||' && left) { if (node.right instanceof Identifier) { try { const val = interpreter.currentScope.get(node.right.name).value; await interpreter.ui.visualizeIdentifier(node.right.name, val, node.right.domIds); } catch(e) { } } await interpreter.ui.animateOperationCollapse(node.domIds, true); await interpreter.ui.wait(800); return true; } const right = await interpreter.evaluate(node.right); let result; switch(node.op) { case '+': result = left + right; break; case '-': result = left - right; break; case '*': result = left * right; break; case '/': result = left / right; break; case '%': result = left % right; break; case '>': result = left > right; break; case '<': result = left < right; break; case '>=': result = left >= right; break; case '<=': result = left <= right; break; case '==': result = left == right; break; case '!=': result = left != right; break; case '===': result = left === right; break; case '!==': result = left !== right; break; case '&&': result = left && right; break; case '||': result = left || right; break; } await interpreter.ui.animateOperationCollapse(node.domIds, result); await interpreter.ui.wait(800); return result; }
    // Call handling is the most complex path: native hooks, built-ins, methods, and user functions.
    if (node instanceof CallExpr) {
        const suppressResultVisual = Boolean(options && options.suppressResultVisual) || Boolean(node.__suppressResultVisual);
        // Small helper: collapse an expression into a final visual value token.
        const showCollapseResult = async (result, waitMs = 800) => {
            if (suppressResultVisual) return;
            await interpreter.ui.animateOperationCollapse(node.domIds, result);
            if (waitMs > 0) await interpreter.ui.wait(waitMs);
        };
        // Small helper: replace a full call expression with its return value in-place.
        const showCallResultReplacement = async (result, waitMs = 800) => {
            if (suppressResultVisual) return;
            const callTargetTokenId = interpreter.getCallReplacementTokenId(node);
            node.resultTokenId = callTargetTokenId;
            interpreter.ui.replaceTokenText(callTargetTokenId, result, true);
            interpreter.collapseExpressionTokens(node.domIds, callTargetTokenId);
            if (waitMs > 0) await interpreter.ui.wait(waitMs);
        };
        const argValues = []; for (const arg of node.args) argValues.push(await interpreter.evaluate(arg)); await interpreter.ui.wait(800);
        if (node.callee instanceof Identifier) {
            let nativeBinding = null;
            try {
                nativeBinding = interpreter.currentScope.get(node.callee.name);
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
                arrVarTokenId = interpreter.getIdentifierTokenId(node.callee.object.domIds, arrName);
                const scopedVar = interpreter.currentScope.get(arrName);
                obj = scopedVar.value;
                if (isVirtualDomValue(obj)) {
                    domOwner = obj;
                    domOwnerName = arrName;
                }
            } else if (node.callee.object instanceof MemberExpr && !node.callee.object.computed && node.callee.object.property && node.callee.object.property.value === 'classList') {
                const ownerExpr = node.callee.object.object;
                if (ownerExpr instanceof Identifier) {
                    domOwnerName = ownerExpr.name;
                    const ownerScopedVar = interpreter.currentScope.get(domOwnerName);
                    domOwner = ownerScopedVar.value;
                } else {
                    domOwner = await interpreter.evaluate(ownerExpr);
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
                    const ownerScopedVar = interpreter.currentScope.get(domOwnerName);
                    domOwner = ownerScopedVar.value;
                } else {
                    domOwner = await interpreter.evaluate(ownerExpr);
                }
                if (domOwner && (typeof domOwner === 'object' || typeof domOwner === 'function')) {
                    obj = domOwner.style;
                    styleProxy = true;
                } else {
                    obj = undefined;
                }
            } else { obj = await interpreter.evaluate(node.callee.object); }
            if (Array.isArray(obj) && arrName) {
                const method = node.callee.property instanceof Identifier ? node.callee.property.name : node.callee.property.value; let result;
                if (method === 'push') { const newIndex = obj.length; for (let i = 0; i < argValues.length; i++) { const val = argValues[i]; const currentIdx = newIndex + i; obj[currentIdx] = undefined; await interpreter.ui.updateMemory(interpreter.scopeStack); if (node.args[i]) { await interpreter.ui.animateAssignment(arrName, val, node.args[i].domIds[0], currentIdx, arrVarTokenId); } obj[currentIdx] = val; await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'write', currentIdx); } result = obj.length; if (!suppressResultVisual) await interpreter.ui.animateReturnHeader(arrName, result, node.domIds); await showCollapseResult(result, 800); return result; } 
                else if (method === 'pop') { const lastIndex = obj.length - 1; const val = obj[lastIndex]; await interpreter.ui.animateRead(arrName, val, node.domIds, lastIndex, arrVarTokenId); await interpreter.ui.animateArrayPop(arrName, lastIndex); result = obj.pop(); await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'write'); await showCollapseResult(result, 800); return result; }
                else if (method === 'splice') { const start = argValues[0]; const count = argValues[1] || 0; const removedItems = obj.slice(start, start + count); if (removedItems.length > 0) { const indicesToHighlight = []; for(let i=0; i<count; i++) indicesToHighlight.push(start + i); await interpreter.ui.highlightArrayElements(arrName, indicesToHighlight, 'delete'); await interpreter.ui.wait(500); await interpreter.ui.animateSpliceRead(arrName, removedItems, node.domIds, start); } result = obj.splice(...argValues); await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'write'); await showCollapseResult(result, 800); return result; }
                else if (method === 'slice') { const start = argValues.length > 0 ? argValues[0] : 0; const normalizedStart = typeof start === 'number' && start < 0 ? Math.max(obj.length + start, 0) : (start || 0); result = obj.slice(...argValues); if (result.length > 0) { await interpreter.ui.animateSpliceRead(arrName, result, node.domIds, normalizedStart); } await showCollapseResult(result, 800); return result; }
                if (method === 'shift') {
                    if (obj.length === 0) {
                        result = undefined;
                    } else {
                        const originalLength = obj.length;
                        const firstVal = obj[0];
                        await interpreter.ui.animateRead(arrName, firstVal, node.domIds, 0, arrVarTokenId);
                        for (let index = 1; index < originalLength; index++) {
                            obj[index - 1] = obj[index];
                            await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'none', index - 1, false);
                        }
                        obj[originalLength - 1] = undefined;
                        await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'none', originalLength - 1, false);
                        await interpreter.ui.animateArrayPop(arrName, originalLength - 1);
                        obj.pop();
                        result = firstVal;
                        await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'write');
                    }
                    await showCollapseResult(result, 800);
                    return result;
                }
                if (method === 'unshift') {
                    const insertCount = argValues.length;
                    if (insertCount > 0) {
                        const originalLength = obj.length;
                        for (let i = 0; i < insertCount; i++) obj.push(undefined);
                        await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'none', originalLength, false);
                        await interpreter.ui.wait(90);
                        for (let index = originalLength - 1; index >= 0; index--) {
                            obj[index + insertCount] = obj[index];
                            await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'none', index + insertCount, false);
                        }
                        for (let index = 0; index < insertCount; index++) {
                            obj[index] = undefined;
                        }
                        await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'none', 0, false);
                        for (let index = 0; index < insertCount; index++) {
                            const sourceTokenId = (node.args[index] && node.args[index].domIds) ? interpreter.getExpressionDisplayTokenId(node.args[index]) : null;
                            if (sourceTokenId) await interpreter.ui.animateAssignment(arrName, argValues[index], sourceTokenId, index, arrVarTokenId);
                            obj[index] = argValues[index];
                            await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'write', index, false);
                        }
                    }
                    result = obj.length;
                    if (!suppressResultVisual) await interpreter.ui.animateReturnHeader(arrName, result, node.domIds);
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
                        const sourceTokenId = node.args.length > 0 && node.args[0].domIds ? interpreter.getExpressionDisplayTokenId(node.args[0]) : null;
                        const payload = argValues.length > 0 ? argValues.join(' ') : '';
                        const domNodeVisible = interpreter.isDomNodeVisible(domOwner);
                        if (!domNodeVisible && domOwnerName && domOwnerName !== 'document') {
                            await interpreter.ui.updateMemory(interpreter.scopeStack, domOwnerName, 'read');
                            await interpreter.ui.wait(220);
                        }
                        if (!domNodeVisible) {
                            result = obj[method](...argValues);
                            if (domOwnerName && domOwnerName !== 'document') {
                                await interpreter.ui.animateAssignment(domOwnerName, domOwner, sourceTokenId);
                            }
                        } else {
                            if (typeof interpreter.ui.animateDomPropertyMutation === 'function') {
                                await interpreter.ui.animateDomPropertyMutation({
                                    targetNode: domOwner,
                                    sourceTokenId,
                                    payload,
                                    property: 'class',
                                    applyMutation: async () => { result = obj[method](...argValues); }
                                });
                            } else {
                                result = obj[method](...argValues);
                                interpreter.refreshDomView();
                                if (typeof interpreter.ui.animateDomMutation === 'function') await interpreter.ui.animateDomMutation(domOwner, sourceTokenId, payload);
                            }
                        }
                        interpreter.refreshDomView();
                        if (domOwnerName && domOwnerName !== 'document') {
                            await interpreter.ui.updateMemory(interpreter.scopeStack, domOwnerName, 'write', null, !domNodeVisible);
                        }
                        await showCallResultReplacement(result, 800);
                        return result;
                    }
                    if (styleProxy && domOwner && (method === 'addProperty' || method === 'setProperty' || method === 'removeProperty')) {
                        let result;
                        const sourceTokenId = (method === 'removeProperty')
                            ? (node.args.length > 0 && node.args[0].domIds ? interpreter.getExpressionDisplayTokenId(node.args[0]) : null)
                            : ((node.args.length > 1 && node.args[1].domIds)
                                ? interpreter.getExpressionDisplayTokenId(node.args[1])
                                : (node.args.length > 0 && node.args[0].domIds ? interpreter.getExpressionDisplayTokenId(node.args[0]) : null));
                        const payload = (method === 'removeProperty')
                            ? (argValues.length > 0 ? argValues[0] : '')
                            : (argValues.length > 1 ? argValues[1] : '');
                        const domNodeVisible = interpreter.isDomNodeVisible(domOwner);
                        if (!domNodeVisible && domOwnerName && domOwnerName !== 'document') {
                            await interpreter.ui.updateMemory(interpreter.scopeStack, domOwnerName, 'read');
                            await interpreter.ui.wait(220);
                        }
                        if (!domNodeVisible) {
                            result = obj[method](...argValues);
                            if (domOwnerName && domOwnerName !== 'document') {
                                await interpreter.ui.animateAssignment(domOwnerName, domOwner, sourceTokenId);
                            }
                        } else {
                            if (typeof interpreter.ui.animateDomPropertyMutation === 'function') {
                                await interpreter.ui.animateDomPropertyMutation({
                                    targetNode: domOwner,
                                    sourceTokenId,
                                    payload,
                                    property: 'style',
                                    applyMutation: async () => { result = obj[method](...argValues); }
                                });
                            } else {
                                result = obj[method](...argValues);
                                interpreter.refreshDomView();
                                if (typeof interpreter.ui.animateDomMutation === 'function') await interpreter.ui.animateDomMutation(domOwner, sourceTokenId, payload);
                            }
                        }
                        interpreter.refreshDomView();
                        if (domOwnerName && domOwnerName !== 'document') {
                            await interpreter.ui.updateMemory(interpreter.scopeStack, domOwnerName, 'write', null, !domNodeVisible);
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
                                const root = interpreter.domDocument && interpreter.domDocument.body ? interpreter.domDocument.body : null;
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
                                await interpreter.invokeDomClick(path || '0');
                            }
                            return undefined;
                        }
                        if (method === 'appendChild') {
                            const sourceTokenId = node.args.length > 0 && node.args[0].domIds ? interpreter.getExpressionDisplayTokenId(node.args[0]) : null;
                            const domNodeVisible = interpreter.isDomNodeVisible(obj);
                            if (!domNodeVisible && typeof interpreter.ui.animateDetachedDomAppendMutation === 'function') {
                                await interpreter.ui.animateDetachedDomAppendMutation({
                                    parentNode: obj,
                                    childNode: argValues[0],
                                    sourceTokenId,
                                    applyMutation: async () => { result = obj[method](...argValues); }
                                });
                            } else if (typeof interpreter.ui.animateDomAppendMutation === 'function') {
                                await interpreter.ui.animateDomAppendMutation({
                                    parentNode: obj,
                                    childNode: argValues[0],
                                    sourceTokenId,
                                    applyMutation: async () => { result = obj[method](...argValues); }
                                });
                            } else {
                                result = obj[method](...argValues);
                                interpreter.refreshDomView();
                                if (typeof interpreter.ui.animateDomMutation === 'function') await interpreter.ui.animateDomMutation(obj, sourceTokenId, argValues[0]);
                            }
                            interpreter.refreshDomView();
                            await showCallResultReplacement(result, 800);
                            return result;
                        }
                        if (method === 'removeChild') {
                            const sourceTokenId = node.args.length > 0 && node.args[0].domIds ? interpreter.getExpressionDisplayTokenId(node.args[0]) : null;
                            const domNodeVisible = interpreter.isDomNodeVisible(obj);
                            if (!domNodeVisible && typeof interpreter.ui.animateDetachedDomRemoveMutation === 'function') {
                                await interpreter.ui.animateDetachedDomRemoveMutation({
                                    parentNode: obj,
                                    removedNode: argValues[0],
                                    sourceTokenId,
                                    applyMutation: async () => { result = obj[method](...argValues); }
                                });
                            } else if (typeof interpreter.ui.animateDomRemoveMutation === 'function') {
                                await interpreter.ui.animateDomRemoveMutation({
                                    parentNode: obj,
                                    removedNode: argValues[0],
                                    sourceTokenId,
                                    applyMutation: async () => { result = obj[method](...argValues); }
                                });
                            } else {
                                result = obj[method](...argValues);
                                interpreter.refreshDomView();
                                if (typeof interpreter.ui.animateDomMutation === 'function') await interpreter.ui.animateDomMutation(obj, sourceTokenId, argValues[0]);
                            }
                            interpreter.refreshDomView();
                            await showCallResultReplacement(result, 800);
                            return result;
                        }
                        if (['getElementById', 'querySelector'].includes(method)) {
                            result = obj[method](...argValues);
                            if (result && !suppressResultVisual) {
                                const callTargetTokenId = interpreter.getCallReplacementTokenId(node);
                                node.resultTokenId = callTargetTokenId;
                                if (typeof interpreter.ui.animateDomReadToToken === 'function') await interpreter.ui.animateDomReadToToken(result, callTargetTokenId, result, node.domIds);
                                else interpreter.ui.replaceTokenText(callTargetTokenId, result, true);
                                interpreter.collapseExpressionTokens(node.domIds, callTargetTokenId);
                            }
                            return result;
                        }
                        if (method === 'getAttribute') {
                            result = obj[method](...argValues);
                            const attrName = (argValues.length > 0) ? String(argValues[0]) : '';
                            if (!suppressResultVisual) {
                                const callTargetTokenId = interpreter.getCallReplacementTokenId(node);
                                node.resultTokenId = callTargetTokenId;
                                if (typeof interpreter.ui.animateDomReadToToken === 'function') await interpreter.ui.animateDomReadToToken(obj, callTargetTokenId, result, node.domIds, attrName);
                                else interpreter.ui.replaceTokenText(callTargetTokenId, result, true);
                                interpreter.collapseExpressionTokens(node.domIds, callTargetTokenId);
                            }
                            return result;
                        }
                        if (method === 'setAttribute') {
                            const attrName = (argValues.length > 0) ? String(argValues[0]) : '';
                            const attrValue = (argValues.length > 1) ? argValues[1] : '';
                            const sourceTokenId = (node.args.length > 1 && node.args[1].domIds)
                                ? interpreter.getExpressionDisplayTokenId(node.args[1])
                                : ((node.args.length > 0 && node.args[0].domIds) ? interpreter.getExpressionDisplayTokenId(node.args[0]) : null);
                            const domNodeVisible = interpreter.isDomNodeVisible(obj);
                            if (!domNodeVisible && arrName && arrName !== 'document') {
                                await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'read');
                                await interpreter.ui.wait(220);
                            }
                            if (!domNodeVisible) {
                                result = obj[method](...argValues);
                                if (arrName && arrName !== 'document') {
                                    await interpreter.ui.animateAssignment(arrName, obj, sourceTokenId);
                                }
                            } else {
                                if (typeof interpreter.ui.animateDomPropertyMutation === 'function') {
                                    await interpreter.ui.animateDomPropertyMutation({
                                        targetNode: obj,
                                        sourceTokenId,
                                        payload: attrValue,
                                        property: attrName,
                                        applyMutation: async () => { result = obj[method](...argValues); }
                                    });
                                } else {
                                    result = obj[method](...argValues);
                                    interpreter.refreshDomView();
                                    if (typeof interpreter.ui.animateDomMutation === 'function') await interpreter.ui.animateDomMutation(obj, sourceTokenId, attrValue);
                                }
                            }
                            interpreter.refreshDomView();
                            if (arrName && arrName !== 'document') {
                                await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'write', null, !domNodeVisible);
                            }
                            await showCallResultReplacement(result, 800);
                            return result;
                        }
                        if (method === 'removeAttribute') {
                            const attrName = (argValues.length > 0) ? String(argValues[0]) : '';
                            const sourceTokenId = (node.args.length > 0 && node.args[0].domIds)
                                ? interpreter.getExpressionDisplayTokenId(node.args[0])
                                : null;
                            const domNodeVisible = interpreter.isDomNodeVisible(obj);
                            if (!domNodeVisible && arrName && arrName !== 'document') {
                                await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'read');
                                await interpreter.ui.wait(220);
                            }
                            if (!domNodeVisible) {
                                result = obj[method](...argValues);
                                if (arrName && arrName !== 'document') {
                                    await interpreter.ui.animateAssignment(arrName, obj, sourceTokenId);
                                }
                            } else {
                                if (typeof interpreter.ui.animateDomPropertyMutation === 'function') {
                                    await interpreter.ui.animateDomPropertyMutation({
                                        targetNode: obj,
                                        sourceTokenId,
                                        payload: '',
                                        property: attrName,
                                        applyMutation: async () => { result = obj[method](...argValues); }
                                    });
                                } else {
                                    result = obj[method](...argValues);
                                    interpreter.refreshDomView();
                                    if (typeof interpreter.ui.animateDomMutation === 'function') await interpreter.ui.animateDomMutation(obj, sourceTokenId, attrName);
                                }
                            }
                            interpreter.refreshDomView();
                            if (arrName && arrName !== 'document') {
                                await interpreter.ui.updateMemory(interpreter.scopeStack, arrName, 'write', null, !domNodeVisible);
                            }
                            await showCallResultReplacement(result, 800);
                            return result;
                        }
                        if (method === 'createElement') {
                            result = obj[method](...argValues);
                            const tokenEls = (node.domIds || []).map((id) => document.getElementById(id)).filter(Boolean);
                            if (!suppressResultVisual) {
                                const callTargetTokenId = interpreter.getCallReplacementTokenId(node);
                                node.resultTokenId = callTargetTokenId;
                                if (tokenEls.length > 0 && typeof interpreter.ui.setFlowHighlight === 'function') interpreter.ui.setFlowHighlight(tokenEls, true);
                                await interpreter.ui.wait(180);
                                interpreter.ui.replaceTokenText(callTargetTokenId, result, true);
                                await interpreter.ui.wait(180);
                                if (tokenEls.length > 0 && typeof interpreter.ui.setFlowHighlight === 'function') interpreter.ui.setFlowHighlight(tokenEls, false);
                                interpreter.collapseExpressionTokens(node.domIds, callTargetTokenId);
                                await interpreter.ui.wait(220);
                            }
                            return result;
                        }
                        result = obj[method](...argValues);
                        interpreter.refreshDomView();
                        if (typeof interpreter.ui.animateDomMutation === 'function') await interpreter.ui.animateDomMutation(obj, null, result);
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
            await interpreter.ui.highlightLines([node.line]); // Redundant highlight fix
            await interpreter.ui.consoleLog(argValues); 
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
        if (node.callee instanceof MemberExpr) { const objVal = await interpreter.evaluate(node.callee.object); const propName = node.callee.property instanceof Identifier ? node.callee.property.name : node.callee.property.value; if (propName === 'toFixed' && typeof objVal === 'number') { const digits = argValues.length > 0 ? argValues[0] : 0; const res = objVal.toFixed(digits); await showCollapseResult(`"${res}"`, 800); return res; } }
        let funcNode; let closureScope = interpreter.globalScope; let paramNames = []; let funcName = "anonymous"; let paramIds = []; let calleeDisplayName = null;
        if (node.callee instanceof Identifier) {
            funcName = node.callee.name;
            let val = null;
            try {
                val = interpreter.currentScope.get(node.callee.name);
            } catch(e) {
                const rawMessage = (e && e.message) ? String(e.message) : '';
                if (!rawMessage.includes('non définie')) throw e;
            }
            if (val && val.value && (val.value.type === 'arrow_func' || val.value.type === 'function_expr' || val.value.type === 'function_decl_ref')) {
                if (val.value.type === 'function_decl_ref') {
                    funcNode = val.value.node;
                    closureScope = val.value.scope || interpreter.globalScope;
                    paramNames = funcNode.params.map(p => p.name);
                    paramIds = funcNode.params.map(p => p.id);
                } else {
                    funcNode = val.value;
                    closureScope = val.value.scope;
                    paramNames = val.value.params;
                    paramIds = val.value.paramIds || [];
                }
                if (val.functionAlias) calleeDisplayName = val.functionAlias;
            } else if (interpreter.functions[node.callee.name]) {
                funcNode = interpreter.functions[node.callee.name];
                paramNames = funcNode.params.map(p => p.name);
                paramIds = funcNode.params.map(p => p.id);
            } else {
                throw new ReferenceError(`${node.callee.name} is not defined`);
            }
        }
        if (funcNode) {
            if (calleeDisplayName && node.callee && node.callee.domIds && node.callee.domIds.length > 0) {
                await interpreter.ui.animateRead(node.callee.name, calleeDisplayName, node.callee.domIds[0], null, node.callee.domIds[0], null, {
                    onArrive: async () => {
                        interpreter.ui.setRawTokenText(node.callee.domIds[0], calleeDisplayName, true);
                        await interpreter.ui.wait(180);
                    }
                });
            }
            const displayFuncName = calleeDisplayName || funcName;
            const fnScope = new Scope(`${displayFuncName}(${paramNames.join(', ')})`, closureScope, interpreter.currentScope);
            interpreter.scopeStack.push(fnScope);
            const prevScope = interpreter.currentScope;
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
                        await interpreter.ui.animateParamPass(argVisualValue, argNode.domIds[0], paramIds[i]);
                    }
                    fnScope.define(pName, 'let');
                    fnScope.initialize(pName, argValue);
                    if (paramIds[i]) {
                        const aliasName = isFunctionIdentifierArg ? argNode.name : null;
                        interpreter.setVariableFunctionAlias(pName, aliasName, fnScope);
                        if (isFunctionIdentifierArg) interpreter.ui.setRawTokenText(paramIds[i], argNode.name, false);
                        else interpreter.ui.replaceTokenText(paramIds[i], argValue, false);
                    } else {
                        interpreter.setVariableFunctionAlias(pName, null, fnScope);
                    }
                    await interpreter.ui.updateMemory(interpreter.scopeStack, pName, 'declare');
                }
                await interpreter.ui.wait(600);
                interpreter.currentScope = fnScope;
                await interpreter.ui.updateMemory(interpreter.scopeStack);
                for (let i=0; i<paramIds.length; i++) {
                    if (paramIds[i]) interpreter.ui.resetTokenText(paramIds[i]);
                }
                interpreter.ui.lockTokens(node.domIds || []);
                tokensLocked = true;
                interpreter.callStack.push(node.line);
                callFramePushed = true;
                let result = undefined;
                let returnSourceId = null;
                const body = funcNode.body;
                if (body instanceof BlockStmt) {
                    const blockResult = await interpreter.executeBlock(body.body);
                    if (blockResult && blockResult.__isReturn) {
                        result = blockResult.value;
                        returnSourceId = blockResult.sourceId || null;
                    }
                } else {
                    await interpreter.pause(node.line);
                    result = await interpreter.evaluate(body);
                    returnSourceId = body.domIds ? body.domIds[0] : null;
                }
                if (!suppressResultVisual && result !== undefined) {
                    if(returnSourceId) await interpreter.ui.animateReturnToCall(node.domIds, result, returnSourceId);
                    else await interpreter.ui.animateReturnToCall(node.domIds, result);
                    await interpreter.ui.wait(800);
                }
                return result;
            } catch (runtimeError) {
                if (!runtimeError || !Array.isArray(runtimeError.__pedagogicalStack) || runtimeError.__pedagogicalStack.length === 0) {
                    if (runtimeError && typeof runtimeError === 'object') runtimeError.__pedagogicalStack = interpreter.buildPedagogicalStack(interpreter.lastPausedLine);
                }
                throw runtimeError;
            } finally {
                if (callFramePushed) interpreter.callStack.pop();
                if (tokensLocked) interpreter.ui.unlockTokens(node.domIds || []);
                interpreter.currentScope = prevScope;
                const scopeIndex = interpreter.scopeStack.lastIndexOf(fnScope);
                if (scopeIndex !== -1) interpreter.scopeStack.splice(scopeIndex, 1);
                await interpreter.ui.updateMemory(interpreter.scopeStack);
                for (let i=0; i<paramIds.length; i++) {
                    if (paramIds[i]) interpreter.ui.resetTokenText(paramIds[i]);
                }
            }
        }
    }
}
