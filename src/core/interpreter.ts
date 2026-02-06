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
    ReturnStmt,
} from './language';
import { Scope } from './scope';

export class Interpreter {
    constructor(ui) {
        this.ui = ui;
        this.globalScope = new Scope("Global");
        this.currentScope = this.globalScope;
        this.functions = {};
        this.callStack = []; 
        this.scopeStack = [this.globalScope];
        this.shouldStop = false;
        this.resolveNext = null;
    }

    async start(code) { 
        this.shouldStop = false; 
        this.callStack = []; 
        this.scopeStack = [this.globalScope]; 
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
        } catch (e) { 
            if (e.message !== "STOP") { 
                this.ui.log("Erreur: " + e.message, "error"); 
                console.error(e); 
            } else { 
                this.ui.log("--- Arrêt ---", "info"); 
            } 
            this.ui.setRunningState(false); 
            this.ui.resetDisplay(); 
        }
    }
    
    async invokeEvent(funcName) {
        if (this.shouldStop) return;
        
        // Désactiver les contrôles
        document.getElementById('btn-trigger').disabled = true;
        document.getElementById('btn-set-event').disabled = true;

        // Simuler un noeud d'appel
        const dummyId = new Identifier(funcName, 0);
        dummyId.domIds = []; // Pas de DOM pour l'événement externe
        const callNode = new CallExpr(dummyId, [], 0);
        callNode.domIds = []; 
        
        try {
            this.ui.log(`> Événement: ${funcName}()`, "info");
            await this.evaluate(callNode);
        } catch (e) {
            this.ui.log(`Erreur événement: ${e.message}`, "error");
        } finally {
            this.ui.highlightLines([]); 
            this.ui.resetVisuals();
            // Réactiver les contrôles si on n'a pas stoppé
            if (!this.shouldStop) {
                document.getElementById('btn-trigger').disabled = false;
                document.getElementById('btn-set-event').disabled = false;
            }
        }
    }

    async nextStep() { if (this.resolveNext) { const r = this.resolveNext; this.resolveNext = null; r(); } }
    stop() { this.shouldStop = true; if (this.resolveNext) this.resolveNext(); }
    async pause(line) { if (this.shouldStop) throw new Error("STOP"); this.ui.skipMode = false; this.ui.setStepButtonState(false); this.ui.resetVisuals(); const activeLines = [...this.callStack, line]; this.ui.highlightLines(activeLines); await this.ui.updateMemory(this.scopeStack); this.ui.setStepButtonState(true); await new Promise(r => { this.resolveNext = r; }); this.ui.setStepButtonState(false); if (this.shouldStop) throw new Error("STOP"); }
    async executeBlock(stmts) { for (const s of stmts) { const res = await this.execute(s); if (res === 'BREAK') return 'BREAK'; if (res && res.__isReturn) return res; } }

    async execute(node) {
        if (this.shouldStop) return;
        if (node instanceof BlockStmt) { const blockScope = new Scope("Block", this.currentScope, this.currentScope); this.scopeStack.push(blockScope); const prevScope = this.currentScope; this.currentScope = blockScope; let result; try { result = await this.executeBlock(node.body); } finally { this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); } return result; }
        if (node instanceof MultiVarDecl) { for (const decl of node.decls) { await this.execute(decl); } return; }
        if (node instanceof VarDecl) { await this.pause(node.line); this.currentScope.define(node.name, node.kind); await this.ui.updateMemory(this.scopeStack, node.name, 'declare'); await this.ui.wait(600); if (node.init) { if (node.init instanceof ArrayLiteral) { const arr = new Array(node.init.elements.length).fill(undefined); this.currentScope.initialize(node.name, arr); await this.ui.updateMemory(this.scopeStack, node.name, 'write'); for(let i=0; i<node.init.elements.length; i++) { const val = await this.evaluate(node.init.elements[i]); arr[i] = val; await this.ui.animateAssignment(node.name, val, node.init.elements[i].domIds[0], i); await this.ui.updateMemory(this.scopeStack, node.name, 'write', i); } } else if (node.init instanceof ArrowFunctionExpr) { const func = { type: 'arrow_func', params: node.init.params.map(p=>p.name), body: node.init.body, scope: this.currentScope, paramIds: node.init.params.map(p=>p.id) }; this.currentScope.initialize(node.name, func); await this.ui.updateMemory(this.scopeStack, node.name, 'write'); } else if (node.init instanceof FunctionExpression) { const func = await this.evaluate(node.init); this.currentScope.initialize(node.name, func); await this.ui.updateMemory(this.scopeStack, node.name, 'write'); } else { const val = await this.evaluate(node.init); this.currentScope.initialize(node.name, val); await this.ui.animateAssignment(node.name, val, node.init.domIds[0]); await this.ui.updateMemory(this.scopeStack, node.name, 'write'); } } }
        else if (node instanceof Assignment) { await this.pause(node.line); let val; if (node.value instanceof ArrowFunctionExpr) { val = { type: 'arrow_func', params: node.value.params.map(p=>p.name), body: node.value.body, scope: this.currentScope, paramIds: node.value.params.map(p=>p.id) }; } else { val = await this.evaluate(node.value); } if (node.left instanceof Identifier) { this.currentScope.assign(node.left.name, val); if (typeof val !== 'object' || (val.type !== 'arrow_func' && val.type !== 'function_expr')) { await this.ui.animateAssignment(node.left.name, val, node.value.domIds[0]); } await this.ui.updateMemory(this.scopeStack, node.left.name, 'write'); } else if (node.left instanceof MemberExpr) { let obj; let targetName = null; if (node.left.object instanceof Identifier) { targetName = node.left.object.name; const scopedVar = this.currentScope.get(targetName); obj = scopedVar.value; } else { obj = await this.evaluate(node.left.object); } const prop = node.left.computed ? await this.evaluate(node.left.property) : node.left.property.value; if (Array.isArray(obj)) { obj[prop] = val; if (targetName) { await this.ui.animateAssignment(targetName, val, node.value.domIds[0], prop); await this.ui.updateMemory(this.scopeStack, targetName, 'write', prop); } } } }
        else if (node instanceof CallExpr) { await this.pause(node.line); await this.evaluate(node); }
        else if (node instanceof UpdateExpr) { await this.pause(node.line); await this.evaluate(node); }
        else if (node instanceof IfStmt) { await this.pause(node.line); const test = await this.evaluate(node.test); this.ui.lockTokens(node.test.domIds||[]); let res; try { if (test) { if (node.consequent instanceof BlockStmt) res = await this.executeBlock(node.consequent.body); else res = await this.execute(node.consequent); } else if (node.alternate) { if (node.alternate instanceof BlockStmt) res = await this.executeBlock(node.alternate.body); else res = await this.execute(node.alternate); } } finally { this.ui.unlockTokens(node.test.domIds||[]); } if (res) return res; }
        else if (node instanceof WhileStmt) { while(true) { await this.pause(node.line); const test = await this.evaluate(node.test); this.ui.lockTokens(node.test.domIds||[]); if(!test) { this.ui.unlockTokens(node.test.domIds||[]); break; } const loopScope = new Scope("Loop", this.currentScope, this.currentScope); this.scopeStack.push(loopScope); const prevScope = this.currentScope; this.currentScope = loopScope; try { const res = (node.body instanceof BlockStmt) ? await this.executeBlock(node.body.body) : await this.execute(node.body); if(res==='BREAK') { this.ui.unlockTokens(node.test.domIds||[]); break; } if(res&&res.__isReturn) return res; } finally { this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); } this.ui.unlockTokens(node.test.domIds||[]); } }
        else if (node instanceof DoWhileStmt) { do { const loopScope = new Scope("Loop", this.currentScope, this.currentScope); this.scopeStack.push(loopScope); const prevScope = this.currentScope; this.currentScope = loopScope; try { const res = (node.body instanceof BlockStmt) ? await this.executeBlock(node.body.body) : await this.execute(node.body); if(res==='BREAK') { this.ui.unlockTokens(node.test.domIds||[]); break; } if(res&&res.__isReturn) return res; } finally { this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); } await this.pause(node.line); const test = await this.evaluate(node.test); this.ui.lockTokens(node.test.domIds||[]); if(!test) { this.ui.unlockTokens(node.test.domIds||[]); break; } this.ui.unlockTokens(node.test.domIds||[]); } while(true); }
        else if (node instanceof ForStmt) { const loopScope = new Scope("Loop", this.currentScope, this.currentScope); this.scopeStack.push(loopScope); const prevScope = this.currentScope; this.currentScope = loopScope; try { if(node.init) { if(node.init instanceof VarDecl || node.init instanceof BlockStmt || node.init instanceof MultiVarDecl) await this.execute(node.init); else { await this.pause(node.init.line); await this.evaluate(node.init); } } while(true) { if(node.test) { await this.pause(node.line); const test = await this.evaluate(node.test); this.ui.lockTokens(node.test.domIds||[]); if(!test) { this.ui.unlockTokens(node.test.domIds||[]); break; } } if (node.body instanceof BlockStmt) { for (const stmt of node.body.body) { const res = await this.execute(stmt); if (res === 'BREAK') { if(node.test) this.ui.unlockTokens(node.test.domIds||[]); break; } if (res && res.__isReturn) return res; } } else { const res = await this.execute(node.body); if(res==='BREAK') { if(node.test) this.ui.unlockTokens(node.test.domIds||[]); break; } if(res&&res.__isReturn) return res; } if(node.update) { await this.pause(node.line); await this.evaluate(node.update); } if(node.test) this.ui.unlockTokens(node.test.domIds||[]); } } finally { this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); } }
        else if (node instanceof SwitchStmt) { await this.pause(node.line); const disc = await this.evaluate(node.discriminant); let start=-1; let def=-1; for(let i=0;i<node.cases.length;i++){ const c=node.cases[i]; if(c.test){ await this.pause(c.line); const tv=await this.evaluate(c.test); const v1=JSON.stringify(formatValue(disc)); const v2=JSON.stringify(formatValue(tv)); const compStr=`${v1} === ${v2}`; if(c.test.domIds.length>0){ this.ui.setRawTokenText(c.test.domIds[0], compStr, true); for(let k=1;k<c.test.domIds.length;k++){ const el=document.getElementById(c.test.domIds[k]); if(el){ if(!this.ui.modifiedTokens.has(c.test.domIds[k])) this.ui.modifiedTokens.set(c.test.domIds[k], {original:el.innerText, transient:true}); el.style.display='none'; } } } await this.ui.wait(800); const isMatch=(tv===disc); await this.ui.animateOperationCollapse(c.test.domIds, isMatch); await this.ui.wait(800); if(isMatch){ start=i; break; } } else { def=i; } } if(start===-1) start=def; if(start!==-1){ for(let i=start; i<node.cases.length; i++){ const c=node.cases[i]; for(const s of c.consequent){ const res=await this.execute(s); if(res==='BREAK') return; if(res&&res.__isReturn) return res; } } } }
        else if (node instanceof BreakStmt) { await this.pause(node.line); return 'BREAK'; }
        else if (node instanceof FunctionDecl) { await this.pause(node.line); this.functions[node.name] = node; }
    }

    async evaluate(node) {
        if (node instanceof Literal) return node.value;
        if (node instanceof UnaryExpr) { const arg = await this.evaluate(node.arg); let res; if (node.op === '!') res = !arg; else if (node.op === '-') res = -arg; else if (node.op === '+') res = +arg; await this.ui.animateOperationCollapse(node.domIds, res); await this.ui.wait(800); return res; }
        if (node instanceof FunctionExpression) { return { type: 'function_expr', name: node.name || 'anonymous', params: node.params.map(p => p.name), paramIds: node.params.map(p => p.id), body: node.body, scope: this.currentScope }; }
        if (node instanceof ArrayLiteral) { const elements = []; for (const el of node.elements) { elements.push(await this.evaluate(el)); } return elements; }
        if (node instanceof NewExpr) { if (node.callee instanceof Identifier && node.callee.name === 'Array') { const args = []; for(const arg of node.args) args.push(await this.evaluate(arg)); if(args.length === 1 && typeof args[0] === 'number') { return new Array(args[0]).fill(undefined); } return new Array(...args); } }
        if (node instanceof ArgumentsNode) { let result; for(const arg of node.args) { result = await this.evaluate(arg); } return result; }
        if (node instanceof Identifier) { const variable = this.currentScope.get(node.name); if (variable.value && variable.value.type === 'arrow_func') return variable.value; if (variable.value && variable.value.type === 'function_expr') return variable.value; await this.ui.animateRead(node.name, variable.value, node.domIds[0]); this.ui.replaceTokenText(node.domIds[0], variable.value, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return variable.value; }
        if (node instanceof MemberExpr) { let obj; if (node.object instanceof Identifier) { const varName = node.object.name; const scopedVar = this.currentScope.get(varName); obj = scopedVar.value; } else { obj = await this.evaluate(node.object); } const prop = node.computed ? await this.evaluate(node.property) : node.property.value; if (Array.isArray(obj) && prop === 'length' && node.object instanceof Identifier) { await this.ui.animateReadHeader(node.object.name, obj.length, node.domIds[0]); this.ui.replaceTokenText(node.domIds[0], obj.length, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return obj.length; } if (Array.isArray(obj) && node.object instanceof Identifier) { const val = obj[prop]; await this.ui.animateRead(node.object.name, val, node.domIds[0], prop); this.ui.replaceTokenText(node.domIds[0], val, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return val; } return obj[prop]; }
        if (node instanceof UpdateExpr) { const name = node.arg.name; const currentVal = this.currentScope.get(name).value; const isInc = node.op === '++'; const newVal = isInc ? currentVal + 1 : currentVal - 1; await this.ui.animateRead(name, currentVal, node.arg.domIds[0]); if (node.prefix) { await this.ui.animateOperationCollapse(node.domIds, newVal); await this.ui.wait(800); this.currentScope.assign(name, newVal); await this.ui.animateAssignment(name, newVal, node.domIds[0]); await this.ui.updateMemory(this.scopeStack, name, 'write'); return newVal; } else { await this.ui.animateOperationCollapse(node.domIds, currentVal); await this.ui.wait(800); this.currentScope.assign(name, newVal); await this.ui.animateAssignment(name, newVal, node.domIds[0]); await this.ui.updateMemory(this.scopeStack, name, 'write'); return currentVal; } }
        if (node instanceof BinaryExpr) { const left = await this.evaluate(node.left); if (node.op === '&&' && !left) { if (node.right instanceof Identifier) { try { const val = this.currentScope.get(node.right.name).value; await this.ui.visualizeIdentifier(node.right.name, val, node.right.domIds); } catch(e) { } } await this.ui.animateOperationCollapse(node.domIds, false); await this.ui.wait(800); return false; } if (node.op === '||' && left) { if (node.right instanceof Identifier) { try { const val = this.currentScope.get(node.right.name).value; await this.ui.visualizeIdentifier(node.right.name, val, node.right.domIds); } catch(e) { } } await this.ui.animateOperationCollapse(node.domIds, true); await this.ui.wait(800); return true; } const right = await this.evaluate(node.right); let result; switch(node.op) { case '+': result = left + right; break; case '-': result = left - right; break; case '*': result = left * right; break; case '/': result = left / right; break; case '%': result = left % right; break; case '>': result = left > right; break; case '<': result = left < right; break; case '>=': result = left >= right; break; case '<=': result = left <= right; break; case '==': result = left == right; break; case '!=': result = left != right; break; case '===': result = left === right; break; case '!==': result = left !== right; break; case '&&': result = left && right; break; case '||': result = left || right; break; } await this.ui.animateOperationCollapse(node.domIds, result); await this.ui.wait(800); return result; }
        if (node instanceof CallExpr) {
            const argValues = []; for (const arg of node.args) argValues.push(await this.evaluate(arg)); await this.ui.wait(800);
            if (node.callee instanceof MemberExpr) {
                let obj; let arrName = null;
                if (node.callee.object instanceof Identifier) { arrName = node.callee.object.name; const scopedVar = this.currentScope.get(arrName); obj = scopedVar.value; } else { obj = await this.evaluate(node.callee.object); }
                if (Array.isArray(obj) && arrName) {
                    const method = node.callee.property instanceof Identifier ? node.callee.property.name : node.callee.property.value; let result;
                    if (method === 'push') { const newIndex = obj.length; for (let i = 0; i < argValues.length; i++) { const val = argValues[i]; const currentIdx = newIndex + i; obj[currentIdx] = undefined; await this.ui.updateMemory(this.scopeStack); if (node.args[i]) { await this.ui.animateAssignment(arrName, val, node.args[i].domIds[0], currentIdx); } obj[currentIdx] = val; await this.ui.updateMemory(this.scopeStack, arrName, 'write', currentIdx); } result = obj.length; await this.ui.animateReturnHeader(arrName, result, node.domIds[0]); this.ui.replaceTokenText(node.domIds[0], result, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return result; } 
                    else if (method === 'pop') { const lastIndex = obj.length - 1; const val = obj[lastIndex]; await this.ui.animateRead(arrName, val, node.domIds[0], lastIndex); await this.ui.animateArrayPop(arrName, lastIndex); result = obj.pop(); await this.ui.updateMemory(this.scopeStack, arrName, 'write'); this.ui.replaceTokenText(node.domIds[0], result, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return result; }
                    else if (method === 'splice') { const start = argValues[0]; const count = argValues[1] || 0; const removedItems = obj.slice(start, start + count); if (removedItems.length > 0) { const indicesToHighlight = []; for(let i=0; i<count; i++) indicesToHighlight.push(start + i); await this.ui.highlightArrayElements(arrName, indicesToHighlight, 'delete'); await this.ui.wait(500); await this.ui.animateSpliceRead(arrName, removedItems, node.domIds[0], start); } result = obj.splice(...argValues); await this.ui.updateMemory(this.scopeStack, arrName, 'write'); const resultStr = `[${result.map(v => JSON.stringify(v)).join(', ')}]`; this.ui.setRawTokenText(node.domIds[0], resultStr, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return result; }
                    if (method === 'shift') { const firstVal = obj[0]; await this.ui.animateRead(arrName, firstVal, node.domIds[0], 0); result = obj.shift(); await this.ui.updateMemory(this.scopeStack, arrName, 'write'); this.ui.replaceTokenText(node.domIds[0], result, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return result; }
                    if (method === 'unshift') { result = obj.unshift(...argValues); await this.ui.updateMemory(this.scopeStack, arrName, 'write'); if(node.args.length>0) await this.ui.animateAssignment(arrName, argValues[0], node.args[0].domIds[0], 0); await this.ui.animateReturnHeader(arrName, result, node.domIds[0]); this.ui.replaceTokenText(node.domIds[0], result, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return result; }
                    if (result !== undefined) return result;
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
                    await this.ui.animateOperationCollapse(node.domIds, res); 
                    await this.ui.wait(800); 
                    return res; 
                } 
                if (node.callee.name.startsWith('Math.')) { 
                    const method = node.callee.name.split('.')[1]; 
                    if (typeof Math[method] === 'function') {
                        let res = Math[method](...argValues); 
                        await this.ui.animateOperationCollapse(node.domIds, res); 
                        await this.ui.wait(800); 
                        return res; 
                    }
                } 
            }
            if (node.callee instanceof MemberExpr) { const objVal = await this.evaluate(node.callee.object); if (node.callee.property === 'toFixed' && typeof objVal === 'number') { const digits = argValues.length > 0 ? argValues[0] : 0; const res = objVal.toFixed(digits); await this.ui.animateOperationCollapse(node.domIds, `"${res}"`); await this.ui.wait(800); return res; } }
            let funcNode; let closureScope = this.globalScope; let paramNames = []; let funcName = "anonymous"; let paramIds = [];
            if (node.callee instanceof Identifier) { funcName = node.callee.name; let val = null; try { val = this.currentScope.get(node.callee.name); } catch(e) {} if (val && val.value && (val.value.type === 'arrow_func' || val.value.type === 'function_expr')) { funcNode = val.value; closureScope = val.value.scope; paramNames = val.value.params; paramIds = val.value.paramIds || []; } else if (this.functions[node.callee.name]) { funcNode = this.functions[node.callee.name]; paramNames = funcNode.params.map(p => p.name); paramIds = funcNode.params.map(p => p.id); } else { throw new Error(`Fonction ${node.callee.name} inconnue`); } }
            if (funcNode) { const fnScope = new Scope(`${funcName}(${paramNames.join(', ')})`, closureScope, this.currentScope); this.scopeStack.push(fnScope); for (let i=0; i<paramNames.length; i++) { const pName = paramNames[i]; if (node.args[i] && paramIds[i]) { await this.ui.animateParamPass(argValues[i], node.args[i].domIds[0], paramIds[i]); } fnScope.define(pName, 'let'); fnScope.initialize(pName, argValues[i]); if (paramIds[i]) { this.ui.replaceTokenText(paramIds[i], argValues[i], false); } await this.ui.updateMemory(this.scopeStack, pName, 'declare'); } await this.ui.wait(600); const prevScope = this.currentScope; this.currentScope = fnScope; await this.ui.updateMemory(this.scopeStack); this.ui.lockTokens(node.domIds || []); this.callStack.push(node.line); let result = undefined; let returnSourceId = null; const body = funcNode.body; if (body instanceof BlockStmt) { for(const stmt of body.body) { if (stmt instanceof ReturnStmt) { await this.pause(stmt.line); result = stmt.argument ? await this.evaluate(stmt.argument) : undefined; returnSourceId = (stmt.argument && stmt.argument.domIds.length > 0) ? stmt.argument.domIds[0] : stmt.domIds[0]; break; } await this.execute(stmt); } } else { await this.pause(node.line); result = await this.evaluate(body); returnSourceId = body.domIds ? body.domIds[0] : null; } this.callStack.pop(); this.ui.unlockTokens(node.domIds || []); if (result !== undefined) { if(returnSourceId) { await this.ui.animateReturnToCall(node.domIds, result, returnSourceId); } else { await this.ui.animateReturnToCall(node.domIds, result); } await this.ui.wait(800); } this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); for (let i=0; i<paramIds.length; i++) { if (paramIds[i]) { this.ui.resetTokenText(paramIds[i]); } } return result; } }
    }
}
