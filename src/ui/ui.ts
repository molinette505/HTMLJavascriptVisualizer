// @ts-nocheck
import { TokenType } from '../core/language';
import { formatValue } from '../core/config';
import { isVirtualDomValue } from '../core/virtualDom';
import { refreshIcons } from './icons';
import {
    escapeHtml,
    classNameForTokenType,
    renderTemplateStringValue,
    renderHtmlCode,
    renderCssCode
} from './markup';
import {
    valueToVisualText,
    valueToCodeVisualText,
    valueToCodePreviewText,
    getCodePreviewTypeLabel,
    getMemoryTypeLabel,
    buildMemoryMetaHtml,
    wrapMemoryValueMarkup,
    applyToggleButtonState
} from './valueFormatting';
import { createConsoleValueNode, filterRuntimeStack } from './consoleTree';
import {
    resolveVirtualDomNodeByPath,
    buildDomPreviewDocument,
    getDomTreeRef,
    buildDomTreeMarkup,
    buildDomInlineValueMarkup,
    mapDomPropertyToAttr,
    createDomFlyBadgeElement
} from './domHelpers';
import { getFlowVisualElement, createFlowGuideLine } from './flowGuide';
import { attachExecutionControls } from './executionControls';
import { attachDomMethods } from './domAnimationPanel';
import { attachMemoryMethods } from './memoryPanel';
import { attachTokenAnimationMethods } from './tokenAnimations';

export const ui = {
    modifiedTokens: new Map(), lockedTokens: new Set(), 
    speedMultiplier: 1, baseDelay: 800, globalScale: 14, 
    skipMode: false, isDrawerOpen: false, isStopping: false,
    currentWaitResolver: null,
    heapRefs: new WeakMap(),
    heapRefCounter: 1,
    currentMemoryVarSnapshot: new Map(),
    currentPropertyTokenSnapshot: new Map(),
    memoryDomPreviewRefs: new Map(),
    memoryDomTooltipEl: null,
    memoryDomTooltipAnchorEl: null,
    memoryDomTooltipBound: false,
    memoryArrayPortalEl: null,
    memoryArrayPortalCleanup: null,
    detachedDomPortalEl: null,
    detachedDomPortalPanelEl: null,
    detachedDomPortalCleanup: null,
    codeValueTooltipEl: null,
    codeValueTooltipAnchorEl: null,
    codeValueTooltipBound: false,
    domDocument: null,
    domCss: '',
    p5ModeEnabled: false,
    p5RuntimeSrcdoc: '',
    p5RuntimeKey: '',
    domViewMode: 'tree',
    showDomRender: true,
    readVisualizationMode: 'both',
    showFlowLine: true,
    showDataFlow: true,
    showMemoryTypes: false,
    showMemoryAddresses: false,
    breakpointLines: new Set(),
    softBreakpointLines: new Set(),
    lineCount: 0,
    breakpointsInitialized: false,
    breakpointsDefaultAll: true,
    pendingBreakpointReinit: false,
    lineNumberHandlersBound: false,
    breakpointDragActive: false,
    breakpointDragValue: true,
    breakpointDragPointerId: null,
    lastPauseProbeLine: null,
    pauseContext: {
        soft: false,
        line: 0
    },
    stepMode: 'instruction',
    pendingAutoMicroPause: false,
    microSkipToNextInstruction: false,
    lastScopeStack: null,
    
    speeds: [0.1, 0.25, 0.5, 1, 1.5, 2, 4],
    speedIndex: 3, 
    adjustSpeed: (delta) => {
        ui.speedIndex = Math.max(0, Math.min(ui.speeds.length - 1, ui.speedIndex + delta));
        ui.speedMultiplier = ui.speeds[ui.speedIndex];
        document.getElementById('speed-display').innerText = ui.speedMultiplier + 'x';
        document.documentElement.style.setProperty('--time-scale', 1 / ui.speedMultiplier);
    },
    getReadVisualizationLabel: (mode = ui.readVisualizationMode) => {
        if (mode === 'line') return 'Liaison';
        if (mode === 'data') return 'Donnees';
        return 'Liaison + donnees';
    },
    setReadVisualizationMode: (mode = 'both') => {
        const normalized = String(mode || '').trim().toLowerCase();
        const nextMode = ['line', 'data', 'both'].includes(normalized) ? normalized : 'both';
        ui.readVisualizationMode = nextMode;
        ui.showFlowLine = nextMode !== 'data';
        ui.showDataFlow = nextMode !== 'line';
        if (!ui.showDataFlow) {
            document.querySelectorAll('.flying-element').forEach((el) => el.remove());
            document.querySelectorAll('.flying-dom-node').forEach((el) => el.remove());
        }
        if (!ui.showFlowLine) {
            document.querySelectorAll('.flow-link-line').forEach((el) => el.remove());
            document.querySelectorAll('.flow-link-highlight').forEach((el) => el.classList.remove('flow-link-highlight'));
        }
        ui.updateReadVisualizationControl();
    },
    updateReadVisualizationControl: () => {
        const button = document.getElementById('btn-toggle-read-visualization');
        if (!button) return;
        button.innerText = ui.getReadVisualizationLabel();
        button.classList.add('is-on');
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('data-state', ui.readVisualizationMode);
    },
    cycleReadVisualizationMode: () => {
        const order = ['both', 'line', 'data'];
        const index = order.indexOf(ui.readVisualizationMode);
        const next = order[(index + 1) % order.length];
        ui.setReadVisualizationMode(next);
    },
    updateFlowLineControl: () => {
        ui.updateReadVisualizationControl();
    },
    updateDataFlowControl: () => {
        ui.updateReadVisualizationControl();
    },
    updateMemoryTypesControl: () => {
        const button = document.getElementById('btn-toggle-memory-types');
        applyToggleButtonState(button, ui.showMemoryTypes);
    },
    updateMemoryAddressesControl: () => {
        const button = document.getElementById('btn-toggle-memory-addresses');
        applyToggleButtonState(button, ui.showMemoryAddresses);
    },
    updateDisplayOptionsControls: () => {
        ui.updateReadVisualizationControl();
        ui.updateStepModeControl();
        ui.updateMemoryTypesControl();
        ui.updateMemoryAddressesControl();
        ui.updateBreakpointsToggleControl();
    },
    updateDomRenderToggleControl: () => {
        const button = document.getElementById('btn-toggle-dom-render');
        if (!button) return;
        button.innerText = ui.showDomRender ? 'Rendu ON' : 'Rendu OFF';
        button.classList.toggle('is-on', ui.showDomRender);
        button.setAttribute('aria-pressed', ui.showDomRender ? 'true' : 'false');
    },
    toggleDomRender: (forceState = null) => {
        ui.showDomRender = forceState === null ? !ui.showDomRender : Boolean(forceState);
        ui.renderDomPanel();
    },
    refreshMemoryFromSnapshot: () => {
        if (!ui.lastScopeStack) return;
        ui.updateMemory(ui.lastScopeStack, null, 'none', null, false);
    },
    toggleFlowLine: () => {
        if (ui.readVisualizationMode === 'both') ui.setReadVisualizationMode('data');
        else if (ui.readVisualizationMode === 'data') ui.setReadVisualizationMode('both');
        else ui.setReadVisualizationMode('both');
    },
    toggleDataFlow: () => {
        if (ui.readVisualizationMode === 'both') ui.setReadVisualizationMode('line');
        else if (ui.readVisualizationMode === 'line') ui.setReadVisualizationMode('both');
        else ui.setReadVisualizationMode('both');
    },
    toggleMemoryTypes: () => {
        ui.showMemoryTypes = !ui.showMemoryTypes;
        ui.updateMemoryTypesControl();
        ui.refreshMemoryFromSnapshot();
    },
    toggleMemoryAddresses: () => {
        ui.showMemoryAddresses = !ui.showMemoryAddresses;
        ui.updateMemoryAddressesControl();
        ui.refreshMemoryFromSnapshot();
    },
    hideOptionsPopup: () => {
        const popup = document.getElementById('options-popup');
        if (popup) popup.classList.remove('visible');
    },
    positionOptionsPopup: () => {
        const popup = document.getElementById('options-popup');
        const optionsButton = document.getElementById('btn-options');
        const toolbar = document.querySelector('.toolbar');
        if (!popup || !optionsButton || !toolbar) return;
        const toolbarRect = toolbar.getBoundingClientRect();
        const buttonRect = optionsButton.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();
        const popupWidth = popupRect.width || popup.offsetWidth || 250;
        const buttonCenter = (buttonRect.left - toolbarRect.left) + (buttonRect.width / 2);
        const minLeft = 8;
        const maxLeft = Math.max(minLeft, toolbar.clientWidth - popupWidth - 8);
        const alignedLeft = Math.max(minLeft, Math.min(maxLeft, buttonCenter - (popupWidth / 2)));
        popup.style.right = 'auto';
        popup.style.left = `${alignedLeft}px`;
    },
    toggleOptionsPopup: (forceOpen = null) => {
        const popup = document.getElementById('options-popup');
        if (!popup) return;
        const shouldOpen = forceOpen === null ? !popup.classList.contains('visible') : Boolean(forceOpen);
        if (!shouldOpen) {
            popup.classList.remove('visible');
            return;
        }
        const eventPopup = document.getElementById('event-popup');
        const loadPopup = document.getElementById('load-popup');
        if (eventPopup) eventPopup.classList.remove('visible');
        if (loadPopup) loadPopup.classList.remove('visible');
        popup.classList.add('visible');
        ui.updateDisplayOptionsControls();
        if (window.app && typeof window.app.updateOptionsPopupControls === 'function') {
            window.app.updateOptionsPopupControls();
        }
        window.requestAnimationFrame(ui.positionOptionsPopup);
        window.requestAnimationFrame(ui.positionOptionsPopup);
    },
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
            const containerRect = container.getBoundingClientRect();
            const visibleTop = container.scrollTop + 8;
            const visibleBottom = container.scrollTop + container.clientHeight - panelRect.height - 8;
            let top = visibleTop;
            if (anchorEl) {
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

    toggleDrawer: () => {
        if(window.innerWidth >= 800) return; 
        const panel = document.getElementById('right-panel');
        if (panel.classList.contains('open')) { panel.classList.remove('open'); ui.isDrawerOpen = false; }
        else { panel.classList.add('open'); ui.isDrawerOpen = true; }
    },
    switchTab: (tabName) => {
        if (ui.p5ModeEnabled && tabName === 'dom') tabName = 'memory';
        document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
        const tabElement = document.getElementById(`tab-${tabName}`);
        if (tabElement) tabElement.classList.add('active');
        document.querySelectorAll('.drawer-content').forEach(c => c.classList.remove('active'));
        const viewElement = document.getElementById(`view-${tabName}`);
        if (viewElement) viewElement.classList.add('active');
        if (tabName === 'dom') ui.renderDomPanel();
    },
    
    ensureDrawerOpen: (tabName) => {
        if (ui.p5ModeEnabled && tabName === 'dom') tabName = 'memory';
        return new Promise(resolve => {
            if (ui.skipMode || ui.isStopping) {
                const panel = document.getElementById('right-panel');
                if (window.innerWidth >= 800) {
                    ui.switchTab(tabName);
                    resolve();
                    return;
                }
                if (panel) {
                    ui.switchTab(tabName);
                    panel.classList.add('open');
                    ui.isDrawerOpen = true;
                }
                resolve();
                return;
            }
            if (window.innerWidth >= 800) {
                const targetContentDesktop = document.getElementById(`view-${tabName}`);
                if (targetContentDesktop && !targetContentDesktop.classList.contains('active')) ui.switchTab(tabName);
                resolve();
                return;
            } 
            
            const panel = document.getElementById('right-panel');
            const targetContent = document.getElementById(`view-${tabName}`);
            if (!panel || !targetContent) { resolve(); return; }
            
            if (!panel.classList.contains('open')) {
                ui.switchTab(tabName);
                panel.classList.add('open');
                ui.isDrawerOpen = true;
                setTimeout(resolve, 650); 
                return;
            }
            if (!targetContent.classList.contains('active')) {
                ui.switchTab(tabName);
                setTimeout(resolve, 600); 
                return;
            }
            resolve();
        });
    },

    activeSubTool: null, 

    showMobileTools: () => {
        if(window.innerWidth < 800) {
            const container = document.getElementById('mobile-tools-container');
            container.classList.add('visible');
        }
    },
    
    hideMobileTools: () => {
        setTimeout(() => {
            document.getElementById('mobile-tools-container').classList.remove('visible');
            ui.activeSubTool = null;
            ui.renderSubToolbar(); 
        }, 150);
    },

    toggleSubTool: (category, event) => {
        if(event) {
             event.preventDefault(); 
             event.stopPropagation();
        }
        if (ui.activeSubTool === category) {
            ui.activeSubTool = null;
        } else {
            ui.activeSubTool = category;
        }
        ui.renderSubToolbar();
    },

    renderSubToolbar: () => {
        const subRow = document.getElementById('sub-toolbar');
        const mainRow = document.getElementById('main-toolbar');
        mainRow.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active-category'));

        if (!ui.activeSubTool) {
            subRow.classList.add('hidden');
            subRow.innerHTML = '';
            return;
        }
        const activeBtn = document.getElementById(`btn-cat-${ui.activeSubTool}`);
        if(activeBtn) activeBtn.classList.add('active-category');

        subRow.classList.remove('hidden');
        let keys = [];
        
        if (ui.activeSubTool === 'brackets') keys = ['(', ')', '{', '}', '[', ']'];
        else if (ui.activeSubTool === 'math') keys = ['+', '-', '*', '/', '%'];
        else if (ui.activeSubTool === 'logic') keys = ['<', '>', '<=', '>=', '===', '!=', '&&', '||', '!'];

        subRow.innerHTML = keys.map(k => 
            `<button class="tool-btn" onmousedown="event.preventDefault()" onclick="editor.insertText('${k}', false, true)">${k.replace('<','&lt;').replace('>','&gt;')}</button>`
        ).join('');
    },

    updateGlobalFontSize: (delta) => { const newSize = ui.globalScale + delta; if(newSize >= 10 && newSize <= 24) { ui.globalScale = newSize; document.documentElement.style.setProperty('--content-scale', `${newSize}px`); } },
    
    wait: (ms) => { 
        if (ui.isStopping) return Promise.resolve();
        const appRunning = Boolean(window.app && window.app.isRunning);
        if (ui.skipMode) return Promise.resolve(); 
        if (appRunning && ui.shouldFastForwardExecution()) return Promise.resolve();
        return new Promise(resolve => {
            ui.currentWaitResolver = resolve;
            setTimeout(() => {
                if (ui.currentWaitResolver === resolve) {
                    ui.currentWaitResolver = null;
                    resolve();
                }
            }, ms / ui.speedMultiplier);
        });
    },

    stopAnimations: () => {
        ui.hideMemoryDomTooltip();
        ui.hideCodeValueTooltip();
        ui.hideMemoryArrayPortal();
        ui.hideDetachedDomPortal();
        document.querySelectorAll('.flying-element').forEach(el => el.remove());
        document.querySelectorAll('.flying-dom-node').forEach(el => el.remove());
        document.querySelectorAll('.flow-link-line').forEach(el => el.remove());
        document.querySelectorAll('.expr-flow-target').forEach(el => el.remove());
        document.querySelectorAll('.expr-collapse-highlight').forEach(el => el.remove());
        document.querySelectorAll('.dom-group-highlight-box').forEach(el => el.remove());
        document.querySelectorAll('.dom-insert-target').forEach(el => el.remove());
        document.querySelectorAll('.flow-link-highlight').forEach(el => el.classList.remove('flow-link-highlight'));
        document.querySelectorAll('.dom-highlight').forEach(el => el.classList.remove('dom-highlight'));
        document.querySelectorAll('.dom-parent-highlight').forEach(el => el.classList.remove('dom-parent-highlight'));
        document.querySelectorAll('.dom-replaced-highlight').forEach(el => el.classList.remove('dom-replaced-highlight'));
        document.querySelectorAll('.dom-insert-space').forEach(el => el.classList.remove('dom-insert-space'));
        document.querySelectorAll('.dom-remove-leave').forEach(el => el.classList.remove('dom-remove-leave'));
        document.querySelectorAll('.dom-attr-highlight').forEach(el => el.classList.remove('dom-attr-highlight'));
        document.querySelectorAll('.line-number-item.is-current-line, .line-number-item.is-stack-frame').forEach((el) => {
            el.classList.remove('is-current-line');
            el.classList.remove('is-stack-frame');
        });
    },

    renderCode: (tokens) => {
        const display = document.getElementById('code-display');
        display.innerHTML = ''; let html = '';
        tokens.forEach(t => {
            const className = classNameForTokenType(t.type);
            if (t.type === 'WHITESPACE') {
                html += t.value;
            } else if (t.type === TokenType.STRING && t.value.startsWith('`') && t.value.endsWith('`')) {
                html += `<span id="${t.id}" data-code-token-id="${t.id}" class="${className}">${renderTemplateStringValue(t.value)}</span>`;
            } else {
                const varAttr = t.type === TokenType.IDENTIFIER ? ` data-code-var="${escapeHtml(t.value)}"` : '';
                html += `<span id="${t.id}" data-code-token-id="${t.id}" class="${className}"${varAttr}>${escapeHtml(t.value)}</span>`;
            }
        });
        display.innerHTML = html;
        ui.initCodeValueTooltip();
        ui.currentPropertyTokenSnapshot.clear();
        ui.modifiedTokens.clear(); ui.lockedTokens.clear();
    },
    renderPlainCode: (text, mode = 'text') => {
        const display = document.getElementById('code-display');
        if (!display) return;
        const rawText = String(text || '');
        let markup = '';
        if (mode === 'html') markup = renderHtmlCode(rawText);
        else if (mode === 'css') markup = renderCssCode(rawText);
        else markup = `<span class="tok-ident">${escapeHtml(rawText)}</span>`;
        display.innerHTML = markup;
        ui.currentPropertyTokenSnapshot.clear();
        ui.modifiedTokens.clear();
        ui.lockedTokens.clear();
    },
    resetDisplay: (options = {}) => { 
        const keepConsole = typeof options === 'boolean' ? options : Boolean(options.keepConsole);
        const globalEditor = window.editor;
        if (globalEditor && typeof globalEditor.refresh === 'function') {
            globalEditor.refresh();
        }
        ui.resetVisuals();
        document.getElementById('highlight-layer').innerHTML = ''; 
        document.getElementById('memory-container').innerHTML = ''; 
        if (!keepConsole) document.getElementById('console-output').innerHTML = '';
        ui.hideMemoryDomTooltip();
        ui.hideCodeValueTooltip();
        ui.hideMemoryArrayPortal();
        ui.hideDetachedDomPortal();
        ui.currentMemoryVarSnapshot.clear();
        ui.currentPropertyTokenSnapshot.clear();
        ui.modifiedTokens.clear(); 
        ui.lockedTokens.clear(); 
        ui.setStepButtonState(false); 
        ui.setEventMode(false);
        if(window.innerWidth < 800) {
            document.getElementById('right-panel').classList.remove('open');
            ui.isDrawerOpen = false;
        }
        document.getElementById('code-wrapper').scrollTo(0, 0);
        ui.currentWaitResolver = null;
        ui.lastPauseProbeLine = null;
        ui.pauseContext = { soft: false, line: 0 };
        ui.pendingAutoMicroPause = false;
        ui.microSkipToNextInstruction = false;
    },
    updateLineNumbers: (text) => {
        const lines = Math.max(1, String(text || '').split('\n').length);
        ui.bindLineNumberHandlers();
        ui.normalizeBreakpoints(lines);
        for (const line of Array.from(ui.breakpointLines)) {
            if (ui.isEmptyEditorLine(line)) ui.breakpointLines.delete(line);
        }
        const lineNumbers = document.getElementById('line-numbers');
        if (!lineNumbers) return;
        const itemsHtml = Array(lines)
            .fill(0)
            .map((_, index) => {
                const line = index + 1;
                return `<button type="button" class="line-number-item" data-line="${line}">${line}</button>`;
            })
            .join('');
        lineNumbers.innerHTML = itemsHtml;
        ui.refreshLineNumberBreakpointClasses();
        ui.updateBreakpointsToggleControl();
    },
    syncScroll: () => { 
        const wrapper = document.getElementById('code-wrapper'); 
        const lineNums = document.getElementById('line-numbers');
        lineNums.scrollTop = wrapper.scrollTop;
    },
    setRunningState: (running) => { 
        // Mise à jour de l'état du bouton Play/Stop
        const btnRun = document.getElementById('btn-toggle-run');
        if (running) {
            ui.lastPauseProbeLine = 0;
            btnRun.innerHTML = '<i data-lucide="square"></i>';
            btnRun.classList.add('btn-stop-mode');
            btnRun.setAttribute('data-tooltip', 'play/stop');
            btnRun.setAttribute('aria-label', 'play/stop');
            refreshIcons();
        } else {
            btnRun.innerHTML = '<i data-lucide="play"></i>';
            btnRun.classList.remove('btn-stop-mode');
            btnRun.setAttribute('data-tooltip', 'play/stop');
            btnRun.setAttribute('aria-label', 'play/stop');
            refreshIcons();
        }
        
        document.getElementById('btn-next').disabled = !running; 
        document.getElementById('btn-skip').disabled = !running; 
        document.getElementById('code-input').readOnly = running; 
        document.getElementById('code-input').style.pointerEvents = running ? 'none' : 'auto';
        document.getElementById('code-display').style.pointerEvents = running ? 'auto' : 'none';
        if(!running) document.getElementById('highlight-layer').innerHTML = ''; 
        if(!running) {
            ui.hideCodeValueTooltip();
            ui.pauseContext = { soft: false, line: 0 };
            ui.pendingAutoMicroPause = false;
            const lineNumbers = document.getElementById('line-numbers');
            if (lineNumbers) {
                lineNumbers.querySelectorAll('.line-number-item.is-current-line, .line-number-item.is-stack-frame').forEach((element) => {
                    element.classList.remove('is-current-line');
                    element.classList.remove('is-stack-frame');
                });
            }
        }
    },
    setStepButtonState: (enabled) => { 
        document.getElementById('btn-next').disabled = !enabled; 
        document.getElementById('btn-skip').disabled = !ui.isStopping && !enabled && false; 
    },
    setEventMode: (enabled) => {
        const triggerBtn = document.getElementById('btn-trigger');
        if (triggerBtn) triggerBtn.disabled = !enabled;
        const nextBtn = document.getElementById('btn-next');
        const skipBtn = document.getElementById('btn-skip');
        if (nextBtn) nextBtn.disabled = true;
        if (skipBtn) skipBtn.disabled = true;
    },
    switchDomView: () => {},
    updateDom: (domDocument, domCss = undefined) => {
        ui.domDocument = domDocument || null;
        if (domCss !== undefined) ui.domCss = String(domCss || '');
        ui.renderDomPanel();
    },
    getP5RuntimeFrame: () => {
        const memoryPanel = document.getElementById('memory-render-panel');
        if (memoryPanel) {
            const frameInMemory = memoryPanel.querySelector('iframe.p5-runtime-frame');
            if (frameInMemory) return frameInMemory;
        }
        const renderView = document.getElementById('dom-view-render');
        if (!renderView) return null;
        return renderView.querySelector('iframe.p5-runtime-frame');
    },
    renderP5RuntimeInContainer: (container) => {
        if (!container) return;
        const currentKey = String(ui.p5RuntimeKey || '');
        const existingFrame = container.querySelector('iframe.p5-runtime-frame');
        if (existingFrame && existingFrame.dataset.runtimeKey === currentKey) return;
        const iframe = document.createElement('iframe');
        iframe.className = 'dom-render-frame p5-runtime-frame';
        iframe.setAttribute('title', 'Apercu p5.js');
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
        iframe.dataset.runtimeKey = currentKey;
        iframe.srcdoc = ui.p5RuntimeSrcdoc || '<!doctype html><html><body></body></html>';
        container.innerHTML = '';
        container.appendChild(iframe);
    },
    updateP5PanelsLayout: () => {
        const tabDom = document.getElementById('tab-dom');
        const viewMemory = document.getElementById('view-memory');
        const memoryRenderPanel = document.getElementById('memory-render-panel');
        if (tabDom) tabDom.style.display = ui.p5ModeEnabled ? 'none' : '';
        if (viewMemory) viewMemory.classList.toggle('p5-split', Boolean(ui.p5ModeEnabled && ui.showDomRender));
        if (!memoryRenderPanel) return;
        if (ui.p5ModeEnabled && ui.showDomRender) {
            memoryRenderPanel.classList.add('active');
            ui.renderP5RuntimeInContainer(memoryRenderPanel);
        } else {
            memoryRenderPanel.classList.remove('active');
            memoryRenderPanel.innerHTML = '';
        }
    },
    setP5RuntimeMode: (enabled = false, srcdoc = '', runtimeKey = '') => {
        ui.p5ModeEnabled = Boolean(enabled);
        if (ui.p5ModeEnabled) {
            ui.p5RuntimeSrcdoc = String(srcdoc || '');
            ui.p5RuntimeKey = String(runtimeKey || '');
        } else {
            ui.p5RuntimeSrcdoc = '';
            ui.p5RuntimeKey = '';
        }
        if (ui.p5ModeEnabled) {
            const domTab = document.getElementById('tab-dom');
            if (domTab && domTab.classList.contains('active')) ui.switchTab('memory');
        }
        ui.updateP5PanelsLayout();
        ui.renderDomPanel();
    },
    log: (msg, type='info') => {
        if(ui.isStopping) return;
        const div = document.createElement('div');
        div.className = `log-entry log-${type}`;
        div.innerText = msg;
        const box = document.getElementById('console-output');
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
        div.classList.add('console-flash');
        const duration = Math.max(200, Math.round(600 / Math.max(0.1, ui.speedMultiplier || 1)));
        window.setTimeout(() => {
            div.classList.remove('console-flash');
        }, duration);
    },
    renderError: async (errorObj = {}) => {
        if (ui.isStopping) return;
        await ui.ensureDrawerOpen('console');
        const box = document.getElementById('console-output');
        if (!box) return;

        const rawError = errorObj.errorObject;
        const name = errorObj.name
            || ((rawError && rawError.name) ? String(rawError.name) : 'Error');
        const friendlyMessage = (errorObj.message !== undefined && errorObj.message !== null)
            ? String(errorObj.message)
            : ((rawError && rawError.message) ? String(rawError.message) : 'Erreur runtime');
        const prefix = errorObj.prefix ? `${String(errorObj.prefix)}: ` : '';
        const lineSuffix = (Number.isFinite(errorObj.line) && Number(errorObj.line) > 0 && !String(friendlyMessage).includes('ligne'))
            ? ` (ligne ${Number(errorObj.line)})`
            : '';

        const entry = document.createElement('div');
        entry.className = 'log-entry log-error-entry';

        const title = document.createElement('div');
        title.className = 'console-error-title';
        title.innerText = `${prefix}${name}: ${friendlyMessage}${lineSuffix}`;
        entry.appendChild(title);

        box.appendChild(entry);
        box.scrollTop = box.scrollHeight;
        entry.classList.add('console-flash');
        await ui.wait(600);
        entry.classList.remove('console-flash');
    },
    consoleLog: async (args) => {
        if(ui.isStopping) return;
        await ui.ensureDrawerOpen('console');
        const box = document.getElementById('console-output');
        if (!box) return;
        const entry = document.createElement('div');
        entry.className = 'log-entry log-console-entry';
        const values = Array.isArray(args) ? args : [args];
        values.forEach((arg, index) => {
            const argWrap = document.createElement('span');
            argWrap.className = 'console-arg';
            argWrap.appendChild(createConsoleValueNode(arg, []));
            entry.appendChild(argWrap);
            if (index < values.length - 1) entry.appendChild(document.createTextNode(' '));
        });
        box.appendChild(entry);
        box.scrollTop = box.scrollHeight;
        entry.classList.add('console-flash');
        await ui.wait(600);
        entry.classList.remove('console-flash');
    },

    scrollToLine: (lineNumber) => {
        if(ui.skipMode || ui.isStopping) return;
        const wrapper = document.getElementById('code-wrapper');
        const lineHeight = parseFloat(getComputedStyle(document.getElementById('code-display')).lineHeight) || 24;
        const targetY = (lineNumber - 1) * lineHeight;
        const containerHeight = wrapper.clientHeight;
        
        if (targetY < wrapper.scrollTop + 20 || targetY > wrapper.scrollTop + containerHeight - 60) {
            wrapper.scrollTo({
                top: Math.max(0, targetY - containerHeight / 2),
                behavior: 'smooth'
            });
        }
    },

    highlightLines: (lineNumbers) => {
        if(ui.isStopping) return;
        const layer = document.getElementById('highlight-layer'); layer.innerHTML = ''; 
        const lh = parseFloat(getComputedStyle(document.getElementById('code-display')).lineHeight);
        const lineNumberContainer = document.getElementById('line-numbers');
        if (lineNumberContainer) {
            lineNumberContainer.querySelectorAll('.line-number-item.is-current-line, .line-number-item.is-stack-frame').forEach((element) => {
                element.classList.remove('is-current-line');
                element.classList.remove('is-stack-frame');
            });
        }
        if (lineNumbers.length > 0) {
            ui.scrollToLine(lineNumbers[lineNumbers.length - 1]);
        }
        for(let i=0; i<lineNumbers.length - 1; i++) {
            const div = document.createElement('div');
            div.className = 'exec-line-stack';
            div.style.top = `${(lineNumbers[i] - 1) * lh + 10}px`;
            layer.appendChild(div);
            if (lineNumberContainer) {
                const marker = lineNumberContainer.querySelector(`.line-number-item[data-line="${lineNumbers[i]}"]`);
                if (marker) marker.classList.add('is-stack-frame');
            }
        }
        if (lineNumbers.length > 0) {
            const currentLine = lineNumbers[lineNumbers.length - 1];
            const div = document.createElement('div');
            div.className = 'exec-line';
            div.style.top = `${(currentLine - 1) * lh + 10}px`;
            layer.appendChild(div);
            if (lineNumberContainer) {
                const marker = lineNumberContainer.querySelector(`.line-number-item[data-line="${currentLine}"]`);
                if (marker) marker.classList.add('is-current-line');
            }
        }
    },

    ensureVisible: (elementId) => { 
        const el = document.getElementById(elementId); 
        if (el) { el.scrollIntoView({ behavior: 'auto', block: 'center' }); }
    },

};

attachExecutionControls(ui);
attachDomMethods(ui, {
    resolveVirtualDomNodeByPath,
    getDomTreeRef,
    mapDomPropertyToAttr,
    getFlowVisualElement,
    createFlowGuideLine,
    formatValue,
    createDomFlyBadgeElement,
    buildDomTreeMarkup,
    buildDomPreviewDocument
});
attachMemoryMethods(ui, {
    isVirtualDomValue,
    escapeHtml,
    buildDomInlineValueMarkup,
    buildMemoryMetaHtml,
    wrapMemoryValueMarkup,
    valueToVisualText,
    getMemoryTypeLabel
});
attachTokenAnimationMethods(ui, {
    getFlowVisualElement,
    createFlowGuideLine,
    valueToVisualText,
    valueToCodeVisualText,
    formatValue,
    isVirtualDomValue,
    buildDomInlineValueMarkup
});

export const consoleUI = { clear: () => document.getElementById('console-output').innerHTML = '' };
