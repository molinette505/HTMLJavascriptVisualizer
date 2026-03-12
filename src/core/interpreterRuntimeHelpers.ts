// @ts-nocheck
// File purpose: runtime error normalization plus shared token/DOM lookup helpers.

export function formatRuntimeError(interpreter, error) {
    let name = (error && error.name) ? String(error.name) : 'Error';
    const raw = (error && error.message) ? String(error.message) : String(error);
    const stack = (error && error.stack) ? String(error.stack) : '';
    const errorLine = (error && Number.isFinite(error.line)) ? Number(error.line) : null;
    const pedagogicalStack = (error && Array.isArray(error.__pedagogicalStack) && error.__pedagogicalStack.length > 0)
        ? error.__pedagogicalStack.map((entry) => String(entry))
        : (errorLine ? [`parser (ligne ${errorLine})`] : interpreter.buildPedagogicalStack(interpreter.lastPausedLine));
    let friendly = raw;
    const declared = raw.match(/^Variable (.+) déjà déclarée$/);
    if (declared) {
        name = 'SyntaxError';
        friendly = `Variable "${declared[1]}" deja declaree dans ce scope.`;
    }
    const constant = raw.match(/^Assignation à une constante (.+)$/);
    if (constant) {
        name = 'TypeError';
        friendly = `Impossible de modifier la constante "${constant[1]}".`;
    }
    const undefinedVar = raw.match(/^Variable (.+) non définie$/);
    if (undefinedVar) {
        name = 'ReferenceError';
        friendly = `${undefinedVar[1]} is not defined.`;
    }
    const tdzVar = raw.match(/^Cannot access '(.+)' before initialization$/);
    if (tdzVar) {
        name = 'ReferenceError';
        friendly = `Cannot access '${tdzVar[1]}' before initialization.`;
    }
    const unknownFn = raw.match(/^Fonction (.+) inconnue$/);
    if (unknownFn) {
        name = 'ReferenceError';
        friendly = `${unknownFn[1]} is not defined.`;
    }
    const notFunction = raw.match(/^(.+) is not a function$/);
    if (notFunction) {
        name = 'TypeError';
        friendly = raw;
    }
    if (raw.includes('Cannot read properties of undefined')) {
        name = 'TypeError';
        friendly = "Impossible de lire une propriete d'une valeur undefined.";
    }
    if (raw.includes('Cannot set properties of undefined')) {
        name = 'TypeError';
        friendly = "Impossible d'ecrire une propriete sur une valeur undefined.";
    }
    if (raw.includes('is not a function') && !notFunction) {
        name = 'TypeError';
        friendly = "Tentative d'appel d'une valeur qui n'est pas une fonction.";
    }
    if (raw.includes('removeChild: noeud introuvable')) {
        friendly = "removeChild: le noeud n'est pas un enfant direct ou descendant du parent cible.";
    }
    if (raw.startsWith('Attendu:')) {
        name = 'SyntaxError';
        friendly = `Erreur de syntaxe: ${raw}`;
    }
    if (raw === 'Unexpected token' || raw === 'Invalid assignment target' || raw.includes('Syntaxe de fonction fléchée invalide')) {
        name = 'SyntaxError';
    }
    if (name === 'SyntaxError' && errorLine && !friendly.includes('ligne')) {
        friendly = `${friendly} (ligne ${errorLine})`;
    }
    return { name, raw, friendly, stack, pedagogicalStack, line: errorLine };
}

export async function logRuntimeError(interpreter, error, prefix = 'Erreur') {
    const { name, raw, friendly, stack, pedagogicalStack, line } = formatRuntimeError(interpreter, error);
    if (typeof interpreter.ui.renderError === 'function') {
        await interpreter.ui.renderError({
            prefix,
            name,
            message: friendly,
            technicalMessage: raw,
            stack,
            pedagogicalStack,
            line,
            errorObject: error,
        });
        return;
    }
    interpreter.ui.log(`${prefix}: ${name}: ${friendly}`, 'error');
    if (friendly !== raw) interpreter.ui.log(`Detail technique: ${raw}`, 'error');
}

export function refreshDomView(interpreter) {
    if (interpreter.domDocument && typeof interpreter.ui.updateDom === 'function') {
        interpreter.ui.updateDom(interpreter.domDocument);
    }
}

export function getExpressionDisplayTokenId(interpreter, expressionNode) {
    if (!expressionNode) return null;
    if (expressionNode.resultTokenId) return expressionNode.resultTokenId;
    if (!expressionNode.domIds || expressionNode.domIds.length === 0) return null;
    if (typeof document === 'undefined') return expressionNode.domIds[0];
    for (const tokenId of expressionNode.domIds) {
        const tokenEl = document.getElementById(tokenId);
        if (tokenEl && tokenEl.style.display !== 'none') return tokenId;
    }
    return expressionNode.domIds[0];
}

export function getIdentifierTokenId(interpreter, domIds, identifierName) {
    if (!domIds || domIds.length === 0) return null;
    if (typeof document === 'undefined' || !identifierName) return domIds[0];
    for (const tokenId of domIds) {
        const tokenEl = document.getElementById(tokenId);
        if (!tokenEl || tokenEl.style.display === 'none') continue;
        if (String(tokenEl.innerText || '').trim() === String(identifierName)) return tokenId;
    }
    return domIds[0];
}

export function getMemberPropertyTokenId(interpreter, node) {
    if (!node || !node.domIds || node.domIds.length === 0) return null;
    if (node.computed) return null;
    return node.domIds[node.domIds.length - 1];
}

export function setMemberPropertyHoverSnapshot(interpreter, node, value) {
    if (!node || !node.property || typeof interpreter.ui.setCodePropertySnapshot !== 'function') return;
    const tokenId = getMemberPropertyTokenId(interpreter, node);
    if (!tokenId) return;
    const propertyName = (node.property && Object.prototype.hasOwnProperty.call(node.property, 'value'))
        ? String(node.property.value)
        : 'property';
    interpreter.ui.setCodePropertySnapshot(tokenId, propertyName, value);
}

export function findScopeForVariable(interpreter, name, scope = interpreter.currentScope) {
    if (!scope) return null;
    if (scope.variables && Object.prototype.hasOwnProperty.call(scope.variables, name)) return scope;
    if (scope.parent) return findScopeForVariable(interpreter, name, scope.parent);
    return null;
}

export function setVariableFunctionAlias(interpreter, name, alias = null, scope = null) {
    const resolvedScope = scope || findScopeForVariable(interpreter, name, interpreter.currentScope);
    if (!resolvedScope || !resolvedScope.variables || !resolvedScope.variables[name]) return;
    if (alias) resolvedScope.variables[name].functionAlias = alias;
    else delete resolvedScope.variables[name].functionAlias;
}

export function collapseExpressionTokens(interpreter, domIds, keepTokenId) {
    if (!domIds || domIds.length === 0) return;
    for (const tokenId of domIds) {
        if (tokenId === keepTokenId) continue;
        const tokenEl = document.getElementById(tokenId);
        if (!tokenEl) continue;
        if (!interpreter.ui.modifiedTokens.has(tokenId)) {
            interpreter.ui.modifiedTokens.set(tokenId, { original: tokenEl.innerText, transient: true });
        }
        tokenEl.style.display = 'none';
    }
}

export function getCallReplacementTokenId(interpreter, callNode) {
    if (!callNode) return null;
    const domIds = (callNode.domIds && callNode.domIds.length > 0)
        ? callNode.domIds
        : ((callNode.callee && callNode.callee.domIds) ? callNode.callee.domIds : []);
    if (!domIds || domIds.length === 0) return null;
    if (typeof document === 'undefined') return domIds[Math.floor(domIds.length / 2)] || domIds[0];
    const visible = domIds
        .map((tokenId) => document.getElementById(tokenId))
        .filter((tokenEl) => tokenEl && tokenEl.style.display !== 'none');
    if (visible.length === 0) return domIds[0];
    if (visible.length === 1) return visible[0].id;
    const rectData = visible.map((tokenEl) => ({ tokenEl, rect: tokenEl.getBoundingClientRect() }));
    const minLeft = Math.min(...rectData.map((entry) => entry.rect.left));
    const maxRight = Math.max(...rectData.map((entry) => entry.rect.right));
    const centerX = (minLeft + maxRight) / 2;
    let best = rectData[0];
    let bestDistance = Math.abs((best.rect.left + best.rect.width / 2) - centerX);
    for (let index = 1; index < rectData.length; index++) {
        const candidate = rectData[index];
        const candidateDistance = Math.abs((candidate.rect.left + candidate.rect.width / 2) - centerX);
        if (candidateDistance < bestDistance) {
            best = candidate;
            bestDistance = candidateDistance;
        }
    }
    return best.tokenEl.id;
}

export function isDomNodeVisible(interpreter, node) {
    if (!node) return false;
    if (typeof interpreter.ui.getDomTreeNodeElement !== 'function') return true;
    return Boolean(interpreter.ui.getDomTreeNodeElement(node));
}
