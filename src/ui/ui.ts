// @ts-nocheck
import { TokenType, Lexer } from '../core/language';
import { formatValue } from '../core/config';
import { isVirtualDomValue } from '../core/virtualDom';
import { refreshIcons } from './icons';

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const classNameForTokenType = (type) => {
    switch(type) {
        case TokenType.KEYWORD: return 'tok-keyword';
        case TokenType.STRING: return 'tok-string';
        case TokenType.NUMBER: return 'tok-number';
        case TokenType.BOOLEAN: return 'tok-boolean';
        case TokenType.COMMENT: return 'tok-comment';
        case TokenType.OPERATOR: return 'tok-operator';
        case TokenType.PUNCTUATION: return 'tok-punctuation';
        default: return 'tok-ident';
    }
};

const renderTemplateStringValue = (rawTemplateTokenValue) => {
    if (!(rawTemplateTokenValue.startsWith('`') && rawTemplateTokenValue.endsWith('`'))) {
        return escapeHtml(rawTemplateTokenValue);
    }
    const content = rawTemplateTokenValue.slice(1, -1);
    let html = '`';
    let index = 0;
    let textStart = 0;
    const appendRawText = (text) => { html += escapeHtml(text); };
    const appendExprHtml = (exprSource) => {
        html += '<span class="tok-punctuation">${</span>';
        const exprTokens = new Lexer(exprSource).tokenize();
        exprTokens.forEach((exprToken) => {
            if (exprToken.type === 'WHITESPACE') {
                html += escapeHtml(exprToken.value);
            } else {
                html += `<span class="${classNameForTokenType(exprToken.type)}">${escapeHtml(exprToken.value)}</span>`;
            }
        });
        html += '<span class="tok-punctuation">}</span>';
    };
    while (index < content.length) {
        if (content[index] === '$' && content[index + 1] === '{') {
            appendRawText(content.slice(textStart, index));
            index += 2;
            const exprStart = index;
            let depth = 1;
            while (index < content.length && depth > 0) {
                const char = content[index];
                if (char === "'" || char === '"' || char === '`') {
                    const quote = char;
                    index++;
                    while (index < content.length) {
                        if (content[index] === '\\') { index += 2; continue; }
                        if (content[index] === quote) { index++; break; }
                        index++;
                    }
                    continue;
                }
                if (char === '{') depth++;
                else if (char === '}') depth--;
                index++;
            }
            const exprSource = content.slice(exprStart, Math.max(exprStart, index - 1));
            appendExprHtml(exprSource);
            textStart = index;
            continue;
        }
        if (content[index] === '\\' && index + 1 < content.length) {
            index += 2;
            continue;
        }
        index++;
    }
    appendRawText(content.slice(textStart));
    html += '`';
    return html;
};

const valueToVisualText = (value) => {
    if (value === undefined) return 'undefined';
    if (isVirtualDomValue(value)) return String(formatValue(value));
    if (Array.isArray(value)) return JSON.stringify(value);
    return JSON.stringify(formatValue(value));
};

const valueToCodePreviewText = (value, initialized = true, functionAlias = null) => {
    if (!initialized) return 'uninitialized';
    if (value && typeof value === 'object') {
        if (value.type === 'function_decl_ref') return value.name || 'function';
        if (String(value.type || '').includes('func')) {
            const paramsDisplay = Array.isArray(value.params) ? value.params.join(',') : `${value.params || ''}`;
            return functionAlias ? `${functionAlias}(${paramsDisplay})` : `f(${paramsDisplay})`;
        }
    }
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return `[${value.map((entry) => JSON.stringify(entry)).join(', ')}]`;
    if (isVirtualDomValue(value)) return String(formatValue(value));
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') {
        try {
            return JSON.stringify(formatValue(value));
        } catch (error) {
            return String(formatValue(value));
        }
    }
    return String(formatValue(value));
};

const getCodePreviewTypeLabel = (snapshot) => {
    if (!snapshot || snapshot.initialized === false) return 'undefined';
    return getMemoryTypeLabel(snapshot.value, true);
};

const getMemoryTypeLabel = (value, hasOwnValue = true) => {
    if (!hasOwnValue) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (isVirtualDomValue(value)) return 'dom-node';
    if (value && typeof value === 'object' && value.type && String(value.type).includes('func')) return 'function';
    if (typeof value === 'function') return 'function';
    return typeof value;
};

const truncateConsoleText = (value, max = 140) => {
    const text = String(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}...`;
};

const isFunctionDescriptorValue = (value) => Boolean(
    value
    && typeof value === 'object'
    && typeof value.type === 'string'
    && value.type.includes('func')
);

const getFunctionDescriptorLabel = (value) => {
    const params = Array.isArray(value && value.params) ? value.params : [];
    const joined = params.map((entry) => String(entry)).join(', ');
    if (value && value.name) return `f ${value.name}(${joined})`;
    return `f(${joined})`;
};

const getConsoleObjectEntries = (value) => {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) {
        const entries = [];
        for (let index = 0; index < value.length; index++) {
            if (Object.prototype.hasOwnProperty.call(value, index)) {
                entries.push([String(index), value[index]]);
            }
        }
        return entries;
    }
    if (value instanceof Map) {
        const entries = [];
        value.forEach((entryValue, entryKey) => {
            entries.push([String(entryKey), entryValue]);
        });
        return entries;
    }
    if (value instanceof Set) {
        const entries = [];
        Array.from(value.values()).forEach((entryValue, index) => {
            entries.push([String(index), entryValue]);
        });
        return entries;
    }
    return Object.keys(value).map((key) => [key, value[key]]);
};

const toConsoleInlinePreview = (value) => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${truncateConsoleText(value, 36)}"`;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    if (typeof value === 'function') return `f ${value.name || '(anonymous)'}()`;
    if (isVirtualDomValue(value)) return truncateConsoleText(String(formatValue(value)), 48);
    if (isFunctionDescriptorValue(value)) return getFunctionDescriptorLabel(value);
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value && typeof value === 'object') {
        const ctor = value.constructor && value.constructor.name ? value.constructor.name : 'Object';
        return ctor;
    }
    return truncateConsoleText(String(value), 36);
};

const createConsolePrimitiveNode = (value) => {
    const node = document.createElement('span');
    node.className = 'console-value';
    if (value === undefined) {
        node.classList.add('console-value-undefined');
        node.innerText = 'undefined';
        return node;
    }
    if (value === null) {
        node.classList.add('console-value-null');
        node.innerText = 'null';
        return node;
    }
    if (typeof value === 'string') {
        node.classList.add('console-value-string');
        node.innerText = `"${value}"`;
        return node;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        node.classList.add('console-value-number');
        node.innerText = String(value);
        return node;
    }
    if (typeof value === 'boolean') {
        node.classList.add('console-value-boolean');
        node.innerText = String(value);
        return node;
    }
    if (typeof value === 'function') {
        node.classList.add('console-value-function');
        node.innerText = `f ${value.name || '(anonymous)'}()`;
        return node;
    }
    if (isVirtualDomValue(value)) {
        node.classList.add('console-value-dom-node');
        node.innerText = String(formatValue(value));
        return node;
    }
    if (isFunctionDescriptorValue(value)) {
        node.classList.add('console-value-function');
        node.innerText = getFunctionDescriptorLabel(value);
        return node;
    }
    node.classList.add('console-value-generic');
    node.innerText = String(value);
    return node;
};

const createConsoleValueNode = (value, stack = []) => {
    if (value && typeof value === 'object' && !isVirtualDomValue(value) && !isFunctionDescriptorValue(value)) {
        if (stack.includes(value)) {
            const circularNode = document.createElement('span');
            circularNode.className = 'console-value console-value-circular';
            circularNode.innerText = '[Circular]';
            return circularNode;
        }

        const details = document.createElement('details');
        details.className = 'console-object-tree';

        const summary = document.createElement('summary');
        summary.className = 'console-object-summary';
        const typeLabel = Array.isArray(value)
            ? `Array(${value.length})`
            : ((value.constructor && value.constructor.name) ? value.constructor.name : 'Object');
        const summaryType = document.createElement('span');
        summaryType.className = 'console-object-type';
        summaryType.innerText = typeLabel;
        summary.appendChild(summaryType);

        const entries = getConsoleObjectEntries(value);
        if (entries.length > 0) {
            const previewText = entries
                .slice(0, 3)
                .map(([entryKey, entryValue]) => (
                    Array.isArray(value)
                        ? toConsoleInlinePreview(entryValue)
                        : `${entryKey}: ${toConsoleInlinePreview(entryValue)}`
                ))
                .join(', ');
            const preview = document.createElement('span');
            preview.className = 'console-object-preview';
            preview.innerText = entries.length > 3 ? `${previewText}, ...` : previewText;
            summary.appendChild(preview);
        }

        details.appendChild(summary);

        const children = document.createElement('div');
        children.className = 'console-object-children';
        if (entries.length === 0) {
            const emptyRow = document.createElement('div');
            emptyRow.className = 'console-object-empty';
            emptyRow.innerText = '(empty)';
            children.appendChild(emptyRow);
        } else {
            entries.forEach(([entryKey, entryValue]) => {
                const row = document.createElement('div');
                row.className = 'console-object-row';
                const key = document.createElement('span');
                key.className = 'console-object-key';
                key.innerText = String(entryKey);
                row.appendChild(key);
                const separator = document.createElement('span');
                separator.className = 'console-object-separator';
                separator.innerText = ':';
                row.appendChild(separator);
                row.appendChild(createConsoleValueNode(entryValue, [...stack, value]));
                children.appendChild(row);
            });
        }
        details.appendChild(children);
        return details;
    }

    return createConsolePrimitiveNode(value);
};

const filterRuntimeStack = (stackValue) => {
    if (!stackValue) return '';
    const lines = String(stackValue)
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
    const filtered = lines.filter((line) => !/interpreter\.ts|\bParser\b/i.test(line));
    return filtered.join('\n');
};

const domTreeRefs = new WeakMap();
let domTreeRefCounter = 1;

const getDomTreeRef = (node) => {
    if (!node || (typeof node !== 'object')) return null;
    let ref = domTreeRefs.get(node);
    if (!ref) {
        ref = `N${String(domTreeRefCounter++).padStart(4, '0')}`;
        domTreeRefs.set(node, ref);
    }
    return ref;
};

const buildDomTreeMarkup = (node, depth = 0, includeIds = true) => {
    if (!node) return '';
    const treeRef = getDomTreeRef(node);
    if (node.__domType === 'text') {
        const trimmed = String(node.textContent || '').trim();
        if (!trimmed) return '';
        const text = escapeHtml(trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed);
        const idAttr = includeIds ? ` id="dom-tree-node-${treeRef}"` : '';
        return `<div${idAttr} class="dom-tree-node dom-tree-text" style="margin-left:${depth * 18}px"><span class="dom-tree-text-label">TEXTE</span><span class="dom-tree-attr" data-dom-attr="text">"${text}"</span></div>`;
    }
    if (node.__domType !== 'element') return '';
    const tag = escapeHtml(String(node.tagName || 'node').toLowerCase());
    const idPart = node.id ? `<span class="dom-tree-id" data-dom-attr="id">#${escapeHtml(node.id)}</span>` : '';
    const classes = String(node.className || '')
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((className) => `.${escapeHtml(className)}`)
        .join(' ');
    const classPart = classes ? `<span class="dom-tree-class" data-dom-attr="class">${classes}</span>` : '';
    const attrs = Object.keys(node.attributes || {})
        .filter((name) => name !== 'id' && name !== 'class')
        .map((name) => `<span class="dom-tree-attr" data-dom-attr="${escapeHtml(name)}">[${escapeHtml(name)}="${escapeHtml(node.attributes[name])}"]</span>`)
        .join('');
    const attrsPart = attrs ? `<span class="dom-tree-attrs">${attrs}</span>` : '';
    const idAttr = includeIds ? ` id="dom-tree-node-${treeRef}"` : '';
    const self = `<div${idAttr} class="dom-tree-node" style="margin-left:${depth * 18}px"><span class="dom-tree-tag">${tag}</span>${idPart}${classPart}${attrsPart}</div>`;
    const children = (node.children || []).map((child) => buildDomTreeMarkup(child, depth + 1, includeIds)).filter(Boolean).join('');
    return `${self}${children}`;
};

const mapDomPropertyToAttr = (property) => {
    const normalized = String(property || '').trim();
    if (!normalized) return '';
    if (normalized === 'className') return 'class';
    if (normalized === 'textContent' || normalized === 'innerText') return 'text';
    return normalized;
};

const createDomFlyBadgeElement = (node) => {
    const badge = document.createElement('div');
    badge.className = 'dom-tree-node dom-fly-badge';
    if (!node) return badge;
    if (node.__domType === 'text') {
        badge.classList.add('dom-tree-text');
        const textLabel = document.createElement('span');
        textLabel.className = 'dom-tree-text-label';
        textLabel.innerText = 'TEXTE';
        const textValue = document.createElement('span');
        textValue.className = 'dom-tree-attr';
        textValue.innerText = `"${String(node.textContent || '').trim()}"`;
        badge.appendChild(textLabel);
        badge.appendChild(textValue);
        return badge;
    }
    const tag = document.createElement('span');
    tag.className = 'dom-tree-tag';
    tag.innerText = String(node.tagName || 'node').toLowerCase();
    badge.appendChild(tag);
    if (node.id) {
        const idPart = document.createElement('span');
        idPart.className = 'dom-tree-id';
        idPart.innerText = `#${node.id}`;
        badge.appendChild(idPart);
    }
    const classes = String(node.className || '')
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => `.${entry}`)
        .join(' ');
    if (classes) {
        const classPart = document.createElement('span');
        classPart.className = 'dom-tree-class';
        classPart.innerText = classes;
        badge.appendChild(classPart);
    }
    const attrs = Object.keys(node.attributes || {})
        .filter((name) => name !== 'id' && name !== 'class');
    if (attrs.length > 0) {
        const attrsWrap = document.createElement('span');
        attrsWrap.className = 'dom-tree-attrs';
        attrs.forEach((name) => {
            const chip = document.createElement('span');
            chip.className = 'dom-tree-attr';
            chip.innerText = `[${name}="${node.attributes[name]}"]`;
            attrsWrap.appendChild(chip);
        });
        badge.appendChild(attrsWrap);
    }
    return badge;
};

let flowGuideCounter = 1;

const createFlowGuideLine = (sourceEl, destinationEl) => {
    if (!sourceEl || !destinationEl || typeof document === 'undefined') return { stop: () => {} };
    if (ui && ui.showFlowLine === false) return { stop: () => {} };
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('flow-link-line');
    svg.setAttribute('preserveAspectRatio', 'none');
    const gradientId = `flow-link-gradient-${flowGuideCounter++}`;

    const defs = document.createElementNS(svgNS, 'defs');
    const gradient = document.createElementNS(svgNS, 'linearGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '0%');

    const stopStart = document.createElementNS(svgNS, 'stop');
    stopStart.setAttribute('offset', '0%');
    stopStart.setAttribute('stop-color', '#67e8f9');
    stopStart.setAttribute('stop-opacity', '1');
    gradient.appendChild(stopStart);

    const stopMid = document.createElementNS(svgNS, 'stop');
    stopMid.setAttribute('offset', '50%');
    stopMid.setAttribute('stop-color', '#60a5fa');
    stopMid.setAttribute('stop-opacity', '1');
    gradient.appendChild(stopMid);

    const stopEnd = document.createElementNS(svgNS, 'stop');
    stopEnd.setAttribute('offset', '100%');
    stopEnd.setAttribute('stop-color', '#3b82f6');
    stopEnd.setAttribute('stop-opacity', '1');
    gradient.appendChild(stopEnd);

    defs.appendChild(gradient);
    svg.appendChild(defs);

    const glowPath = document.createElementNS(svgNS, 'path');
    glowPath.classList.add('flow-link-path', 'flow-link-path-glow');
    glowPath.setAttribute('stroke', `url(#${gradientId})`);
    svg.appendChild(glowPath);

    const corePath = document.createElementNS(svgNS, 'path');
    corePath.classList.add('flow-link-path', 'flow-link-path-core');
    corePath.setAttribute('stroke', `url(#${gradientId})`);
    svg.appendChild(corePath);

    const sourceDot = document.createElementNS(svgNS, 'circle');
    sourceDot.classList.add('flow-link-endpoint', 'source');
    sourceDot.setAttribute('r', '4.5');
    svg.appendChild(sourceDot);

    const destinationDot = document.createElementNS(svgNS, 'circle');
    destinationDot.classList.add('flow-link-endpoint', 'destination');
    destinationDot.setAttribute('r', '5.2');
    svg.appendChild(destinationDot);

    document.body.appendChild(svg);
    let rafId = null;
    let active = true;
    const update = () => {
        if (!active) return;
        const overlayRect = svg.getBoundingClientRect();
        const overlayWidth = Math.max(1, overlayRect.width);
        const overlayHeight = Math.max(1, overlayRect.height);
        const sourceRect = sourceEl.getBoundingClientRect();
        const destinationRect = destinationEl.getBoundingClientRect();
        const startX = sourceRect.left + sourceRect.width / 2 - overlayRect.left;
        const startY = sourceRect.top + sourceRect.height / 2 - overlayRect.top;
        const endX = destinationRect.left + destinationRect.width / 2 - overlayRect.left;
        const endY = destinationRect.top + destinationRect.height / 2 - overlayRect.top;
        const pathData = `M ${startX} ${startY} L ${endX} ${endY}`;
        svg.setAttribute('viewBox', `0 0 ${overlayWidth} ${overlayHeight}`);
        glowPath.setAttribute('d', pathData);
        corePath.setAttribute('d', pathData);
        sourceDot.setAttribute('cx', String(startX));
        sourceDot.setAttribute('cy', String(startY));
        destinationDot.setAttribute('cx', String(endX));
        destinationDot.setAttribute('cy', String(endY));
        rafId = requestAnimationFrame(update);
    };
    update();
    return {
        stop: () => {
            active = false;
            if (rafId) cancelAnimationFrame(rafId);
            if (svg.parentElement) svg.remove();
        }
    };
};

export const ui = {
    modifiedTokens: new Map(), lockedTokens: new Set(), 
    speedMultiplier: 1, baseDelay: 800, globalScale: 14, 
    skipMode: false, isDrawerOpen: false, isStopping: false,
    currentWaitResolver: null,
    heapRefs: new WeakMap(),
    heapRefCounter: 1,
    currentMemoryVarSnapshot: new Map(),
    memoryDomPreviewRefs: new Map(),
    memoryDomTooltipEl: null,
    memoryDomTooltipAnchorEl: null,
    memoryDomTooltipBound: false,
    codeValueTooltipEl: null,
    codeValueTooltipAnchorEl: null,
    codeValueTooltipBound: false,
    domDocument: null,
    domViewMode: 'tree',
    showFlowLine: true,
    
    speeds: [0.1, 0.25, 0.5, 1, 1.5, 2, 4],
    speedIndex: 3, 
    adjustSpeed: (delta) => {
        ui.speedIndex = Math.max(0, Math.min(ui.speeds.length - 1, ui.speedIndex + delta));
        ui.speedMultiplier = ui.speeds[ui.speedIndex];
        document.getElementById('speed-display').innerText = ui.speedMultiplier + 'x';
        document.documentElement.style.setProperty('--time-scale', 1 / ui.speedMultiplier);
    },
    updateFlowLineControl: () => {
        const button = document.getElementById('btn-toggle-flow-line');
        if (!button) return;
        button.innerText = ui.showFlowLine ? 'ON' : 'OFF';
        button.classList.toggle('is-on', ui.showFlowLine);
    },
    toggleFlowLine: () => {
        ui.showFlowLine = !ui.showFlowLine;
        ui.updateFlowLineControl();
    },
    initCodeValueTooltip: () => {
        if (ui.codeValueTooltipBound) return;
        const display = document.getElementById('code-display');
        if (!display) return;
        ui.codeValueTooltipBound = true;
        const hoverSupported = window.matchMedia ? window.matchMedia('(hover: hover)').matches : true;
        const getVarData = (target) => {
            if (!target || !target.closest) return null;
            const tokenEl = target.closest('span[data-code-var]');
            if (!tokenEl) return null;
            const varName = tokenEl.dataset.codeVar;
            if (!varName) return null;
            const snapshot = ui.currentMemoryVarSnapshot.get(varName);
            if (!snapshot) return null;
            return { tokenEl, varName, snapshot };
        };
        if (hoverSupported) {
            display.addEventListener('mouseover', (event) => {
                const data = getVarData(event.target);
                if (!data) return;
                ui.showCodeValueTooltip(data.varName, data.snapshot, data.tokenEl);
            });
            display.addEventListener('mouseout', (event) => {
                const fromEl = event.target && event.target.closest ? event.target.closest('span[data-code-var]') : null;
                if (!fromEl) return;
                const toEl = event.relatedTarget && event.relatedTarget.closest ? event.relatedTarget.closest('span[data-code-var]') : null;
                if (toEl === fromEl) return;
                ui.hideCodeValueTooltip();
            });
        }
        display.addEventListener('click', (event) => {
            const data = getVarData(event.target);
            if (!data) return;
            if (ui.codeValueTooltipEl && ui.codeValueTooltipAnchorEl === data.tokenEl) {
                ui.hideCodeValueTooltip();
                return;
            }
            ui.showCodeValueTooltip(data.varName, data.snapshot, data.tokenEl);
        });
        document.addEventListener('pointerdown', (event) => {
            const target = event.target;
            if (!target || !target.closest) {
                ui.hideCodeValueTooltip();
                return;
            }
            if (target.closest('.code-value-tooltip')) return;
            if (target.closest('span[data-code-var]')) return;
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
    showCodeValueTooltip: (varName, snapshot, anchorEl) => {
        if (!varName || !snapshot || !anchorEl || ui.isStopping) return;
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
        tooltip.innerHTML = `<div class="code-value-tooltip-head"><div class="code-value-tooltip-name">${escapeHtml(varName)}</div><div class="code-value-tooltip-type">${escapeHtml(typeLabel)}</div></div>${valueMarkup}`;
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
        document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
        const tabElement = document.getElementById(`tab-${tabName}`);
        if (tabElement) tabElement.classList.add('active');
        document.querySelectorAll('.drawer-content').forEach(c => c.classList.remove('active'));
        const viewElement = document.getElementById(`view-${tabName}`);
        if (viewElement) viewElement.classList.add('active');
    },
    
    ensureDrawerOpen: (tabName) => {
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
        if (ui.skipMode) return Promise.resolve(); 
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
        document.querySelectorAll('.flying-element').forEach(el => el.remove());
        document.querySelectorAll('.flying-dom-node').forEach(el => el.remove());
        document.querySelectorAll('.flow-link-line').forEach(el => el.remove());
        document.querySelectorAll('.dom-group-highlight-box').forEach(el => el.remove());
        document.querySelectorAll('.dom-insert-target').forEach(el => el.remove());
        document.querySelectorAll('.flow-link-highlight').forEach(el => el.classList.remove('flow-link-highlight'));
        document.querySelectorAll('.dom-highlight').forEach(el => el.classList.remove('dom-highlight'));
        document.querySelectorAll('.dom-parent-highlight').forEach(el => el.classList.remove('dom-parent-highlight'));
        document.querySelectorAll('.dom-replaced-highlight').forEach(el => el.classList.remove('dom-replaced-highlight'));
        document.querySelectorAll('.dom-insert-space').forEach(el => el.classList.remove('dom-insert-space'));
        document.querySelectorAll('.dom-remove-leave').forEach(el => el.classList.remove('dom-remove-leave'));
        document.querySelectorAll('.dom-attr-highlight').forEach(el => el.classList.remove('dom-attr-highlight'));
    },

    renderCode: (tokens) => {
        const display = document.getElementById('code-display');
        display.innerHTML = ''; let html = '';
        tokens.forEach(t => {
            const className = classNameForTokenType(t.type);
            if (t.type === 'WHITESPACE') {
                html += t.value;
            } else if (t.type === TokenType.STRING && t.value.startsWith('`') && t.value.endsWith('`')) {
                html += `<span id="${t.id}" class="${className}">${renderTemplateStringValue(t.value)}</span>`;
            } else {
                const varAttr = t.type === TokenType.IDENTIFIER ? ` data-code-var="${escapeHtml(t.value)}"` : '';
                html += `<span id="${t.id}" class="${className}"${varAttr}>${escapeHtml(t.value)}</span>`;
            }
        });
        display.innerHTML = html;
        ui.initCodeValueTooltip();
        ui.modifiedTokens.clear(); ui.lockedTokens.clear();
    },
    resetDisplay: (options = {}) => { 
        const keepConsole = typeof options === 'boolean' ? options : Boolean(options.keepConsole);
        const globalEditor = window.editor;
        if (globalEditor && typeof globalEditor.refresh === 'function') {
            globalEditor.refresh();
        }
        document.getElementById('highlight-layer').innerHTML = ''; 
        document.getElementById('memory-container').innerHTML = ''; 
        if (!keepConsole) document.getElementById('console-output').innerHTML = '';
        ui.hideMemoryDomTooltip();
        ui.hideCodeValueTooltip();
        ui.currentMemoryVarSnapshot.clear();
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
    },
    updateLineNumbers: (text) => { const lines = text.split('\n').length; document.getElementById('line-numbers').innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>'); },
    syncScroll: () => { 
        const wrapper = document.getElementById('code-wrapper'); 
        const lineNums = document.getElementById('line-numbers');
        lineNums.scrollTop = wrapper.scrollTop;
    },
    setRunningState: (running) => { 
        // Mise à jour de l'état du bouton Play/Stop
        const btnRun = document.getElementById('btn-toggle-run');
        if (running) {
            btnRun.innerHTML = '<i data-lucide="square"></i>';
            btnRun.classList.add('btn-stop-mode');
            refreshIcons();
        } else {
            btnRun.innerHTML = '<i data-lucide="play"></i>';
            btnRun.classList.remove('btn-stop-mode');
            refreshIcons();
        }
        
        document.getElementById('btn-next').disabled = !running; 
        document.getElementById('btn-skip').disabled = !running; 
        document.getElementById('code-input').readOnly = running; 
        document.getElementById('code-input').style.pointerEvents = running ? 'none' : 'auto';
        document.getElementById('code-display').style.pointerEvents = running ? 'auto' : 'none';
        if(!running) document.getElementById('highlight-layer').innerHTML = ''; 
        if(!running) ui.hideCodeValueTooltip();
    },
    setStepButtonState: (enabled) => { 
        document.getElementById('btn-next').disabled = !enabled; 
        document.getElementById('btn-skip').disabled = !ui.isStopping && !enabled && false; 
    },
    setEventMode: (enabled) => {
        document.getElementById('btn-trigger').disabled = !enabled;
        // document.getElementById('btn-set-event').disabled = !enabled; // Now always enabled
        document.getElementById('btn-next').disabled = true; 
        document.getElementById('btn-skip').disabled = true;
    },
    switchDomView: () => {},
    updateDom: (domDocument) => {
        ui.domDocument = domDocument || null;
        ui.renderDomPanel();
    },
    getDomTreeNodeElement: (node) => {
        if (!node) return null;
        const ref = getDomTreeRef(node);
        if (!ref) return null;
        return document.getElementById(`dom-tree-node-${ref}`);
    },
    getElementsByIds: (ids) => (ids || []).map((id) => document.getElementById(id)).filter(Boolean),
    getDomAttributeElements: (nodeElement, property = '') => {
        if (!nodeElement) return [];
        const attrName = mapDomPropertyToAttr(property);
        if (!attrName) return [];
        return Array.from(nodeElement.querySelectorAll(`[data-dom-attr="${attrName}"]`));
    },
    getDomTreeSubtreeElements: (node) => {
        if (!node) return [];
        const elements = [];
        const walk = (current) => {
            const currentEl = ui.getDomTreeNodeElement(current);
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
        (elements || []).forEach((element) => {
            if (!element) return;
            if (enabled) element.classList.add('flow-link-highlight');
            else element.classList.remove('flow-link-highlight');
        });
    },
    animateWithFlowHighlight: async (sourceEl, destinationEl, flyCallback) => {
        if (!sourceEl || !destinationEl || typeof flyCallback !== 'function') return;
        ui.setFlowHighlight([sourceEl, destinationEl], true);
        await ui.wait(180);
        await flyCallback();
        await ui.wait(160);
        ui.setFlowHighlight([sourceEl, destinationEl], false);
        await ui.wait(120);
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
        const tokenEl = document.getElementById(tokenId);
        if (!startEl || !tokenEl) return;
        const codeEls = ui.getElementsByIds((tokenGroupIds && tokenGroupIds.length > 0) ? tokenGroupIds : [tokenId]);
        const attrEls = ui.getDomAttributeElements(startEl, property);
        startEl.scrollIntoView({ behavior: 'auto', block: 'center' });
        ui.setFlowHighlight([startEl, ...codeEls], true);
        ui.setDomAttributeHighlight(attrEls, true);
        await ui.wait(180);
        const shouldFlyAttributeValue = attrEls.length > 0 && !['innerText', 'innerHTML', 'textContent'].includes(String(property || ''));
        if (shouldFlyAttributeValue) {
            await ui.flyHelper(replacementValue, attrEls[0], tokenEl, false);
        } else {
            await ui.flyDomNodeHelper(startEl, tokenEl, false);
        }
        if (replacementValue !== undefined) ui.replaceTokenText(tokenId, replacementValue, true);
        await ui.wait(160);
        ui.setFlowHighlight([startEl, ...codeEls], false);
        ui.setDomAttributeHighlight(attrEls, false);
        await ui.wait(120);
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
        const guide = createFlowGuideLine(startEl, endEl);
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
    renderDomPanel: () => {
        const treeView = document.getElementById('dom-view-tree');
        if (!treeView) return;
        treeView.innerHTML = ui.domDocument ? buildDomTreeMarkup(ui.domDocument.body, 0) : '<div class="dom-tree-empty">Aucun document HTML charge.</div>';
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
        const technicalMessage = (errorObj.technicalMessage !== undefined && errorObj.technicalMessage !== null)
            ? String(errorObj.technicalMessage)
            : ((rawError && rawError.message) ? String(rawError.message) : friendlyMessage);
        const stackSource = errorObj.stack || (rawError && rawError.stack) || '';
        const filteredStack = filterRuntimeStack(stackSource);
        const pedagogicalStack = Array.isArray(errorObj.pedagogicalStack)
            ? errorObj.pedagogicalStack.map((entry) => String(entry)).filter((entry) => entry.length > 0)
            : [];
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

        const detailLines = [];
        if (technicalMessage && technicalMessage !== friendlyMessage) {
            detailLines.push(`Message technique: ${technicalMessage}`);
        }
        if (pedagogicalStack.length > 0) {
            detailLines.push('Pile d\'execution:');
            pedagogicalStack.forEach((entry) => detailLines.push(`  at ${entry}`));
        } else if (filteredStack) {
            detailLines.push(filteredStack);
        } else if (stackSource) {
            detailLines.push(String(stackSource));
        }
        if (detailLines.length > 0) {
            const details = document.createElement('details');
            details.className = 'console-error-details';
            const summary = document.createElement('summary');
            summary.innerText = '▶ Details';
            details.appendChild(summary);
            const pre = document.createElement('pre');
            pre.className = 'console-error-stack';
            pre.innerText = detailLines.join('\n');
            details.appendChild(pre);
            entry.appendChild(details);
        }

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
        if (lineNumbers.length > 0) {
            ui.scrollToLine(lineNumbers[lineNumbers.length - 1]);
        }
        for(let i=0; i<lineNumbers.length - 1; i++) { const div = document.createElement('div'); div.className = 'exec-line-stack'; div.style.top = `${(lineNumbers[i] - 1) * lh + 10}px`; layer.appendChild(div); }
        if (lineNumbers.length > 0) { const div = document.createElement('div'); div.className = 'exec-line'; div.style.top = `${(lineNumbers[lineNumbers.length - 1] - 1) * lh + 10}px`; layer.appendChild(div); }
    },

    ensureVisible: (elementId) => { 
        const el = document.getElementById(elementId); 
        if (el) { el.scrollIntoView({ behavior: 'auto', block: 'center' }); }
    },

    getHeapId: (value) => {
        if (!value || typeof value !== 'object') return null;
        let heapId = ui.heapRefs.get(value);
        if (!heapId) {
            heapId = `@H${String(ui.heapRefCounter++).padStart(3, '0')}`;
            ui.heapRefs.set(value, heapId);
        }
        return heapId;
    },

    getMemoryValueElementId: (varName, index = null) => {
        if (index !== null) return `mem-val-${varName}-${index}`;
        const directId = `mem-val-${varName}`;
        if (document.getElementById(directId)) return directId;
        return `mem-header-${varName}`;
    },
    getMemoryVariableNameElements: (varName) => {
        if (!varName) return [];
        return Array.from(document.querySelectorAll('#memory-container .mem-name'))
            .filter((element) => String(element.innerText || '').trim() === String(varName));
    },
    getMemoryArrayIndexElements: (varName, index = null) => {
        if (!varName || index === null || index === undefined) return [];
        const path = String(index);
        return Array.from(document.querySelectorAll('#memory-container .array-element .mem-name'))
            .filter((element) => {
                const row = element.closest('.array-element');
                if (!row) return false;
                return row.getAttribute('data-var-name') === String(varName)
                    && row.getAttribute('data-path') === path;
            });
    },
    getCodeVariableNameElements: (varName, preferredTokenId = null) => {
        if (!varName) return [];
        if (preferredTokenId) {
            const preferred = document.getElementById(preferredTokenId);
            if (preferred && preferred.style.display !== 'none' && String(preferred.innerText || '').trim() === String(varName)) {
                return [preferred];
            }
            return [];
        }
        return Array.from(document.querySelectorAll('#code-display span[id]'))
            .filter((element) => element.style.display !== 'none')
            .filter((element) => String(element.innerText || '').trim() === String(varName))
            .slice(0, 1);
    },
    getCodeIndexElements: (preferredIndexTokenId = null) => {
        if (!preferredIndexTokenId) return [];
        const indexEl = document.getElementById(preferredIndexTokenId);
        if (!indexEl || indexEl.style.display === 'none') return [];
        return [indexEl];
    },
    setVariableRelationHighlight: (varName, preferredTokenId = null, enabled = true, index = null, preferredIndexTokenId = null) => (() => {}),

    updateMemory: async (scopeStack, flashVarName = null, flashType = 'write', flashIndex = null, openDrawer = true) => {
        if(ui.isStopping) return;
        ui.initMemoryDomTooltip();
        ui.hideMemoryDomTooltip();
        ui.hideCodeValueTooltip();
        ui.memoryDomPreviewRefs.clear();
        ui.currentMemoryVarSnapshot.clear();
        if(flashVarName && openDrawer) await ui.ensureDrawerOpen('memory');
        const container = document.getElementById('memory-container'); 
        let targetEl = null;
        const visibleScopes = scopeStack.filter((scope) => {
            const names = Object.keys(scope.variables).filter((name) => name !== 'document' && scope.variables[name].initialized !== false);
            return names.length > 0 || scope.name === 'Global';
        });
        const arrayOwners = new Map();
        visibleScopes.forEach((scope) => {
            Object.keys(scope.variables).filter((name) => name !== 'document' && scope.variables[name].initialized !== false).forEach((name) => {
                const currentValue = scope.variables[name].value;
                if (Array.isArray(currentValue)) {
                    const heapId = ui.getHeapId(currentValue);
                    if (heapId && !arrayOwners.has(heapId)) arrayOwners.set(heapId, name);
                }
            });
        });
        const visibleIds = new Set(visibleScopes.map(s => s.id));
        Array.from(container.children).forEach(child => { if (!visibleIds.has(child.id)) child.remove(); });
        const renderArrayRows = (groupDiv, scopeId, variableName, arr, existingRowIds = new Set(), path = [], depth = 1, parentHeapIds = new Set()) => {
            for (let idx = 0; idx < arr.length; idx++) {
                const hasValue = Object.prototype.hasOwnProperty.call(arr, idx);
                const item = hasValue ? arr[idx] : undefined;
                const nextPath = [...path, idx];
                const pathKey = nextPath.join('-');
                const isTopLevel = nextPath.length === 1;
                const rowSuffix = isTopLevel ? `${idx}` : pathKey;
                const rowId = `mem-row-${scopeId}-${variableName}-${rowSuffix}`;
                const valueId = isTopLevel ? `mem-val-${variableName}-${idx}` : `mem-val-${variableName}-${pathKey}`;
                const row = document.createElement('div');
                row.id = rowId;
                row.className = 'memory-cell array-element';
                if (!existingRowIds.has(rowId)) row.classList.add('cell-entry');
                row.setAttribute('data-path', pathKey);
                row.setAttribute('data-var-name', variableName);
                row.style.paddingLeft = `${28 + (depth - 1) * 18}px`;
                const itemHeapId = (hasValue && Array.isArray(item)) ? ui.getHeapId(item) : null;
                const itemOwner = itemHeapId ? arrayOwners.get(itemHeapId) : null;
                const isCircularRef = Boolean(itemHeapId && parentHeapIds.has(itemHeapId));
                const displayValue = !hasValue
                    ? 'empty'
                    : (Array.isArray(item)
                        ? (itemOwner ? `ref ${itemOwner}` : `Array(${item.length})`)
                        : (item===undefined ? 'empty' : valueToVisualText(item)));
                const itemType = getMemoryTypeLabel(item, hasValue);
                const hasDomPreview = hasValue && isVirtualDomValue(item);
                const previewAttrs = hasDomPreview ? ` data-dom-preview="true" data-dom-preview-id="${valueId}"` : '';
                row.innerHTML = `<span class="mem-meta"><span class="mem-type">${escapeHtml(itemType)}</span></span><span class="mem-name">[${idx}]</span><span class="mem-val" id="${valueId}"${previewAttrs}>${escapeHtml(displayValue)}</span>`;
                if (hasDomPreview) ui.memoryDomPreviewRefs.set(valueId, item);
                if (variableName === flashVarName && isTopLevel && flashIndex === idx) {
                    if (flashType === 'insert' || flashType === 'delete') row.classList.add(`flash-${flashType}`);
                    targetEl = row;
                }
                groupDiv.appendChild(row);
                if (Array.isArray(item) && !isCircularRef) {
                    const nextParentHeapIds = new Set(parentHeapIds);
                    if (itemHeapId) nextParentHeapIds.add(itemHeapId);
                    renderArrayRows(groupDiv, scopeId, variableName, item, existingRowIds, nextPath, depth + 1, nextParentHeapIds);
                }
            }
        };

        visibleScopes.forEach((scope) => {
            let scopeDiv = document.getElementById(scope.id);
            if (!scopeDiv) {
                scopeDiv = document.createElement('div'); scopeDiv.id = scope.id; scopeDiv.className = 'memory-scope'; scopeDiv.style.borderColor = 'rgba(255,255,255,0.1)';
                const path = scope.getPath(); const titleDiv = document.createElement('div'); titleDiv.className = 'scope-title';
                path.forEach((part, idx) => { const s = document.createElement('span'); s.className = 'breadcrumb-item'; s.innerText = part; titleDiv.appendChild(s); if (idx < path.length - 1) { const sep = document.createElement('span'); sep.className = 'breadcrumb-sep'; sep.innerText = '>'; titleDiv.appendChild(sep); } });
                scopeDiv.appendChild(titleDiv); const varsContainer = document.createElement('div'); varsContainer.id = `scope-vars-${scope.id}`; scopeDiv.appendChild(varsContainer); container.appendChild(scopeDiv);
            }
            const varsContainer = document.getElementById(`scope-vars-${scope.id}`);
            const activeVarNames = new Set(Object.keys(scope.variables).filter((name) => name !== 'document' && scope.variables[name].initialized !== false));
            Array.from(varsContainer.children).forEach(child => { if (!activeVarNames.has(child.getAttribute('data-var-name'))) child.remove(); });

            Object.keys(scope.variables).filter((name) => name !== 'document' && scope.variables[name].initialized !== false).forEach(name => {
                const v = scope.variables[name]; const groupId = `mem-group-${scope.id}-${name}`; let groupDiv = document.getElementById(groupId);
                ui.currentMemoryVarSnapshot.set(name, {
                    value: v.value,
                    initialized: v.initialized !== false,
                    functionAlias: v.functionAlias || null
                });
                if (!groupDiv) { groupDiv = document.createElement('div'); groupDiv.id = groupId; groupDiv.className = 'memory-group'; groupDiv.setAttribute('data-var-name', name); groupDiv.classList.add('cell-entry'); varsContainer.appendChild(groupDiv); }
                const shouldFlash = (name === flashVarName && flashType !== 'none' && flashIndex === null);
                let valStr;
                if (Array.isArray(v.value)) {
                    const heapId = ui.getHeapId(v.value);
                    const owner = heapId ? arrayOwners.get(heapId) : null;
                    valStr = (owner && owner !== name) ? `ref ${owner}` : `Array(${v.value.length})`;
                } else if (v.value && v.value.type && v.value.type.includes('func')) {
                    const paramsDisplay = Array.isArray(v.value.params) ? v.value.params.join(',') : `${v.value.params || ''}`;
                    valStr = v.functionAlias ? `${v.functionAlias}(${paramsDisplay})` : `f(${paramsDisplay})`;
                } else {
                    valStr = valueToVisualText(v.value);
                }
                const valueType = getMemoryTypeLabel(v.value, true);
                const rowId = `mem-row-${scope.id}-${name}-main`; let row = document.getElementById(rowId);
                if (!row) { row = document.createElement('div'); row.id = rowId; row.className = 'memory-cell'; groupDiv.insertBefore(row, groupDiv.firstChild); }
                const topValueId = Array.isArray(v.value) ? `mem-header-${name}` : `mem-val-${name}`;
                const topHasDomPreview = isVirtualDomValue(v.value);
                const topPreviewAttrs = topHasDomPreview ? ` data-dom-preview="true" data-dom-preview-id="${topValueId}"` : '';
                row.innerHTML = `<span class="mem-meta"><span class="mem-type">${escapeHtml(valueType)}</span></span><span class="mem-name">${name}</span><span class="mem-val" id="${topValueId}"${topPreviewAttrs}>${escapeHtml(valStr)}</span>`;
                if (topHasDomPreview) ui.memoryDomPreviewRefs.set(topValueId, v.value);
                row.className = 'memory-cell'; 
                if(Array.isArray(v.value)) row.classList.add('sticky-var');
                if(shouldFlash) { row.classList.add(`flash-${flashType}`); targetEl = row; }
                if (Array.isArray(v.value)) {
                    const existingRowIds = new Set(
                        Array.from(groupDiv.querySelectorAll('.array-element')).map((element) => element.id)
                    );
                    groupDiv.querySelectorAll('.array-element').forEach(r => r.remove());
                    const rootHeapId = ui.getHeapId(v.value);
                    const rootHeapIds = new Set();
                    if (rootHeapId) rootHeapIds.add(rootHeapId);
                    renderArrayRows(groupDiv, scope.id, name, v.value, existingRowIds, [], 1, rootHeapIds);
                } else { groupDiv.querySelectorAll('.array-element').forEach(r=>r.remove()); }
            });
        });
        if(targetEl) targetEl.scrollIntoView({ behavior: 'auto', block: 'center' }); 
    },

    animateArrayPop: async (arrName, index) => { if (ui.skipMode) return; await ui.ensureDrawerOpen('memory'); const valSpan = document.getElementById(`mem-val-${arrName}-${index}`); if(valSpan && valSpan.parentElement) { valSpan.parentElement.classList.add('cell-remove'); await ui.wait(400); } },
    highlightArrayElements: async (arrName, indices, type = 'delete') => { if(indices.length > 0) { await ui.ensureDrawerOpen('memory'); ui.ensureVisible(`mem-val-${arrName}-${indices[0]}`); } indices.forEach(i => { const el = document.getElementById(`mem-val-${arrName}-${i}`); if(el && el.parentElement) el.parentElement.classList.add(`flash-${type}`); }); },
    lockTokens: (ids) => ids.forEach(id => ui.lockedTokens.add(id)), unlockTokens: (ids) => ids.forEach(id => ui.lockedTokens.delete(id)),
    rememberTokenOriginal: (tokenId, el, isTransient = true) => {
        if (!ui.modifiedTokens.has(tokenId)) {
            ui.modifiedTokens.set(tokenId, { original: el.innerText, originalHtml: el.innerHTML, transient: isTransient });
        }
    },
    replaceTokenText: (tokenId, newValue, isTransient = true) => { if(ui.isStopping) return; const el = document.getElementById(tokenId); if (el) { ui.rememberTokenOriginal(tokenId, el, isTransient); el.innerText = valueToVisualText(newValue); el.classList.add('val-replacement'); } },
    setRawTokenText: (tokenId, text, isTransient = true) => { if(ui.isStopping) return; const el = document.getElementById(tokenId); if (el) { ui.rememberTokenOriginal(tokenId, el, isTransient); el.innerText = text; el.classList.add('val-replacement'); } },
    setTokenMarkup: (tokenId, html, isTransient = true) => { if(ui.isStopping) return; const el = document.getElementById(tokenId); if (el) { ui.rememberTokenOriginal(tokenId, el, isTransient); el.innerHTML = html; el.classList.add('val-replacement'); } },
    resetTokenText: (tokenId) => { const el = document.getElementById(tokenId); if (el && ui.modifiedTokens.has(tokenId)) { const data = ui.modifiedTokens.get(tokenId); if (Object.prototype.hasOwnProperty.call(data, 'originalHtml')) el.innerHTML = data.originalHtml; else el.innerText = data.original; el.classList.remove('val-replacement'); ui.modifiedTokens.delete(tokenId); } },
    resetVisuals: () => { for (const [id, data] of ui.modifiedTokens) { if (data.transient && !ui.lockedTokens.has(id)) { const el = document.getElementById(id); if (el) { if (Object.prototype.hasOwnProperty.call(data, 'originalHtml')) el.innerHTML = data.originalHtml; else el.innerText = data.original; el.classList.remove('val-replacement'); el.classList.remove('op-result'); el.style.opacity = '1'; el.style.display = 'inline'; el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; } ui.modifiedTokens.delete(id); } } const hidden = document.querySelectorAll('[style*="display: none"]'); hidden.forEach(el => { if(!ui.modifiedTokens.has(el.id) || (ui.modifiedTokens.get(el.id).transient && !ui.lockedTokens.has(el.id))) { el.style.display = 'inline'; el.style.opacity = '1'; el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; } }); },

    flyHelper: async (value, startEl, endEl, delayStart = true) => {
        if (!startEl || !endEl || ui.isStopping) return;
        const guide = createFlowGuideLine(startEl, endEl);
        try {
            // Scroll destination into view first
            endEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
            
            // Wait for scroll to reliably finish (fixed timing issue)
            await ui.wait(600); 
            
            if (ui.isStopping) return;

            const zIndex = 12000;

            // Re-calculate positions AFTER scroll is complete
            const start = startEl.getBoundingClientRect(); 
            const end = endEl.getBoundingClientRect();
            
            if (start.top < 0 || end.top < 0) return; 
            const flyer = document.createElement('div'); flyer.className = 'flying-element'; flyer.innerText = valueToVisualText(value); document.body.appendChild(flyer);
            
            flyer.style.zIndex = zIndex; 

            const fRect = flyer.getBoundingClientRect();
            const startX = start.left + (start.width - fRect.width) / 2;
            const startY = start.top + (start.height - fRect.height) / 2;
            flyer.style.left = `${startX}px`; flyer.style.top = `${startY}px`;
            if (delayStart) await ui.wait(150);
            if (ui.isStopping) { flyer.remove(); return; }
            const endX = end.left + (end.width - fRect.width) / 2;
            const endY = end.top + (end.height - fRect.height) / 2;
            const dx = endX - startX; const dy = endY - startY;
            await ui.wait(20);
            flyer.style.transition = `transform ${ui.baseDelay / ui.speedMultiplier}ms cubic-bezier(0.25, 1, 0.5, 1)`; 
            flyer.style.transform = `translate(${dx}px, ${dy}px)`;
            await ui.wait(ui.baseDelay); await ui.wait(100); flyer.remove();
        } finally {
            guide.stop();
        }
    },
    flyDomNodeHelper: async (startEl, endEl, delayStart = true) => {
        if (!startEl || !endEl || ui.isStopping) return;
        const guide = createFlowGuideLine(startEl, endEl);
        try {
            endEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await ui.wait(600);
            if (ui.isStopping) return;

            const start = startEl.getBoundingClientRect();
            const end = endEl.getBoundingClientRect();
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

    animateAssignment: async (varName, value, targetTokenId, index = null, varTokenId = null, codeIndexTokenId = null) => {
        if (ui.skipMode || ui.isStopping) return;
        await ui.ensureDrawerOpen('memory');
        await ui.wait(220);
        const tokenEl = document.getElementById(targetTokenId);
        const memId = ui.getMemoryValueElementId(varName, index);
        ui.ensureVisible(memId);
        const memEl = document.getElementById(memId);
        if (!tokenEl || !memEl) return;
        const clearVarHighlight = ui.setVariableRelationHighlight(varName, varTokenId || targetTokenId, true, index, codeIndexTokenId);
        try {
            await ui.animateWithFlowHighlight(tokenEl, memEl, async () => {
                await ui.flyHelper(value, tokenEl, memEl, false);
            });
        } finally {
            clearVarHighlight();
        }
    },
    animateRead: async (varName, value, targetTokenId, index = null, varTokenId = null, codeIndexTokenId = null) => {
        if (ui.skipMode || ui.isStopping) return;
        await ui.ensureDrawerOpen('memory');
        await ui.wait(220);
        const memId = ui.getMemoryValueElementId(varName, index);
        ui.ensureVisible(memId);
        const memEl = document.getElementById(memId);
        const tokenEl = document.getElementById(targetTokenId);
        if (!tokenEl || !memEl) return;
        const clearVarHighlight = ui.setVariableRelationHighlight(varName, varTokenId || targetTokenId, true, index, codeIndexTokenId);
        try {
            await ui.animateWithFlowHighlight(memEl, tokenEl, async () => {
                await ui.flyHelper(value, memEl, tokenEl, false);
            });
        } finally {
            clearVarHighlight();
        }
    },
    visualizeIdentifier: async (varName, value, domIds) => { if (!domIds || domIds.length === 0 || ui.isStopping) return; await ui.animateRead(varName, value, domIds[0]); ui.replaceTokenText(domIds[0], value, true); for(let i=1; i<domIds.length; i++) { const el = document.getElementById(domIds[i]); if(el) { if(!ui.modifiedTokens.has(domIds[i])) ui.modifiedTokens.set(domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await ui.wait(800); },
    animateReadHeader: async (varName, value, targetTokenId) => {
        if (ui.skipMode || ui.isStopping) return;
        await ui.ensureDrawerOpen('memory');
        await ui.wait(220);
        const memId = `mem-header-${varName}`;
        ui.ensureVisible(memId);
        const memEl = document.getElementById(memId);
        const tokenEl = document.getElementById(targetTokenId);
        if (!tokenEl || !memEl) return;
        const clearVarHighlight = ui.setVariableRelationHighlight(varName, targetTokenId, true);
        try {
            await ui.animateWithFlowHighlight(memEl, tokenEl, async () => {
                await ui.flyHelper(value, memEl, tokenEl, false);
            });
        } finally {
            clearVarHighlight();
        }
    },
    animateReturnHeader: async (varName, value, targetTokenId) => { await ui.animateReadHeader(varName, value, targetTokenId); },
    animateSpliceRead: async (varName, values, targetTokenId, startIndex) => {
        if (ui.skipMode || ui.isStopping) return;
        await ui.ensureDrawerOpen('memory');
        await ui.wait(220);
        const memId = `mem-val-${varName}-${startIndex}`;
        ui.ensureVisible(memId);
        const memEl = document.getElementById(memId);
        const tokenEl = document.getElementById(targetTokenId);
        if (!memEl || !tokenEl) return;
        const valStr = `[${values.map(v => JSON.stringify(formatValue(v))).join(', ')}]`;
        const clearVarHighlight = ui.setVariableRelationHighlight(varName, targetTokenId, true);
        try {
            await ui.animateWithFlowHighlight(memEl, tokenEl, async () => {
                await ui.flyHelper(valStr, memEl, tokenEl, false);
            });
        } finally {
            clearVarHighlight();
        }
    },
    animateOperationCollapse: async (domIds, result) => { if (ui.skipMode || ui.isStopping) return; const elements = domIds.map(id => document.getElementById(id)).filter(e => e); if (elements.length === 0) return; elements.forEach(el => { if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.backgroundColor = 'rgba(167, 139, 250, 0.4)'; el.style.boxShadow = '0 0 2px rgba(167, 139, 250, 0.6)'; }); await ui.wait(ui.baseDelay); elements.forEach(el => { el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; el.style.opacity = '0.5'; }); await ui.wait(ui.baseDelay); const first = elements[0]; first.innerText = valueToVisualText(result); first.style.opacity = '1'; first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) elements[i].style.display = 'none'; },
    animateReturnToCall: async (callDomIds, result, sourceId = null) => { if (ui.skipMode) { const elements = callDomIds.map(id => document.getElementById(id)).filter(e => e); if(elements.length > 0) { const first = elements[0]; if(!ui.modifiedTokens.has(first.id)) ui.modifiedTokens.set(first.id, { original: first.innerText, transient: true }); first.innerText = valueToVisualText(result); first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) { const el = elements[i]; if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.display = 'none'; } } return; } const startEl = document.getElementById(callDomIds[0]); if(!startEl) return; if (sourceId) { const sourceEl = document.getElementById(sourceId); if (sourceEl) { await ui.flyHelper(result, sourceEl, startEl, false); } } const elements = callDomIds.map(id => document.getElementById(id)).filter(e => e); elements.forEach(el => { if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.opacity = '0.5'; }); if (!sourceId) await ui.wait(ui.baseDelay); const first = elements[0]; first.innerText = valueToVisualText(result); first.style.opacity = '1'; first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) elements[i].style.display = 'none'; },
    animateParamPass: async (value, sourceId, targetId) => { if (ui.skipMode || ui.isStopping) return; const sourceEl = document.getElementById(sourceId); const targetEl = document.getElementById(targetId); await ui.flyHelper(value, sourceEl, targetEl); }
};

export const consoleUI = { clear: () => document.getElementById('console-output').innerHTML = '' };
