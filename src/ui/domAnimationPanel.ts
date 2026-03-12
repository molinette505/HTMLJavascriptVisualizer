// @ts-nocheck

export const attachDomMethods = (ui, deps = {}) => {
    const {
        resolveVirtualDomNodeByPath,
        getDomTreeRef,
        mapDomPropertyToAttr,
        getFlowVisualElement,
        createFlowGuideLine,
        formatValue,
        createDomFlyBadgeElement,
        buildDomTreeMarkup,
        buildDomPreviewDocument
    } = deps;

    Object.assign(ui, {
    postToDomRenderFrame: (payload) => {
        const frame = ui.getP5RuntimeFrame() || (() => {
            const renderView = document.getElementById('dom-view-render');
            if (!renderView) return null;
            return renderView.querySelector('iframe.dom-render-frame');
        })();
        if (!frame || !frame.contentWindow) return false;
        try {
            frame.contentWindow.postMessage(payload, '*');
            return true;
        } catch (error) {
            return false;
        }
    },
    updateDomInputValue: (domPath = '', nextValue = '') => {
        if (!ui.domDocument) return false;
        const targetNode = resolveVirtualDomNodeByPath(ui.domDocument, domPath);
        if (!targetNode || targetNode.__domType !== 'element') return false;
        targetNode.value = String(nextValue ?? '');
        return true;
    },
    getDomTreeNodeElement: (node, root = document) => {
        if (!node) return null;
        const ref = getDomTreeRef(node);
        if (!ref) return null;
        if (root && typeof root.querySelector === 'function') {
            const scoped = root.querySelector(`[data-dom-tree-ref="${ref}"]`);
            if (scoped) return scoped;
        }
        return document.getElementById(`dom-tree-node-${ref}`);
    },
    getElementsByIds: (ids) => (ids || []).map((id) => document.getElementById(id)).filter(Boolean),
    getVisibleCodeElements: (ids) => ui.getElementsByIds(ids).filter((element) => {
        if (!element || element.style.display === 'none') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
    }),
    createCodeExpressionTarget: (ids) => {
        const elements = ui.getVisibleCodeElements(ids);
        if (elements.length === 0) return { target: null, elements: [], clear: () => {} };
        if (elements.length === 1) return { target: elements[0], elements, clear: () => {} };
        const rects = elements.map((element) => element.getBoundingClientRect());
        const minTop = Math.min(...rects.map((rect) => rect.top));
        const minLeft = Math.min(...rects.map((rect) => rect.left));
        const maxRight = Math.max(...rects.map((rect) => rect.right));
        const maxBottom = Math.max(...rects.map((rect) => rect.bottom));
        const box = document.createElement('div');
        box.className = 'expr-flow-target';
        box.style.position = 'fixed';
        box.style.left = `${Math.max(0, minLeft - 2)}px`;
        box.style.top = `${Math.max(0, minTop - 2)}px`;
        box.style.width = `${Math.max(10, maxRight - minLeft + 4)}px`;
        box.style.height = `${Math.max(10, maxBottom - minTop + 4)}px`;
        box.style.zIndex = '12020';
        document.body.appendChild(box);
        return {
            target: box,
            elements,
            clear: () => { if (box.parentElement) box.remove(); }
        };
    },
    getDomAttributeElements: (nodeElement, property = '') => {
        if (!nodeElement) return [];
        const attrName = mapDomPropertyToAttr(property);
        if (!attrName) return [];
        return Array.from(nodeElement.querySelectorAll(`[data-dom-attr="${attrName}"]`));
    },
    getDomTreeSubtreeElements: (node, root = document) => {
        if (!node) return [];
        const elements = [];
        const walk = (current) => {
            const currentEl = ui.getDomTreeNodeElement(current, root);
            if (currentEl) elements.push(currentEl);
            if (!current || !current.children || current.children.length === 0) return;
            current.children.forEach((child) => walk(child));
        };
        walk(node);
        return elements;
    },
    createDomGroupHighlight: (elements) => {
        if (!elements || elements.length === 0) return { box: null, clear: () => {} };
        const rects = elements.map((element) => element.getBoundingClientRect());
        const minTop = Math.min(...rects.map((rect) => rect.top));
        const minLeft = Math.min(...rects.map((rect) => rect.left));
        const maxRight = Math.max(...rects.map((rect) => rect.right));
        const maxBottom = Math.max(...rects.map((rect) => rect.bottom));
        const box = document.createElement('div');
        box.className = 'dom-group-highlight-box';
        box.style.position = 'fixed';
        box.style.left = `${Math.max(0, minLeft - 8)}px`;
        box.style.top = `${Math.max(0, minTop - 6)}px`;
        box.style.width = `${Math.max(24, maxRight - minLeft + 16)}px`;
        box.style.height = `${Math.max(20, maxBottom - minTop + 12)}px`;
        box.style.zIndex = '12020';
        document.body.appendChild(box);
        return {
            box,
            clear: () => { if (box.parentElement) box.remove(); }
        };
    },
    setDomAttributeHighlight: (elements, enabled) => {
        (elements || []).forEach((element) => {
            if (!element) return;
            if (enabled) element.classList.add('dom-attr-highlight');
            else element.classList.remove('dom-attr-highlight');
        });
    },
    highlightDomNode: async (node) => {
        const target = ui.getDomTreeNodeElement(node);
        if (!target) return;
        target.classList.add('dom-highlight');
        await ui.wait(450);
        target.classList.remove('dom-highlight');
    },
    setDomNodeClass: (nodes, className, enabled) => {
        (nodes || []).forEach((node) => {
            if (!node) return;
            const element = (typeof node === 'string') ? document.getElementById(node) : ui.getDomTreeNodeElement(node);
            if (!element) return;
            if (enabled) element.classList.add(className);
            else element.classList.remove(className);
        });
    },
    setFlowHighlight: (elements, enabled) => {
        if (!ui.showDataFlow || !ui.showFlowLine) {
            (elements || []).forEach((element) => {
                const flowElement = getFlowVisualElement(element);
                if (flowElement) flowElement.classList.remove('flow-link-highlight');
            });
            return;
        }
        (elements || []).forEach((element) => {
            const flowElement = getFlowVisualElement(element);
            if (!flowElement) return;
            if (enabled) flowElement.classList.add('flow-link-highlight');
            else flowElement.classList.remove('flow-link-highlight');
        });
    },
    animateWithFlowHighlight: async (sourceEl, destinationEl, flyCallback) => {
        if (!sourceEl || !destinationEl || typeof flyCallback !== 'function') return;
        if (!ui.showDataFlow) {
            const guide = createFlowGuideLine(sourceEl, destinationEl, ui.showFlowLine);
            const expandDuration = Math.min(180, Math.max(110, ui.baseDelay * 0.2));
            const holdDuration = Math.min(220, Math.max(120, ui.baseDelay * 0.2));
            const collapseDuration = Math.min(160, Math.max(90, ui.baseDelay * 0.16));
            await guide.expand(expandDuration);
            await ui.wait(holdDuration);
            await flyCallback();
            await ui.wait(holdDuration);
            await guide.collapse(collapseDuration);
            guide.stop();
            return;
        }
        ui.setFlowHighlight([sourceEl, destinationEl], true);
        await ui.wait(90);
        await flyCallback();
        await ui.wait(90);
        ui.setFlowHighlight([sourceEl, destinationEl], false);
        await ui.wait(120);
    },
    triggerMemoryFlash: (rowEl, type = 'write') => {
        if (!rowEl || !type) return;
        const className = `flash-${type}`;
        rowEl.classList.remove(className);
        // Force reflow so repeated writes re-trigger animation.
        void rowEl.offsetWidth;
        rowEl.classList.add(className);
    },
    animateDomReadToToken: async (node, tokenId, replacementValue = undefined, tokenGroupIds = [], property = '') => {
        if (ui.isStopping || !node || !tokenId) return;
        if (ui.skipMode) {
            await ui.ensureDrawerOpen('dom');
            return;
        }
        await ui.ensureDrawerOpen('dom');
        await ui.wait(220);
        ui.renderDomPanel();
        const startEl = ui.getDomTreeNodeElement(node);
        const expressionIds = (tokenGroupIds && tokenGroupIds.length > 0) ? tokenGroupIds : [tokenId];
        const expressionTarget = ui.createCodeExpressionTarget(expressionIds);
        const tokenEl = expressionTarget.target || document.getElementById(tokenId);
        if (!startEl || !tokenEl) {
            expressionTarget.clear();
            return;
        }
        const attrEls = ui.getDomAttributeElements(startEl, property);
        startEl.scrollIntoView({ behavior: 'auto', block: 'center' });
        ui.setDomAttributeHighlight(attrEls, true);
        try {
            await ui.wait(180);
            const shouldFlyAttributeValue = attrEls.length > 0 && !['innerText', 'innerHTML', 'textContent'].includes(String(property || ''));
            const sourceEl = shouldFlyAttributeValue ? (attrEls[0] || startEl) : startEl;
            await ui.animateWithFlowHighlight(sourceEl, tokenEl, async () => {
                if (shouldFlyAttributeValue) {
                    await ui.flyHelper(replacementValue, sourceEl, tokenEl, false);
                } else {
                    const flyValue = (replacementValue !== undefined) ? replacementValue : node;
                    await ui.flyHelper(flyValue, startEl, tokenEl, false);
                }
            });
            if (replacementValue !== undefined) ui.replaceTokenText(tokenId, replacementValue, true);
            await ui.wait(120);
        } finally {
            ui.setDomAttributeHighlight(attrEls, false);
            expressionTarget.clear();
        }
    },
    animateTokenToDomNode: async (tokenId, node, value = null) => {
        if (ui.isStopping || !tokenId || !node) return;
        if (ui.skipMode) {
            await ui.ensureDrawerOpen('dom');
            return;
        }
        const tokenEl = document.getElementById(tokenId);
        const target = ui.getDomTreeNodeElement(node);
        if (!tokenEl || !target) return;
        target.scrollIntoView({ behavior: 'auto', block: 'center' });
        await ui.animateWithFlowHighlight(tokenEl, target, async () => {
            await ui.flyHelper(value === null ? formatValue(node) : value, tokenEl, target, false);
        });
    },
    animateDomMutation: async (targetNode, sourceTokenId = null, payload = null) => {
        if (ui.isStopping || !targetNode) return;
        if (ui.skipMode) {
            await ui.ensureDrawerOpen('dom');
            return;
        }
        await ui.ensureDrawerOpen('dom');
        await ui.wait(220);
        ui.renderDomPanel();
        if (sourceTokenId) {
            await ui.animateTokenToDomNode(sourceTokenId, targetNode, payload);
        } else {
            await ui.highlightDomNode(targetNode);
        }
    },
    flyDomNodeFromToken: async (node, startEl, endEl, delayStart = true) => {
        if (!node || !startEl || !endEl || ui.isStopping) return;
        if (!ui.showDataFlow) return;
        const guide = createFlowGuideLine(startEl, endEl, ui.showFlowLine);
        try {
            endEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await ui.wait(600);
            if (ui.isStopping) return;
            const start = startEl.getBoundingClientRect();
            const end = endEl.getBoundingClientRect();
            if (start.top < 0 || end.top < 0) return;
            const flyer = createDomFlyBadgeElement(node);
            flyer.classList.add('flying-dom-node');
            document.body.appendChild(flyer);
            flyer.style.position = 'fixed';
            flyer.style.pointerEvents = 'none';
            flyer.style.zIndex = '12060';
            flyer.style.margin = '0';
            flyer.style.display = 'inline-flex';
            flyer.style.width = 'max-content';
            flyer.style.maxWidth = 'none';
            const fRect = flyer.getBoundingClientRect();
            const startX = start.left + (start.width - fRect.width) / 2;
            const startY = start.top + (start.height - fRect.height) / 2;
            flyer.style.left = `${startX}px`;
            flyer.style.top = `${startY}px`;
            if (delayStart) await ui.wait(150);
            if (ui.isStopping) { flyer.remove(); return; }
            const endX = end.left + (end.width - fRect.width) / 2;
            const endY = end.top + (end.height - fRect.height) / 2;
            const dx = endX - startX;
            const dy = endY - startY;
            await ui.wait(20);
            flyer.style.transition = `transform ${ui.baseDelay / ui.speedMultiplier}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${ui.baseDelay / ui.speedMultiplier}ms ease`;
            flyer.style.transform = `translate(${dx}px, ${dy}px) scale(0.95)`;
            flyer.style.opacity = '0.95';
            await ui.wait(ui.baseDelay);
            await ui.wait(100);
            flyer.remove();
        } finally {
            guide.stop();
        }
    },
    animateDomPropertyMutation: async ({ targetNode, sourceTokenId = null, payload = null, property = '', applyMutation = null }) => {
        if (ui.isStopping || !targetNode) {
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        if (ui.skipMode) {
            await ui.ensureDrawerOpen('dom');
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        await ui.ensureDrawerOpen('dom');
        await ui.wait(220);
        ui.renderDomPanel();
        let targetEl = ui.getDomTreeNodeElement(targetNode);
        if (!targetEl) {
            if (typeof applyMutation === 'function') await applyMutation();
            ui.renderDomPanel();
            return;
        }
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await ui.wait(420);
        ui.renderDomPanel();
        targetEl = ui.getDomTreeNodeElement(targetNode);
        if (!targetEl) {
            if (typeof applyMutation === 'function') await applyMutation();
            ui.renderDomPanel();
            return;
        }
        const sourceEl = sourceTokenId ? document.getElementById(sourceTokenId) : null;
        const replacedNodes = (property === 'innerText' || property === 'innerHTML') ? (targetNode.children || []) : [];
        const replacedEls = replacedNodes.flatMap((child) => ui.getDomTreeSubtreeElements(child));
        const attrEls = ui.getDomAttributeElements(targetEl, property);
        const useGroupedReplacement = property === 'innerText' || property === 'innerHTML';
        const groupHighlight = (useGroupedReplacement && replacedEls.length > 0) ? ui.createDomGroupHighlight(replacedEls) : { box: null, clear: () => {} };
        const insertionTarget = ((property === 'innerText' || property === 'innerHTML') && replacedEls.length === 0)
            ? (() => {
                const placeholder = document.createElement('div');
                placeholder.className = 'dom-tree-node dom-insert-target dom-insert-space';
                placeholder.innerHTML = '<span class="dom-tree-attr">insertion</span>';
                targetEl.insertAdjacentElement('afterend', placeholder);
                return placeholder;
            })()
            : null;
        const flyTarget = groupHighlight.box || insertionTarget || targetEl;
        const flowEls = [sourceEl, targetEl].filter(Boolean);
        targetEl.classList.add('dom-parent-highlight');
        if (!groupHighlight.box) replacedEls.forEach((nodeEl) => nodeEl.classList.add('dom-replaced-highlight'));
        ui.setDomAttributeHighlight(attrEls, true);
        if (replacedEls.length > 0 && !groupHighlight.box) flyTarget.classList.add('dom-insert-space');
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, true);
        await ui.wait(220);
        if (sourceEl) await ui.flyHelper(payload, sourceEl, flyTarget, false);
        await ui.wait(220);
        if (typeof applyMutation === 'function') await applyMutation();
        ui.renderDomPanel();
        const refreshedTarget = ui.getDomTreeNodeElement(targetNode);
        const refreshedAttrEls = ui.getDomAttributeElements(refreshedTarget, property);
        if (refreshedTarget) refreshedTarget.classList.add('dom-parent-highlight');
        ui.setDomAttributeHighlight(refreshedAttrEls, true);
        await ui.wait(240);
        targetEl.classList.remove('dom-parent-highlight');
        if (!groupHighlight.box) flyTarget.classList.remove('dom-insert-space');
        replacedEls.forEach((nodeEl) => nodeEl.classList.remove('dom-replaced-highlight'));
        groupHighlight.clear();
        if (refreshedTarget) refreshedTarget.classList.remove('dom-parent-highlight');
        ui.setDomAttributeHighlight(attrEls, false);
        ui.setDomAttributeHighlight(refreshedAttrEls, false);
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, false);
        await ui.wait(120);
    },
    animateDomAppendMutation: async ({ parentNode, childNode = null, sourceTokenId = null, applyMutation = null }) => {
        if (ui.isStopping || !parentNode) {
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        if (ui.skipMode) {
            await ui.ensureDrawerOpen('dom');
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        await ui.ensureDrawerOpen('dom');
        await ui.wait(220);
        ui.renderDomPanel();
        const parentEl = ui.getDomTreeNodeElement(parentNode);
        if (!parentEl) {
            if (typeof applyMutation === 'function') await applyMutation();
            ui.renderDomPanel();
            return;
        }
        const sourceEl = sourceTokenId ? document.getElementById(sourceTokenId) : null;
        const insertionTarget = document.createElement('div');
        insertionTarget.className = 'dom-tree-node dom-insert-target dom-insert-space';
        insertionTarget.innerHTML = '<span class="dom-tree-attr">append</span>';
        const parentIndent = parseFloat(parentEl.style.marginLeft || getComputedStyle(parentEl).marginLeft || '0') || 0;
        const childIndent = parentIndent + 18;
        insertionTarget.style.marginLeft = `${childIndent}px`;
        insertionTarget.style.width = `calc(100% - ${childIndent}px)`;
        parentEl.insertAdjacentElement('afterend', insertionTarget);
        const flowEls = [sourceEl, parentEl].filter(Boolean);
        parentEl.scrollIntoView({ behavior: 'auto', block: 'center' });
        parentEl.classList.add('dom-parent-highlight');
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, true);
        await ui.wait(220);
        if (sourceEl) {
            if (childNode && (childNode.__domType === 'element' || childNode.__domType === 'text')) await ui.flyDomNodeFromToken(childNode, sourceEl, insertionTarget, false);
            else await ui.flyHelper(childNode, sourceEl, insertionTarget, false);
        }
        await ui.wait(120);
        if (typeof applyMutation === 'function') await applyMutation();
        ui.renderDomPanel();
        const refreshedParent = ui.getDomTreeNodeElement(parentNode);
        const newChildEl = childNode ? ui.getDomTreeNodeElement(childNode) : null;
        if (refreshedParent) refreshedParent.classList.add('dom-parent-highlight');
        if (newChildEl) newChildEl.classList.add('dom-highlight');
        await ui.wait(260);
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, false);
        parentEl.classList.remove('dom-parent-highlight');
        insertionTarget.remove();
        if (refreshedParent) {
            refreshedParent.classList.remove('dom-parent-highlight');
            refreshedParent.classList.remove('dom-insert-space');
        }
        if (newChildEl) newChildEl.classList.remove('dom-highlight');
        await ui.wait(120);
    },
    animateDomRemoveMutation: async ({ parentNode, removedNode = null, sourceTokenId = null, applyMutation = null }) => {
        if (ui.isStopping || !parentNode) {
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        if (ui.skipMode) {
            await ui.ensureDrawerOpen('dom');
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        await ui.ensureDrawerOpen('dom');
        await ui.wait(220);
        ui.renderDomPanel();
        let parentEl = ui.getDomTreeNodeElement(parentNode);
        if (!parentEl) {
            if (typeof applyMutation === 'function') await applyMutation();
            ui.renderDomPanel();
            return;
        }
        parentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await ui.wait(420);
        ui.renderDomPanel();
        parentEl = ui.getDomTreeNodeElement(parentNode);
        if (!parentEl) {
            if (typeof applyMutation === 'function') await applyMutation();
            ui.renderDomPanel();
            return;
        }
        const removedEl = removedNode ? ui.getDomTreeNodeElement(removedNode) : null;
        const removedSubtreeEls = removedNode ? ui.getDomTreeSubtreeElements(removedNode) : [];
        const removedGroup = removedSubtreeEls.length > 0 ? ui.createDomGroupHighlight(removedSubtreeEls) : { box: null, clear: () => {} };
        const removeTarget = removedGroup.box || removedEl || parentEl;
        const sourceEl = sourceTokenId ? document.getElementById(sourceTokenId) : null;
        const flowEls = [sourceEl, removeTarget].filter(Boolean);
        parentEl.classList.add('dom-parent-highlight');
        if (!removedGroup.box && removedEl) removedEl.classList.add('dom-replaced-highlight');
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, true);
        await ui.wait(220);
        if (sourceEl && removedNode) await ui.flyDomNodeFromToken(removedNode, sourceEl, removeTarget, false);
        if (removeTarget) {
            removeTarget.classList.add('dom-remove-leave');
            await ui.wait(340);
        }
        if (typeof applyMutation === 'function') await applyMutation();
        ui.renderDomPanel();
        const refreshedParent = ui.getDomTreeNodeElement(parentNode);
        if (refreshedParent) refreshedParent.classList.add('dom-parent-highlight');
        await ui.wait(220);
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, false);
        parentEl.classList.remove('dom-parent-highlight');
        if (removedEl) removedEl.classList.remove('dom-replaced-highlight');
        if (removeTarget) removeTarget.classList.remove('dom-remove-leave');
        removedGroup.clear();
        if (refreshedParent) refreshedParent.classList.remove('dom-parent-highlight');
        await ui.wait(120);
    },
    animateDetachedDomPropertyMutation: async ({ targetNode, sourceTokenId = null, payload = null, property = '', applyMutation = null }) => {
        if (ui.isStopping || !targetNode) {
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        if (ui.skipMode) {
            await ui.ensureDrawerOpen('memory');
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        await ui.ensureDrawerOpen('memory');
        await ui.wait(180);
        const portalPanel = ui.openDetachedDomPortal(targetNode, 'Noeud hors DOM');
        if (!portalPanel) {
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        await ui.wait(200);
        const sourceEl = sourceTokenId ? document.getElementById(sourceTokenId) : null;
        const targetEl = ui.getDomTreeNodeElement(targetNode, portalPanel);
        if (!targetEl) {
            if (typeof applyMutation === 'function') await applyMutation();
            ui.hideDetachedDomPortal();
            return;
        }
        const replacedNodes = (property === 'innerText' || property === 'innerHTML' || property === 'textContent') ? (targetNode.children || []) : [];
        const replacedEls = replacedNodes.flatMap((child) => ui.getDomTreeSubtreeElements(child, portalPanel));
        const attrEls = ui.getDomAttributeElements(targetEl, property);
        const useGroupedReplacement = (property === 'innerText' || property === 'innerHTML' || property === 'textContent');
        const groupHighlight = (useGroupedReplacement && replacedEls.length > 0) ? ui.createDomGroupHighlight(replacedEls) : { box: null, clear: () => {} };
        const insertionTarget = (useGroupedReplacement && replacedEls.length === 0)
            ? (() => {
                const placeholder = document.createElement('div');
                placeholder.className = 'dom-tree-node dom-insert-target dom-insert-space detached-dom-placeholder';
                placeholder.innerHTML = '<span class="dom-tree-attr">insertion</span>';
                targetEl.insertAdjacentElement('afterend', placeholder);
                return placeholder;
            })()
            : null;
        const flyTarget = groupHighlight.box || insertionTarget || targetEl;
        const flowEls = [sourceEl, targetEl].filter(Boolean);
        targetEl.classList.add('dom-parent-highlight');
        if (!groupHighlight.box) replacedEls.forEach((nodeEl) => nodeEl.classList.add('dom-replaced-highlight'));
        ui.setDomAttributeHighlight(attrEls, true);
        if (replacedEls.length > 0 && !groupHighlight.box) flyTarget.classList.add('dom-insert-space');
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, true);
        await ui.wait(200);
        if (sourceEl) await ui.flyHelper(payload, sourceEl, flyTarget, false);
        await ui.wait(180);
        if (typeof applyMutation === 'function') await applyMutation();
        ui.renderDetachedDomPortalTree(targetNode);
        const refreshedTarget = ui.getDomTreeNodeElement(targetNode, portalPanel);
        const refreshedAttrEls = ui.getDomAttributeElements(refreshedTarget, property);
        if (refreshedTarget) refreshedTarget.classList.add('dom-parent-highlight');
        ui.setDomAttributeHighlight(refreshedAttrEls, true);
        await ui.wait(240);
        targetEl.classList.remove('dom-parent-highlight');
        if (!groupHighlight.box) flyTarget.classList.remove('dom-insert-space');
        replacedEls.forEach((nodeEl) => nodeEl.classList.remove('dom-replaced-highlight'));
        groupHighlight.clear();
        if (insertionTarget) insertionTarget.remove();
        if (refreshedTarget) refreshedTarget.classList.remove('dom-parent-highlight');
        ui.setDomAttributeHighlight(attrEls, false);
        ui.setDomAttributeHighlight(refreshedAttrEls, false);
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, false);
        await ui.wait(160);
        ui.hideDetachedDomPortal();
    },
    animateDetachedDomAppendMutation: async ({ parentNode, childNode = null, sourceTokenId = null, applyMutation = null }) => {
        if (ui.isStopping || !parentNode) {
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        if (ui.skipMode) {
            await ui.ensureDrawerOpen('memory');
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        await ui.ensureDrawerOpen('memory');
        await ui.wait(180);
        const portalPanel = ui.openDetachedDomPortal(parentNode, 'Noeud hors DOM');
        if (!portalPanel) {
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        await ui.wait(200);
        const parentEl = ui.getDomTreeNodeElement(parentNode, portalPanel);
        if (!parentEl) {
            if (typeof applyMutation === 'function') await applyMutation();
            ui.hideDetachedDomPortal();
            return;
        }
        const sourceEl = sourceTokenId ? document.getElementById(sourceTokenId) : null;
        const insertionTarget = document.createElement('div');
        insertionTarget.className = 'dom-tree-node dom-insert-target dom-insert-space detached-dom-placeholder';
        insertionTarget.innerHTML = '<span class="dom-tree-attr">append</span>';
        const parentIndent = parseFloat(parentEl.style.marginLeft || getComputedStyle(parentEl).marginLeft || '0') || 0;
        const childIndent = parentIndent + 18;
        insertionTarget.style.marginLeft = `${childIndent}px`;
        insertionTarget.style.width = `calc(100% - ${childIndent}px)`;
        parentEl.insertAdjacentElement('afterend', insertionTarget);
        const flowEls = [sourceEl, parentEl].filter(Boolean);
        parentEl.classList.add('dom-parent-highlight');
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, true);
        await ui.wait(200);
        if (sourceEl) {
            if (childNode && (childNode.__domType === 'element' || childNode.__domType === 'text')) await ui.flyDomNodeFromToken(childNode, sourceEl, insertionTarget, false);
            else await ui.flyHelper(childNode, sourceEl, insertionTarget, false);
        }
        await ui.wait(120);
        if (typeof applyMutation === 'function') await applyMutation();
        ui.renderDetachedDomPortalTree(parentNode);
        const refreshedParent = ui.getDomTreeNodeElement(parentNode, portalPanel);
        const newChildEl = childNode ? ui.getDomTreeNodeElement(childNode, portalPanel) : null;
        if (refreshedParent) refreshedParent.classList.add('dom-parent-highlight');
        if (newChildEl) newChildEl.classList.add('dom-highlight');
        await ui.wait(260);
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, false);
        parentEl.classList.remove('dom-parent-highlight');
        insertionTarget.remove();
        if (refreshedParent) refreshedParent.classList.remove('dom-parent-highlight');
        if (newChildEl) newChildEl.classList.remove('dom-highlight');
        await ui.wait(140);
        ui.hideDetachedDomPortal();
    },
    animateDetachedDomRemoveMutation: async ({ parentNode, removedNode = null, sourceTokenId = null, applyMutation = null }) => {
        if (ui.isStopping || !parentNode) {
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        if (ui.skipMode) {
            await ui.ensureDrawerOpen('memory');
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        await ui.ensureDrawerOpen('memory');
        await ui.wait(180);
        const portalPanel = ui.openDetachedDomPortal(parentNode, 'Noeud hors DOM');
        if (!portalPanel) {
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        await ui.wait(200);
        const parentEl = ui.getDomTreeNodeElement(parentNode, portalPanel);
        if (!parentEl) {
            if (typeof applyMutation === 'function') await applyMutation();
            ui.hideDetachedDomPortal();
            return;
        }
        const removedEl = removedNode ? ui.getDomTreeNodeElement(removedNode, portalPanel) : null;
        const removedSubtreeEls = removedNode ? ui.getDomTreeSubtreeElements(removedNode, portalPanel) : [];
        const removedGroup = removedSubtreeEls.length > 0 ? ui.createDomGroupHighlight(removedSubtreeEls) : { box: null, clear: () => {} };
        const removeTarget = removedGroup.box || removedEl || parentEl;
        const sourceEl = sourceTokenId ? document.getElementById(sourceTokenId) : null;
        const flowEls = [sourceEl, removeTarget].filter(Boolean);
        parentEl.classList.add('dom-parent-highlight');
        if (!removedGroup.box && removedEl) removedEl.classList.add('dom-replaced-highlight');
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, true);
        await ui.wait(200);
        if (sourceEl && removedNode) await ui.flyDomNodeFromToken(removedNode, sourceEl, removeTarget, false);
        if (removeTarget) {
            removeTarget.classList.add('dom-remove-leave');
            await ui.wait(300);
        }
        if (typeof applyMutation === 'function') await applyMutation();
        ui.renderDetachedDomPortalTree(parentNode);
        const refreshedParent = ui.getDomTreeNodeElement(parentNode, portalPanel);
        if (refreshedParent) refreshedParent.classList.add('dom-parent-highlight');
        await ui.wait(220);
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, false);
        parentEl.classList.remove('dom-parent-highlight');
        if (removedEl) removedEl.classList.remove('dom-replaced-highlight');
        if (removeTarget) removeTarget.classList.remove('dom-remove-leave');
        removedGroup.clear();
        if (refreshedParent) refreshedParent.classList.remove('dom-parent-highlight');
        await ui.wait(150);
        ui.hideDetachedDomPortal();
    },
    renderDomPanel: () => {
        const container = document.getElementById('view-dom');
        const treeView = document.getElementById('dom-view-tree');
        const renderView = document.getElementById('dom-view-render');
        if (!treeView || !container || !renderView) return;

        container.classList.toggle('show-render', ui.showDomRender);
        ui.updateDomRenderToggleControl();
        ui.updateP5PanelsLayout();

        if (ui.p5ModeEnabled) {
            treeView.innerHTML = '<div class="dom-tree-empty">Mode p5.js actif. Le rendu est affiche sous la memoire.</div>';
            renderView.innerHTML = '';
            return;
        }

        treeView.innerHTML = ui.domDocument ? buildDomTreeMarkup(ui.domDocument.body, 0) : '<div class="dom-tree-empty">Aucun document HTML charge.</div>';
        if (!ui.showDomRender) {
            renderView.innerHTML = '';
            return;
        }
        const iframe = document.createElement('iframe');
        iframe.className = 'dom-render-frame';
        iframe.setAttribute('title', 'Apercu HTML');
        iframe.setAttribute('sandbox', 'allow-same-origin');
        iframe.addEventListener('load', () => {
            try {
                const frameDoc = iframe.contentDocument;
                if (!frameDoc) return;
                frameDoc.addEventListener('click', (event) => {
                    const rawTarget = event.target;
                    if (!rawTarget || rawTarget.nodeType !== 1) return;
                    const target = rawTarget.closest('[data-vdom-path]');
                    if (!target) return;
                    const tag = String(target.tagName || '').toLowerCase();
                    if (!['input', 'textarea', 'select', 'option'].includes(tag)) {
                        event.preventDefault();
                    }
                    const path = target.getAttribute('data-vdom-path') || '';
                    if (window.app && typeof window.app.dispatchDomClick === 'function') {
                        window.app.dispatchDomClick(path);
                    }
                });
                const syncInputValue = (event) => {
                    const rawTarget = event.target;
                    if (!rawTarget || rawTarget.nodeType !== 1) return;
                    const target = rawTarget.closest('[data-vdom-path]');
                    if (!target) return;
                    const tag = String(target.tagName || '').toLowerCase();
                    if (!['input', 'textarea', 'select'].includes(tag)) return;
                    const path = target.getAttribute('data-vdom-path') || '';
                    const nextValue = ('value' in target)
                        ? String(target.value ?? '')
                        : '';
                    if (window.app && typeof window.app.dispatchDomInput === 'function') {
                        window.app.dispatchDomInput(path, nextValue);
                    } else {
                        ui.updateDomInputValue(path, nextValue);
                    }
                };
                frameDoc.addEventListener('input', syncInputValue, true);
                frameDoc.addEventListener('change', syncInputValue, true);
            } catch (error) {
                // noop
            }
        });
        iframe.srcdoc = buildDomPreviewDocument(ui.domDocument, ui.domCss);
        renderView.innerHTML = '';
        renderView.appendChild(iframe);
    },
    });
};
