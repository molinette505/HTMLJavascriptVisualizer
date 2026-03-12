// @ts-nocheck

export function attachTooltipMethods(ui, deps) {
    const {
        getCodePreviewTypeLabel,
        isVirtualDomValue,
        buildDomTreeMarkup,
        valueToCodePreviewText,
        escapeHtml,
        getMemoryTypeLabel,
        valueToVisualText,
        buildMemoryMetaHtml,
        wrapMemoryValueMarkup,
    } = deps;

    Object.assign(ui, {
        initCodeValueTooltip: () => {
            if (ui.codeValueTooltipBound) return;
            const display = document.getElementById('code-display');
            if (!display) return;
            ui.codeValueTooltipBound = true;
            const hoverSupported = window.matchMedia ? window.matchMedia('(hover: hover)').matches : true;
            const getTokenData = (target) => {
                if (!target || !target.closest) return null;
                const tokenEl = target.closest('span[data-code-token-id]');
                if (!tokenEl) return null;
                const tokenId = tokenEl.dataset.codeTokenId || tokenEl.id;
                if (tokenId && ui.currentPropertyTokenSnapshot.has(tokenId)) {
                    const propertySnapshot = ui.currentPropertyTokenSnapshot.get(tokenId);
                    return {
                        tokenEl,
                        label: propertySnapshot.label,
                        snapshot: propertySnapshot.snapshot
                    };
                }
                const varName = tokenEl.dataset.codeVar;
                if (!varName) return null;
                const snapshot = ui.currentMemoryVarSnapshot.get(varName);
                if (!snapshot) return null;
                return { tokenEl, label: varName, snapshot };
            };
            if (hoverSupported) {
                display.addEventListener('mouseover', (event) => {
                    const data = getTokenData(event.target);
                    if (!data) return;
                    ui.showCodeValueTooltip(data.label, data.snapshot, data.tokenEl);
                });
                display.addEventListener('mouseout', (event) => {
                    const fromEl = event.target && event.target.closest ? event.target.closest('span[data-code-token-id]') : null;
                    if (!fromEl) return;
                    const toEl = event.relatedTarget && event.relatedTarget.closest ? event.relatedTarget.closest('span[data-code-token-id]') : null;
                    if (toEl === fromEl) return;
                    ui.hideCodeValueTooltip();
                });
            }
            display.addEventListener('click', (event) => {
                const data = getTokenData(event.target);
                if (!data) return;
                if (ui.codeValueTooltipEl && ui.codeValueTooltipAnchorEl === data.tokenEl) {
                    ui.hideCodeValueTooltip();
                    return;
                }
                ui.showCodeValueTooltip(data.label, data.snapshot, data.tokenEl);
            });
            document.addEventListener('pointerdown', (event) => {
                const target = event.target;
                if (!target || !target.closest) {
                    ui.hideCodeValueTooltip();
                    return;
                }
                if (target.closest('.code-value-tooltip')) return;
                if (target.closest('span[data-code-token-id]')) return;
                ui.hideCodeValueTooltip();
            });
            const codeWrapper = document.getElementById('code-wrapper');
            if (codeWrapper) {
                codeWrapper.addEventListener('scroll', () => {
                    if (!ui.codeValueTooltipEl || !ui.codeValueTooltipAnchorEl) return;
                    ui.positionCodeValueTooltip(ui.codeValueTooltipAnchorEl);
                }, { passive: true });
            }
            window.addEventListener('resize', () => {
                if (!ui.codeValueTooltipEl || !ui.codeValueTooltipAnchorEl) return;
                ui.positionCodeValueTooltip(ui.codeValueTooltipAnchorEl);
            });
        },
        showCodeValueTooltip: (label, snapshot, anchorEl) => {
            if (!label || !snapshot || !anchorEl || ui.isStopping) return;
            ui.hideCodeValueTooltip();
            const tooltip = document.createElement('div');
            const typeLabel = getCodePreviewTypeLabel(snapshot);
            const isDomPreview = typeLabel === 'dom-node' && isVirtualDomValue(snapshot.value);
            tooltip.className = `code-value-tooltip${isDomPreview ? ' is-dom' : ''}`;
            let valueMarkup = '';
            if (isDomPreview) {
                const previewNode = (snapshot.value.__domType === 'document' && snapshot.value.body) ? snapshot.value.body : snapshot.value;
                valueMarkup = `<div class="code-value-tooltip-dom">${buildDomTreeMarkup(previewNode, 0, false) || '<div class="dom-tree-empty">Apercu indisponible.</div>'}</div>`;
            } else {
                const valueText = valueToCodePreviewText(snapshot.value, snapshot.initialized, snapshot.functionAlias || null);
                valueMarkup = `<div class="code-value-tooltip-value">${escapeHtml(valueText)}</div>`;
            }
            tooltip.innerHTML = `<div class="code-value-tooltip-head"><div class="code-value-tooltip-name">${escapeHtml(label)}</div><div class="code-value-tooltip-type">${escapeHtml(typeLabel)}</div></div>${valueMarkup}`;
            document.body.appendChild(tooltip);
            ui.codeValueTooltipEl = tooltip;
            ui.codeValueTooltipAnchorEl = anchorEl;
            ui.positionCodeValueTooltip(anchorEl);
        },
        positionCodeValueTooltip: (anchorEl) => {
            const tooltip = ui.codeValueTooltipEl;
            if (!tooltip || !anchorEl || !anchorEl.getBoundingClientRect) return;
            const margin = 12;
            const anchorRect = anchorEl.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            let left = anchorRect.left + (anchorRect.width - tooltipRect.width) / 2;
            let top = anchorRect.bottom + 8;
            if (left < margin) left = margin;
            if (left + tooltipRect.width > viewportWidth - margin) left = viewportWidth - tooltipRect.width - margin;
            if (top + tooltipRect.height > viewportHeight - margin) top = anchorRect.top - tooltipRect.height - 8;
            if (top < margin) top = margin;
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        },
        hideCodeValueTooltip: () => {
            if (!ui.codeValueTooltipEl) return;
            ui.codeValueTooltipEl.remove();
            ui.codeValueTooltipEl = null;
            ui.codeValueTooltipAnchorEl = null;
        },
        setCodePropertySnapshot: (tokenId, propertyName, value) => {
            if (!tokenId) return;
            ui.currentPropertyTokenSnapshot.set(tokenId, {
                label: String(propertyName || 'property'),
                snapshot: {
                    value,
                    initialized: true,
                    functionAlias: null
                }
            });
        },
        hideMemoryArrayPortal: () => {
            if (typeof ui.memoryArrayPortalCleanup === 'function') {
                ui.memoryArrayPortalCleanup();
            }
            ui.memoryArrayPortalCleanup = null;
            if (!ui.memoryArrayPortalEl) return;
            const portal = ui.memoryArrayPortalEl;
            ui.memoryArrayPortalEl = null;
            portal.classList.add('is-closing');
            window.setTimeout(() => {
                if (portal.parentElement) portal.remove();
            }, 180);
        },
        hideDetachedDomPortal: () => {
            if (typeof ui.detachedDomPortalCleanup === 'function') {
                ui.detachedDomPortalCleanup();
            }
            ui.detachedDomPortalCleanup = null;
            ui.detachedDomPortalPanelEl = null;
            if (!ui.detachedDomPortalEl) return;
            const portal = ui.detachedDomPortalEl;
            ui.detachedDomPortalEl = null;
            portal.classList.add('is-closing');
            window.setTimeout(() => {
                if (portal.parentElement) portal.remove();
            }, 180);
        },
        getMemoryAnchorForDomNode: (node) => {
            if (!node) return null;
            for (const [valueId, previewNode] of ui.memoryDomPreviewRefs.entries()) {
                if (previewNode === node) {
                    const element = document.getElementById(valueId);
                    if (element) return element;
                }
            }
            return null;
        },
        renderDetachedDomPortalTree: (targetNode) => {
            const panel = ui.detachedDomPortalPanelEl;
            if (!panel) return;
            const body = panel.querySelector('.detached-dom-portal-body');
            if (!body) return;
            body.innerHTML = buildDomTreeMarkup(targetNode, 0, true, 'detached-dom-tree-node-') || '<div class="dom-tree-empty">Apercu indisponible.</div>';
        },
        openDetachedDomPortal: (targetNode, title = 'Noeud hors DOM') => {
            ui.hideDetachedDomPortal();
            const container = document.getElementById('memory-container');
            if (!container || !targetNode) return null;
            const portal = document.createElement('div');
            portal.className = 'detached-dom-portal';
            const panel = document.createElement('div');
            panel.className = 'detached-dom-portal-panel';
            const titleEl = document.createElement('div');
            titleEl.className = 'detached-dom-portal-title';
            titleEl.innerText = title;
            const body = document.createElement('div');
            body.className = 'detached-dom-portal-body';
            panel.appendChild(titleEl);
            panel.appendChild(body);
            portal.appendChild(panel);
            container.appendChild(portal);
            ui.detachedDomPortalEl = portal;
            ui.detachedDomPortalPanelEl = panel;
            ui.renderDetachedDomPortalTree(targetNode);

            const anchorEl = ui.getMemoryAnchorForDomNode(targetNode);
            const positionPanel = () => {
                if (!panel || !container) return;
                const panelRect = panel.getBoundingClientRect();
                const visibleTop = container.scrollTop + 8;
                const visibleBottom = container.scrollTop + container.clientHeight - panelRect.height - 8;
                let top = visibleTop;
                if (anchorEl) {
                    const containerRect = container.getBoundingClientRect();
                    const anchorRect = anchorEl.getBoundingClientRect();
                    const anchorCenter = (anchorRect.top - containerRect.top) + container.scrollTop + (anchorRect.height / 2);
                    top = anchorCenter - (panelRect.height / 2);
                }
                top = Math.max(visibleTop, Math.min(visibleBottom, top));
                panel.style.top = `${top}px`;
            };
            const onContainerScroll = () => positionPanel();
            container.addEventListener('scroll', onContainerScroll, { passive: true });
            ui.detachedDomPortalCleanup = () => {
                container.removeEventListener('scroll', onContainerScroll);
            };
            window.requestAnimationFrame(positionPanel);
            window.requestAnimationFrame(positionPanel);
            return panel;
        },
        openMemoryArrayPortal: (aliasVarName, ownerVarName, targetIndex = null) => {
            ui.hideMemoryArrayPortal();
            const container = document.getElementById('memory-container');
            if (!container) return null;
            const ownerSnapshot = ui.currentMemoryVarSnapshot.get(ownerVarName);
            if (!ownerSnapshot || !Array.isArray(ownerSnapshot.value)) return null;
            const ownerArray = ownerSnapshot.value;
            const targetIdx = Number.isFinite(Number(targetIndex)) ? Number(targetIndex) : null;
            const rowCount = targetIdx === null ? ownerArray.length : Math.max(ownerArray.length, targetIdx + 1);
            const portal = document.createElement('div');
            portal.className = 'memory-array-portal';
            const panel = document.createElement('div');
            panel.className = 'memory-array-portal-panel';
            const title = document.createElement('div');
            title.className = 'memory-array-portal-title';
            title.innerHTML = `<span class="mem-type">ref array</span><span class="memory-array-portal-title-text">${escapeHtml(ownerVarName)} length=${ownerArray.length}</span>`;
            panel.appendChild(title);
            const list = document.createElement('div');
            list.className = 'memory-array-portal-list';
            for (let index = 0; index < rowCount; index++) {
                const hasValue = Object.prototype.hasOwnProperty.call(ownerArray, index);
                const item = hasValue ? ownerArray[index] : undefined;
                const itemType = getMemoryTypeLabel(item, hasValue);
                const itemValue = !hasValue
                    ? 'empty'
                    : (Array.isArray(item) ? `length=${item.length}` : valueToVisualText(item));
                const row = document.createElement('div');
                const metaHtml = buildMemoryMetaHtml({
                    typeLabel: itemType,
                    address: '',
                    showType: ui.showMemoryTypes,
                    showAddress: false
                });
                row.className = `memory-cell array-element memory-array-portal-row ${metaHtml ? 'has-meta' : 'no-meta'}`;
                row.innerHTML = `${metaHtml}<span class="mem-name">[${index}]</span><span class="mem-val" data-portal-index="${index}">${wrapMemoryValueMarkup(escapeHtml(itemValue))}</span>`;
                if (targetIdx !== null && index === targetIdx) row.classList.add('portal-target');
                list.appendChild(row);
            }
            panel.appendChild(list);
            portal.appendChild(panel);
            container.appendChild(portal);
            ui.memoryArrayPortalEl = portal;
            const aliasValueEl = document.getElementById(`mem-header-${aliasVarName}`) || document.getElementById(`mem-val-${aliasVarName}`);
            const aliasRowEl = aliasValueEl ? aliasValueEl.closest('.memory-cell') : null;
            const positionPanel = () => {
                if (!panel || !container) return;
                const containerRect = container.getBoundingClientRect();
                const panelRect = panel.getBoundingClientRect();
                const anchorRect = aliasRowEl ? aliasRowEl.getBoundingClientRect() : null;
                const visibleTop = container.scrollTop + 8;
                const visibleBottom = container.scrollTop + container.clientHeight - panelRect.height - 8;
                let top = visibleTop;
                if (anchorRect) {
                    const anchorCenter = (anchorRect.top - containerRect.top) + container.scrollTop + (anchorRect.height / 2);
                    top = anchorCenter - (panelRect.height / 2);
                }
                const clampedTop = Math.max(visibleTop, Math.min(visibleBottom, top));
                panel.style.top = `${clampedTop}px`;
                if (anchorRect && panelRect.height > 0) {
                    const anchorCenter = (anchorRect.top - containerRect.top) + container.scrollTop + (anchorRect.height / 2);
                    const anchorYPercent = ((anchorCenter - clampedTop) / panelRect.height) * 100;
                    const bounded = Math.max(6, Math.min(94, anchorYPercent));
                    panel.style.setProperty('--memory-portal-anchor-y', `${bounded}%`);
                }
            };
            const onContainerScroll = () => positionPanel();
            container.addEventListener('scroll', onContainerScroll, { passive: true });
            ui.memoryArrayPortalCleanup = () => {
                container.removeEventListener('scroll', onContainerScroll);
            };
            window.requestAnimationFrame(positionPanel);
            window.requestAnimationFrame(positionPanel);
            let targetEl = null;
            if (targetIdx !== null) targetEl = portal.querySelector(`.mem-val[data-portal-index="${targetIdx}"]`);
            if (!targetEl) targetEl = portal.querySelector('.mem-val');
            return targetEl;
        },
        resolveMemoryValueTarget: (varName, index = null) => {
            const valueElementId = ui.getMemoryValueElementId(varName, index);
            let memEl = document.getElementById(valueElementId);
            let closePortal = () => {};
            if (!memEl && index !== null && index !== undefined) {
                const snapshot = ui.currentMemoryVarSnapshot.get(varName);
                const ownerName = snapshot && snapshot.arrayOwner ? snapshot.arrayOwner : null;
                if (ownerName) {
                    ui.ensureVisible(`mem-header-${varName}`);
                    memEl = ui.openMemoryArrayPortal(varName, ownerName, index);
                    closePortal = () => ui.hideMemoryArrayPortal();
                }
            }
            return { memEl, closePortal };
        },
        initMemoryDomTooltip: () => {
            if (ui.memoryDomTooltipBound) return;
            const container = document.getElementById('memory-container');
            if (!container) return;
            ui.memoryDomTooltipBound = true;
            const hoverSupported = window.matchMedia ? window.matchMedia('(hover: hover)').matches : true;
            if (hoverSupported) {
                container.addEventListener('mouseover', (event) => {
                    const target = event.target && event.target.closest ? event.target.closest('.mem-val[data-dom-preview="true"]') : null;
                    if (!target) return;
                    const previewId = target.dataset.domPreviewId;
                    const node = previewId ? ui.memoryDomPreviewRefs.get(previewId) : null;
                    if (!node) return;
                    ui.showMemoryDomTooltip(node, { anchorEl: target });
                });
                container.addEventListener('mouseout', (event) => {
                    const fromEl = event.target && event.target.closest ? event.target.closest('.mem-val[data-dom-preview="true"]') : null;
                    if (!fromEl) return;
                    const toEl = event.relatedTarget && event.relatedTarget.closest ? event.relatedTarget.closest('.mem-val[data-dom-preview="true"]') : null;
                    if (toEl === fromEl) return;
                    ui.hideMemoryDomTooltip();
                });
            }
            container.addEventListener('click', (event) => {
                const target = event.target && event.target.closest ? event.target.closest('.mem-val[data-dom-preview="true"]') : null;
                if (!target) return;
                const previewId = target.dataset.domPreviewId;
                const node = previewId ? ui.memoryDomPreviewRefs.get(previewId) : null;
                if (!node) return;
                if (ui.memoryDomTooltipEl && ui.memoryDomTooltipAnchorEl === target) {
                    ui.hideMemoryDomTooltip();
                    return;
                }
                ui.showMemoryDomTooltip(node, { anchorEl: target });
            });
            container.addEventListener('scroll', () => {
                if (!ui.memoryDomTooltipEl || !ui.memoryDomTooltipAnchorEl) return;
                ui.positionMemoryDomTooltip(ui.memoryDomTooltipAnchorEl);
            }, { passive: true });
            document.addEventListener('pointerdown', (event) => {
                const target = event.target;
                if (!target || !target.closest) {
                    ui.hideMemoryDomTooltip();
                    return;
                }
                if (target.closest('.mem-val[data-dom-preview="true"]')) return;
                ui.hideMemoryDomTooltip();
            });
            window.addEventListener('resize', () => {
                if (!ui.memoryDomTooltipEl || !ui.memoryDomTooltipAnchorEl) return;
                ui.positionMemoryDomTooltip(ui.memoryDomTooltipAnchorEl);
            });
        },
        showMemoryDomTooltip: (node, options = {}) => {
            if (!node || ui.isStopping) return;
            ui.hideMemoryDomTooltip();
            const previewNode = (node.__domType === 'document' && node.body) ? node.body : node;
            const tooltip = document.createElement('div');
            tooltip.className = 'memory-dom-tooltip';
            tooltip.innerHTML = buildDomTreeMarkup(previewNode, 0, false) || '<div class="dom-tree-empty">Apercu indisponible.</div>';
            document.body.appendChild(tooltip);
            ui.memoryDomTooltipEl = tooltip;
            ui.memoryDomTooltipAnchorEl = options.anchorEl || null;
            ui.positionMemoryDomTooltip(ui.memoryDomTooltipAnchorEl, options.clientX, options.clientY);
        },
        positionMemoryDomTooltip: (anchorEl = null, x = 0, y = 0) => {
            const tooltip = ui.memoryDomTooltipEl;
            if (!tooltip) return;
            const margin = 14;
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const rect = tooltip.getBoundingClientRect();
            let left;
            let top;
            if (anchorEl && anchorEl.getBoundingClientRect) {
                const anchorRect = anchorEl.getBoundingClientRect();
                left = anchorRect.left + (anchorRect.width - rect.width) / 2;
                top = anchorRect.bottom + 8;
            } else {
                left = x + 16;
                top = y + 16;
            }
            if (left < margin) left = margin;
            if (left + rect.width > viewportWidth - margin) left = viewportWidth - rect.width - margin;
            if (top + rect.height > viewportHeight - margin) top = viewportHeight - rect.height - margin;
            if (top < margin) top = margin;
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        },
        hideMemoryDomTooltip: () => {
            if (!ui.memoryDomTooltipEl) return;
            ui.memoryDomTooltipEl.remove();
            ui.memoryDomTooltipEl = null;
            ui.memoryDomTooltipAnchorEl = null;
        },
    });
}
