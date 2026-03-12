// @ts-nocheck

export const attachTokenAnimationMethods = (ui, deps = {}) => {
    const {
        getFlowVisualElement,
        createFlowGuideLine,
        valueToVisualText,
        valueToCodeVisualText,
        formatValue,
        isVirtualDomValue,
        buildDomInlineValueMarkup
    } = deps;

    Object.assign(ui, {
    lockTokens: (ids) => ids.forEach(id => ui.lockedTokens.add(id)), unlockTokens: (ids) => ids.forEach(id => ui.lockedTokens.delete(id)),
    rememberTokenOriginal: (tokenId, el, isTransient = true) => {
        if (!ui.modifiedTokens.has(tokenId)) {
            ui.modifiedTokens.set(tokenId, { original: el.innerText, originalHtml: el.innerHTML, transient: isTransient });
        }
    },
    pickExpressionCollapseTarget: (elements) => {
        if (!elements || elements.length === 0) return null;
        if (elements.length === 1) return elements[0];
        const rectData = elements.map((element) => ({
            element,
            rect: element.getBoundingClientRect()
        }));
        const minLeft = Math.min(...rectData.map((entry) => entry.rect.left));
        const maxRight = Math.max(...rectData.map((entry) => entry.rect.right));
        const expressionCenterX = (minLeft + maxRight) / 2;
        let best = rectData[0];
        let bestDistance = Math.abs((best.rect.left + best.rect.width / 2) - expressionCenterX);
        for (let index = 1; index < rectData.length; index++) {
            const candidate = rectData[index];
            const candidateCenterX = candidate.rect.left + candidate.rect.width / 2;
            const distance = Math.abs(candidateCenterX - expressionCenterX);
            if (distance < bestDistance) {
                best = candidate;
                bestDistance = distance;
            }
        }
        return best.element;
    },
    replaceTokenText: (tokenId, newValue, isTransient = true) => { if(ui.isStopping) return; const el = document.getElementById(tokenId); if (el) { ui.rememberTokenOriginal(tokenId, el, isTransient); el.innerText = valueToCodeVisualText(newValue); el.classList.add('val-replacement'); } },
    setRawTokenText: (tokenId, text, isTransient = true) => { if(ui.isStopping) return; const el = document.getElementById(tokenId); if (el) { ui.rememberTokenOriginal(tokenId, el, isTransient); el.innerText = text; el.classList.add('val-replacement'); } },
    setTokenMarkup: (tokenId, html, isTransient = true) => { if(ui.isStopping) return; const el = document.getElementById(tokenId); if (el) { ui.rememberTokenOriginal(tokenId, el, isTransient); el.innerHTML = html; el.classList.add('val-replacement'); } },
    resetTokenText: (tokenId) => { const el = document.getElementById(tokenId); if (el && ui.modifiedTokens.has(tokenId)) { const data = ui.modifiedTokens.get(tokenId); if (Object.prototype.hasOwnProperty.call(data, 'originalHtml')) el.innerHTML = data.originalHtml; else el.innerText = data.original; el.classList.remove('val-replacement'); ui.modifiedTokens.delete(tokenId); } },
    resetVisuals: () => { for (const [id, data] of ui.modifiedTokens) { if (data.transient && !ui.lockedTokens.has(id)) { const el = document.getElementById(id); if (el) { if (Object.prototype.hasOwnProperty.call(data, 'originalHtml')) el.innerHTML = data.originalHtml; else el.innerText = data.original; el.classList.remove('val-replacement'); el.classList.remove('op-result'); el.style.opacity = '1'; el.style.display = 'inline'; el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; } ui.modifiedTokens.delete(id); } } const hidden = document.querySelectorAll('[style*="display: none"]'); hidden.forEach(el => { if(!ui.modifiedTokens.has(el.id) || (ui.modifiedTokens.get(el.id).transient && !ui.lockedTokens.has(el.id))) { el.style.display = 'inline'; el.style.opacity = '1'; el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; } }); },

    flyHelper: async (value, startEl, endEl, delayStart = true) => {
        if (!startEl || !endEl || ui.isStopping) return;
        if (!ui.showDataFlow) return;
        const startTarget = getFlowVisualElement(startEl);
        const endTarget = getFlowVisualElement(endEl);
        if (!startTarget || !endTarget) return;
        const guide = createFlowGuideLine(startTarget, endTarget, ui.showFlowLine);
        try {
            // Scroll destination into view first
            endTarget.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
            
            // Wait for scroll to reliably finish (fixed timing issue)
            await ui.wait(600); 
            
            if (ui.isStopping) return;

            const zIndex = 12000;

            // Re-calculate positions AFTER scroll is complete
            const start = startTarget.getBoundingClientRect(); 
            const end = endTarget.getBoundingClientRect();
            
            if (start.top < 0 || end.top < 0) return;
            if (start.width < 2 || start.height < 2 || end.width < 2 || end.height < 2) return;
            const flyer = document.createElement('div'); flyer.className = 'flying-element'; flyer.innerText = valueToCodeVisualText(value); document.body.appendChild(flyer);
            
            flyer.style.zIndex = zIndex; 

            const fRect = flyer.getBoundingClientRect();
            const startX = start.left + (start.width - fRect.width) / 2;
            const startY = start.top + (start.height - fRect.height) / 2;
            flyer.style.left = `${startX}px`; flyer.style.top = `${startY}px`;
            if (delayStart) await ui.wait(20);
            if (ui.isStopping) { flyer.remove(); return; }
            const endX = end.left + (end.width - fRect.width) / 2;
            const endY = end.top + (end.height - fRect.height) / 2;
            const dx = endX - startX; const dy = endY - startY;
            const expandDuration = Math.min(180, Math.max(110, ui.baseDelay * 0.2));
            const holdBeforeFlight = Math.min(220, Math.max(120, ui.baseDelay * 0.2));
            const holdAfterFlight = Math.min(220, Math.max(120, ui.baseDelay * 0.2));
            const collapseDuration = Math.min(160, Math.max(90, ui.baseDelay * 0.16));
            await guide.expand(expandDuration);
            await ui.wait(holdBeforeFlight);
            flyer.style.transition = `transform ${ui.baseDelay / ui.speedMultiplier}ms cubic-bezier(0.25, 1, 0.5, 1)`;
            flyer.style.transform = `translate(${dx}px, ${dy}px)`;
            await ui.wait(ui.baseDelay);
            await ui.wait(holdAfterFlight);
            await guide.collapse(collapseDuration);
            flyer.remove();
        } finally {
            guide.stop();
        }
    },
    flyDomNodeHelper: async (startEl, endEl, delayStart = true) => {
        if (!startEl || !endEl || ui.isStopping) return;
        if (!ui.showDataFlow) return;
        const startTarget = getFlowVisualElement(startEl);
        const endTarget = getFlowVisualElement(endEl);
        if (!startTarget || !endTarget) return;
        const guide = createFlowGuideLine(startTarget, endTarget, ui.showFlowLine);
        try {
            endTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await ui.wait(600);
            if (ui.isStopping) return;

            const start = startTarget.getBoundingClientRect();
            const end = endTarget.getBoundingClientRect();
            if (start.top < 0 || end.top < 0) return;

            const flyer = startEl.cloneNode(true);
            flyer.classList.add('flying-dom-node');
            flyer.removeAttribute('id');
            flyer.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
            document.body.appendChild(flyer);
            flyer.style.position = 'fixed';
            flyer.style.pointerEvents = 'none';
            flyer.style.zIndex = '12050';
            flyer.style.margin = '0';
            flyer.style.marginLeft = '0';
            flyer.style.display = 'inline-flex';
            flyer.style.width = 'max-content';
            flyer.style.maxWidth = 'none';

            const fRect = flyer.getBoundingClientRect();
            const startX = start.left + (start.width - fRect.width) / 2;
            const startY = start.top + (start.height - fRect.height) / 2;
            flyer.style.left = `${startX}px`;
            flyer.style.top = `${startY}px`;
            if (delayStart) await ui.wait(20);
            if (ui.isStopping) { flyer.remove(); return; }
            const endX = end.left + (end.width - fRect.width) / 2;
            const endY = end.top + (end.height - fRect.height) / 2;
            const dx = endX - startX;
            const dy = endY - startY;
            const expandDuration = Math.min(180, Math.max(110, ui.baseDelay * 0.2));
            const holdBeforeFlight = Math.min(220, Math.max(120, ui.baseDelay * 0.2));
            const holdAfterFlight = Math.min(220, Math.max(120, ui.baseDelay * 0.2));
            const collapseDuration = Math.min(160, Math.max(90, ui.baseDelay * 0.16));
            await guide.expand(expandDuration);
            await ui.wait(holdBeforeFlight);
            flyer.style.transition = `transform ${ui.baseDelay / ui.speedMultiplier}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${ui.baseDelay / ui.speedMultiplier}ms ease`;
            flyer.style.transform = `translate(${dx}px, ${dy}px) scale(0.95)`;
            flyer.style.opacity = '0.95';
            await ui.wait(ui.baseDelay);
            await ui.wait(holdAfterFlight);
            await guide.collapse(collapseDuration);
            flyer.remove();
        } finally {
            guide.stop();
        }
    },

    animateAssignment: async (varName, value, targetTokenId, index = null, varTokenId = null, codeIndexTokenId = null, options = null) => {
        if (ui.skipMode || ui.isStopping) return;
        const onArrive = options && typeof options.onArrive === 'function' ? options.onArrive : null;
        await ui.ensureDrawerOpen('memory');
        await ui.wait(220);
        const tokenEl = document.getElementById(targetTokenId);
        const { memEl, closePortal } = ui.resolveMemoryValueTarget(varName, index);
        if (memEl && memEl.id) ui.ensureVisible(memEl.id);
        if (!tokenEl) { closePortal(); return; }
        if (!memEl) {
            if (onArrive) await onArrive();
            await ui.maybePauseAfterMicroStep();
            closePortal();
            return;
        }
        const arrayRowEl = memEl.closest('.array-element');
        if (arrayRowEl) arrayRowEl.classList.add('array-cell-focus');
        const memoryCell = memEl.closest('.memory-cell');
        if (!ui.showDataFlow && ui.showFlowLine && memoryCell) ui.triggerMemoryFlash(memoryCell, 'write');
        const clearVarHighlight = ui.setVariableRelationHighlight(varName, varTokenId || targetTokenId, true, index, codeIndexTokenId);
        try {
            await ui.animateWithFlowHighlight(tokenEl, memEl, async () => {
                await ui.flyHelper(value, tokenEl, memEl, false);
                if (onArrive) {
                    await onArrive();
                    return;
                }
                const valueContent = memEl.querySelector('.mem-val-content');
                if (!valueContent) return;
                if (isVirtualDomValue(value)) {
                    valueContent.innerHTML = buildDomInlineValueMarkup(value);
                    return;
                }
                if (Array.isArray(value) && (index === null || index === undefined)) {
                    valueContent.textContent = `length=${value.length}`;
                    return;
                }
                valueContent.textContent = valueToVisualText(value);
            });
        } finally {
            clearVarHighlight();
            if (arrayRowEl) arrayRowEl.classList.remove('array-cell-focus');
            closePortal();
        }
        await ui.maybePauseAfterMicroStep();
    },
    animateRead: async (varName, value, targetTokenId, index = null, varTokenId = null, codeIndexTokenId = null, options = null) => {
        if (ui.skipMode || ui.isStopping) return;
        const onArrive = options && typeof options.onArrive === 'function' ? options.onArrive : null;
        await ui.ensureDrawerOpen('memory');
        await ui.wait(220);
        const { memEl, closePortal } = ui.resolveMemoryValueTarget(varName, index);
        if (memEl && memEl.id) ui.ensureVisible(memEl.id);
        const expressionTarget = Array.isArray(targetTokenId)
            ? ui.createCodeExpressionTarget(targetTokenId)
            : { target: document.getElementById(targetTokenId), elements: [], clear: () => {} };
        const tokenEl = expressionTarget.target;
        if (!tokenEl) { expressionTarget.clear(); closePortal(); return; }
        if (!memEl) {
            if (onArrive) await onArrive();
            expressionTarget.clear();
            await ui.maybePauseAfterMicroStep();
            closePortal();
            return;
        }
        const firstTokenId = Array.isArray(targetTokenId) ? targetTokenId[0] : targetTokenId;
        const arrayRowEl = memEl.closest('.array-element');
        if (arrayRowEl) arrayRowEl.classList.add('array-cell-focus');
        const memoryCell = memEl.closest('.memory-cell');
        if (!ui.showDataFlow && ui.showFlowLine && memoryCell) ui.triggerMemoryFlash(memoryCell, 'read');
        const clearVarHighlight = ui.setVariableRelationHighlight(varName, varTokenId || firstTokenId, true, index, codeIndexTokenId);
        try {
            await ui.animateWithFlowHighlight(memEl, tokenEl, async () => {
                await ui.flyHelper(value, memEl, tokenEl, false);
                if (onArrive) await onArrive();
            });
        } finally {
            expressionTarget.clear();
            clearVarHighlight();
            if (arrayRowEl) arrayRowEl.classList.remove('array-cell-focus');
            closePortal();
        }
        await ui.maybePauseAfterMicroStep();
    },
    visualizeIdentifier: async (varName, value, domIds) => { if (!domIds || domIds.length === 0 || ui.isStopping) return; await ui.animateRead(varName, value, domIds[0]); ui.replaceTokenText(domIds[0], value, true); for(let i=1; i<domIds.length; i++) { const el = document.getElementById(domIds[i]); if(el) { if(!ui.modifiedTokens.has(domIds[i])) ui.modifiedTokens.set(domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await ui.wait(120); },
    animateReadHeader: async (varName, value, targetTokenId) => {
        if (ui.skipMode || ui.isStopping) return;
        await ui.ensureDrawerOpen('memory');
        await ui.wait(220);
        const memId = `mem-header-${varName}`;
        ui.ensureVisible(memId);
        const memEl = document.getElementById(memId);
        const expressionTarget = Array.isArray(targetTokenId)
            ? ui.createCodeExpressionTarget(targetTokenId)
            : { target: document.getElementById(targetTokenId), elements: [], clear: () => {} };
        const tokenEl = expressionTarget.target;
        if (!tokenEl || !memEl) { expressionTarget.clear(); return; }
        const firstTokenId = Array.isArray(targetTokenId) ? targetTokenId[0] : targetTokenId;
        const clearVarHighlight = ui.setVariableRelationHighlight(varName, firstTokenId, true);
        try {
            await ui.animateWithFlowHighlight(memEl, tokenEl, async () => {
                await ui.flyHelper(value, memEl, tokenEl, false);
            });
        } finally {
            expressionTarget.clear();
            clearVarHighlight();
        }
        await ui.maybePauseAfterMicroStep();
    },
    animateReturnHeader: async (varName, value, targetTokenId) => { await ui.animateReadHeader(varName, value, targetTokenId); },
    animateSpliceRead: async (varName, values, targetTokenId, startIndex) => {
        if (ui.skipMode || ui.isStopping) return;
        await ui.ensureDrawerOpen('memory');
        await ui.wait(220);
        const { memEl, closePortal } = ui.resolveMemoryValueTarget(varName, startIndex);
        if (memEl && memEl.id) ui.ensureVisible(memEl.id);
        const expressionTarget = Array.isArray(targetTokenId)
            ? ui.createCodeExpressionTarget(targetTokenId)
            : { target: document.getElementById(targetTokenId), elements: [], clear: () => {} };
        const tokenEl = expressionTarget.target;
        if (!memEl || !tokenEl) { expressionTarget.clear(); closePortal(); return; }
        const valStr = `[${values.map(v => JSON.stringify(formatValue(v))).join(', ')}]`;
        const firstTokenId = Array.isArray(targetTokenId) ? targetTokenId[0] : targetTokenId;
        const clearVarHighlight = ui.setVariableRelationHighlight(varName, firstTokenId, true);
        try {
            await ui.animateWithFlowHighlight(memEl, tokenEl, async () => {
                await ui.flyHelper(valStr, memEl, tokenEl, false);
            });
        } finally {
            expressionTarget.clear();
            clearVarHighlight();
            closePortal();
        }
        await ui.maybePauseAfterMicroStep();
    },
    animateOperationCollapse: async (domIds, result) => {
        if (ui.skipMode || ui.isStopping) return;
        const elements = domIds
            .map((id) => document.getElementById(id))
            .filter((element) => element && element.style.display !== 'none');
        if (elements.length === 0) return;
        elements.forEach((element) => {
            if (!ui.modifiedTokens.has(element.id)) {
                ui.modifiedTokens.set(element.id, { original: element.innerText, transient: true });
            }
        });

        let groupHighlight = null;
        if (elements.length > 1) {
            const rects = elements.map((element) => element.getBoundingClientRect());
            const minTop = Math.min(...rects.map((rect) => rect.top));
            const minLeft = Math.min(...rects.map((rect) => rect.left));
            const maxRight = Math.max(...rects.map((rect) => rect.right));
            const maxBottom = Math.max(...rects.map((rect) => rect.bottom));
            groupHighlight = document.createElement('div');
            groupHighlight.className = 'expr-collapse-highlight';
            groupHighlight.style.position = 'fixed';
            groupHighlight.style.left = `${Math.max(0, minLeft - 2)}px`;
            groupHighlight.style.top = `${Math.max(0, minTop - 2)}px`;
            groupHighlight.style.width = `${Math.max(10, maxRight - minLeft + 4)}px`;
            groupHighlight.style.height = `${Math.max(10, maxBottom - minTop + 4)}px`;
            groupHighlight.style.zIndex = '12022';
            document.body.appendChild(groupHighlight);
        } else {
            elements.forEach((element) => {
                element.style.backgroundColor = 'rgba(167, 139, 250, 0.4)';
                element.style.boxShadow = '0 0 2px rgba(167, 139, 250, 0.6)';
            });
        }

        await ui.wait(ui.baseDelay);
        if (groupHighlight && groupHighlight.parentElement) groupHighlight.remove();
        elements.forEach((element) => {
            element.style.backgroundColor = 'transparent';
            element.style.boxShadow = 'none';
            element.style.opacity = '0.5';
        });
        await ui.wait(ui.baseDelay);
        const target = ui.pickExpressionCollapseTarget(elements) || elements[0];
        target.innerText = valueToCodeVisualText(result);
        target.style.opacity = '1';
        target.classList.add('op-result');
        for (let index = 0; index < elements.length; index++) {
            if (elements[index] === target) continue;
            elements[index].style.display = 'none';
        }
        await ui.maybePauseAfterMicroStep();
    },
    animateReturnToCall: async (callDomIds, result, sourceId = null) => {
        const elements = (callDomIds || [])
            .map((id) => document.getElementById(id))
            .filter((element) => element && element.style.display !== 'none');
        if (elements.length === 0) return;
        const targetEl = ui.pickExpressionCollapseTarget(elements) || elements[0];
        if (ui.skipMode) {
            elements.forEach((element) => {
                if (!ui.modifiedTokens.has(element.id)) ui.modifiedTokens.set(element.id, { original: element.innerText, transient: true });
            });
            targetEl.innerText = valueToCodeVisualText(result);
            targetEl.classList.add('op-result');
            elements.forEach((element) => {
                if (element !== targetEl) element.style.display = 'none';
            });
            await ui.maybePauseAfterMicroStep();
            return;
        }
        if (sourceId) {
            const sourceEl = document.getElementById(sourceId);
            if (sourceEl) await ui.flyHelper(result, sourceEl, targetEl, false);
        }
        elements.forEach((element) => {
            if (!ui.modifiedTokens.has(element.id)) ui.modifiedTokens.set(element.id, { original: element.innerText, transient: true });
            element.style.opacity = '0.5';
        });
        if (!sourceId) await ui.wait(ui.baseDelay);
        targetEl.innerText = valueToCodeVisualText(result);
        targetEl.style.opacity = '1';
        targetEl.classList.add('op-result');
        elements.forEach((element) => {
            if (element !== targetEl) element.style.display = 'none';
        });
        await ui.maybePauseAfterMicroStep();
    },
    animateParamPass: async (value, sourceId, targetId) => { if (ui.skipMode || ui.isStopping) return; const sourceEl = document.getElementById(sourceId); const targetEl = document.getElementById(targetId); await ui.flyHelper(value, sourceEl, targetEl); }
    });
};
