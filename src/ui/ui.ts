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

const buildDomTreeMarkup = (node, depth = 0) => {
    if (!node) return '';
    const treeRef = getDomTreeRef(node);
    if (node.__domType === 'text') {
        const trimmed = String(node.textContent || '').trim();
        if (!trimmed) return '';
        const text = escapeHtml(trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed);
        return `<div id="dom-tree-node-${treeRef}" class="dom-tree-node dom-tree-text" style="margin-left:${depth * 18}px"><span class="dom-tree-text-label">TEXTE</span><span class="dom-tree-attr" data-dom-attr="text">"${text}"</span></div>`;
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
    const self = `<div id="dom-tree-node-${treeRef}" class="dom-tree-node" style="margin-left:${depth * 18}px"><span class="dom-tree-tag">${tag}</span>${idPart}${classPart}${attrsPart}</div>`;
    const children = (node.children || []).map((child) => buildDomTreeMarkup(child, depth + 1)).filter(Boolean).join('');
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

export const ui = {
    modifiedTokens: new Map(), lockedTokens: new Set(), 
    speedMultiplier: 1, baseDelay: 800, globalScale: 14, 
    skipMode: false, isDrawerOpen: false, isStopping: false,
    currentWaitResolver: null,
    heapRefs: new WeakMap(),
    heapRefCounter: 1,
    domDocument: null,
    domViewMode: 'tree',
    
    speeds: [0.1, 0.25, 0.5, 1, 1.5, 2, 4],
    speedIndex: 3, 
    adjustSpeed: (delta) => {
        ui.speedIndex = Math.max(0, Math.min(ui.speeds.length - 1, ui.speedIndex + delta));
        ui.speedMultiplier = ui.speeds[ui.speedIndex];
        document.getElementById('speed-display').innerText = ui.speedMultiplier + 'x';
        document.documentElement.style.setProperty('--time-scale', 1 / ui.speedMultiplier);
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
            if (ui.skipMode || ui.isStopping) { resolve(); return; }
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
        document.querySelectorAll('.flying-element').forEach(el => el.remove());
        document.querySelectorAll('.flying-dom-node').forEach(el => el.remove());
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
                html += `<span id="${t.id}" class="${className}">${escapeHtml(t.value)}</span>`;
            }
        });
        display.innerHTML = html;
        ui.modifiedTokens.clear(); ui.lockedTokens.clear();
    },
    resetDisplay: () => { 
        const globalEditor = window.editor;
        if (globalEditor && typeof globalEditor.refresh === 'function') {
            globalEditor.refresh();
        }
        document.getElementById('highlight-layer').innerHTML = ''; 
        document.getElementById('memory-container').innerHTML = ''; 
        document.getElementById('console-output').innerHTML = '';
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
        if(!running) document.getElementById('highlight-layer').innerHTML = ''; 
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
        if (ui.skipMode || ui.isStopping || !node || !tokenId) return;
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
        if (ui.skipMode || ui.isStopping || !tokenId || !node) return;
        const tokenEl = document.getElementById(tokenId);
        const target = ui.getDomTreeNodeElement(node);
        if (!tokenEl || !target) return;
        target.scrollIntoView({ behavior: 'auto', block: 'center' });
        await ui.animateWithFlowHighlight(tokenEl, target, async () => {
            await ui.flyHelper(value === null ? formatValue(node) : value, tokenEl, target, false);
        });
    },
    animateDomMutation: async (targetNode, sourceTokenId = null, payload = null) => {
        if (ui.skipMode || ui.isStopping || !targetNode) return;
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
    },
    animateDomPropertyMutation: async ({ targetNode, sourceTokenId = null, payload = null, property = '', applyMutation = null }) => {
        if (ui.skipMode || ui.isStopping || !targetNode) {
            if (typeof applyMutation === 'function') await applyMutation();
            return;
        }
        await ui.ensureDrawerOpen('dom');
        await ui.wait(220);
        ui.renderDomPanel();
        const targetEl = ui.getDomTreeNodeElement(targetNode);
        if (!targetEl) {
            if (typeof applyMutation === 'function') await applyMutation();
            ui.renderDomPanel();
            return;
        }
        const sourceEl = sourceTokenId ? document.getElementById(sourceTokenId) : null;
        const replacedNodes = (property === 'innerText' || property === 'innerHTML') ? (targetNode.children || []) : [];
        const replacedEls = replacedNodes.map((child) => ui.getDomTreeNodeElement(child)).filter(Boolean);
        const attrEls = ui.getDomAttributeElements(targetEl, property);
        const insertionTarget = ((property === 'innerText' || property === 'innerHTML') && replacedEls.length === 0)
            ? (() => {
                const placeholder = document.createElement('div');
                placeholder.className = 'dom-tree-node dom-insert-target dom-insert-space';
                placeholder.innerHTML = '<span class="dom-tree-attr">insertion</span>';
                targetEl.insertAdjacentElement('afterend', placeholder);
                return placeholder;
            })()
            : null;
        const flyTarget = replacedEls[0] || insertionTarget || targetEl;
        const flowEls = [sourceEl, targetEl].filter(Boolean);
        targetEl.scrollIntoView({ behavior: 'auto', block: 'center' });
        targetEl.classList.add('dom-parent-highlight');
        replacedEls.forEach((nodeEl) => nodeEl.classList.add('dom-replaced-highlight'));
        ui.setDomAttributeHighlight(attrEls, true);
        if (replacedEls.length > 0) flyTarget.classList.add('dom-insert-space');
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
        flyTarget.classList.remove('dom-insert-space');
        replacedEls.forEach((nodeEl) => nodeEl.classList.remove('dom-replaced-highlight'));
        if (refreshedTarget) refreshedTarget.classList.remove('dom-parent-highlight');
        ui.setDomAttributeHighlight(attrEls, false);
        ui.setDomAttributeHighlight(refreshedAttrEls, false);
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, false);
        await ui.wait(120);
    },
    animateDomAppendMutation: async ({ parentNode, childNode = null, sourceTokenId = null, applyMutation = null }) => {
        if (ui.skipMode || ui.isStopping || !parentNode) {
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
        if (ui.skipMode || ui.isStopping || !parentNode) {
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
        const removedEl = removedNode ? ui.getDomTreeNodeElement(removedNode) : null;
        const sourceEl = sourceTokenId ? document.getElementById(sourceTokenId) : null;
        const flowEls = [sourceEl, removedEl || parentEl].filter(Boolean);
        parentEl.scrollIntoView({ behavior: 'auto', block: 'center' });
        parentEl.classList.add('dom-parent-highlight');
        if (removedEl) removedEl.classList.add('dom-replaced-highlight');
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, true);
        await ui.wait(220);
        if (sourceEl && removedEl && removedNode) await ui.flyDomNodeFromToken(removedNode, sourceEl, removedEl, false);
        if (removedEl) {
            removedEl.classList.add('dom-remove-leave');
            await ui.wait(340);
        }
        if (typeof applyMutation === 'function') await applyMutation();
        ui.renderDomPanel();
        const refreshedParent = ui.getDomTreeNodeElement(parentNode);
        if (refreshedParent) refreshedParent.classList.add('dom-parent-highlight');
        await ui.wait(220);
        if (flowEls.length > 0) ui.setFlowHighlight(flowEls, false);
        parentEl.classList.remove('dom-parent-highlight');
        if (removedEl) {
            removedEl.classList.remove('dom-replaced-highlight');
            removedEl.classList.remove('dom-remove-leave');
        }
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
        const div = document.createElement('div'); div.className = `log-entry log-${type}`; div.innerText = msg; const box = document.getElementById('console-output'); box.appendChild(div); box.scrollTop = box.scrollHeight; 
    },
    
    consoleLog: async (args) => {
        if(ui.isStopping) return;
        await ui.ensureDrawerOpen('console');
        const box = document.getElementById('console-output');
        const div = document.createElement('div'); 
        div.className = `log-entry`; 
        const text = args.map(arg => {
            if (Array.isArray(arg)) return `[${arg.join(', ')}]`; 
            if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg); 
            return arg;
        }).join(' ');
        div.innerText = `> ${text}`;
        box.appendChild(div); 
        box.scrollTop = box.scrollHeight;
        div.classList.add('console-flash');
        await ui.wait(600); 
        div.classList.remove('console-flash');
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

    updateMemory: async (scopeStack, flashVarName = null, flashType = 'write', flashIndex = null) => {
        if(ui.isStopping) return;
        if(flashVarName) await ui.ensureDrawerOpen('memory');
        const container = document.getElementById('memory-container'); 
        let targetEl = null;
        const visibleScopes = scopeStack.filter((scope) => {
            const names = Object.keys(scope.variables).filter((name) => name !== 'document');
            return names.length > 0 || scope.name === 'Global';
        });
        const arrayOwners = new Map();
        visibleScopes.forEach((scope) => {
            Object.keys(scope.variables).filter((name) => name !== 'document').forEach((name) => {
                const currentValue = scope.variables[name].value;
                if (Array.isArray(currentValue)) {
                    const heapId = ui.getHeapId(currentValue);
                    if (heapId && !arrayOwners.has(heapId)) arrayOwners.set(heapId, name);
                }
            });
        });
        const visibleIds = new Set(visibleScopes.map(s => s.id));
        Array.from(container.children).forEach(child => { if (!visibleIds.has(child.id)) child.remove(); });
        const renderArrayRows = (groupDiv, scopeId, variableName, arr, path = [], depth = 1, parentHeapIds = new Set()) => {
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
                row.className = 'memory-cell array-element cell-entry';
                row.setAttribute('data-path', pathKey);
                row.style.paddingLeft = `${28 + (depth - 1) * 18}px`;
                const itemHeapId = (hasValue && Array.isArray(item)) ? ui.getHeapId(item) : null;
                const itemOwner = itemHeapId ? arrayOwners.get(itemHeapId) : null;
                const isCircularRef = Boolean(itemHeapId && parentHeapIds.has(itemHeapId));
                const displayValue = !hasValue
                    ? 'empty'
                    : (Array.isArray(item)
                        ? (itemOwner ? `ref ${itemOwner}` : `Array(${item.length})`)
                        : (item===undefined ? 'empty' : valueToVisualText(item)));
                row.innerHTML = `<span class="mem-addr"></span><span class="mem-name">[${idx}]</span><span class="mem-val" id="${valueId}">${escapeHtml(displayValue)}</span>`;
                if(variableName===flashVarName && isTopLevel && flashIndex===idx) { row.classList.add(`flash-${flashType}`); targetEl = row; }
                groupDiv.appendChild(row);
                if (Array.isArray(item) && !isCircularRef) {
                    const nextParentHeapIds = new Set(parentHeapIds);
                    if (itemHeapId) nextParentHeapIds.add(itemHeapId);
                    renderArrayRows(groupDiv, scopeId, variableName, item, nextPath, depth + 1, nextParentHeapIds);
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
            const activeVarNames = new Set(Object.keys(scope.variables).filter((name) => name !== 'document'));
            Array.from(varsContainer.children).forEach(child => { if (!activeVarNames.has(child.getAttribute('data-var-name'))) child.remove(); });

            Object.keys(scope.variables).filter((name) => name !== 'document').forEach(name => {
                const v = scope.variables[name]; const groupId = `mem-group-${scope.id}-${name}`; let groupDiv = document.getElementById(groupId);
                if (!groupDiv) { groupDiv = document.createElement('div'); groupDiv.id = groupId; groupDiv.className = 'memory-group'; groupDiv.setAttribute('data-var-name', name); groupDiv.classList.add('cell-entry'); varsContainer.appendChild(groupDiv); }
                const shouldFlash = (name === flashVarName && flashType !== 'none' && flashIndex === null);
                let valStr;
                if (Array.isArray(v.value)) {
                    const heapId = ui.getHeapId(v.value);
                    const owner = heapId ? arrayOwners.get(heapId) : null;
                    valStr = (owner && owner !== name) ? `ref ${owner}` : `Array(${v.value.length})`;
                } else if (v.value && v.value.type && v.value.type.includes('func')) {
                    valStr = `f(${v.value.params})`;
                } else {
                    valStr = valueToVisualText(v.value);
                }
                const rowId = `mem-row-${scope.id}-${name}-main`; let row = document.getElementById(rowId);
                if (!row) { row = document.createElement('div'); row.id = rowId; row.className = 'memory-cell'; groupDiv.insertBefore(row, groupDiv.firstChild); }
                row.innerHTML = `<span class="mem-addr">${v.addr}</span><span class="mem-name">${name}</span><span class="mem-val" id="${Array.isArray(v.value)?`mem-header-${name}`:`mem-val-${name}`}">${escapeHtml(valStr)}</span>`;
                row.className = 'memory-cell'; 
                if(Array.isArray(v.value)) row.classList.add('sticky-var');
                if(shouldFlash) { row.classList.add(`flash-${flashType}`); targetEl = row; }
                if (Array.isArray(v.value)) {
                    groupDiv.querySelectorAll('.array-element').forEach(r => r.remove());
                    const rootHeapId = ui.getHeapId(v.value);
                    const rootHeapIds = new Set();
                    if (rootHeapId) rootHeapIds.add(rootHeapId);
                    renderArrayRows(groupDiv, scope.id, name, v.value, [], 1, rootHeapIds);
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
    },
    flyDomNodeHelper: async (startEl, endEl, delayStart = true) => {
        if (!startEl || !endEl || ui.isStopping) return;
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
    },

    animateAssignment: async (varName, value, targetTokenId, index = null) => {
        if (ui.skipMode || ui.isStopping) return;
        await ui.ensureDrawerOpen('memory');
        await ui.wait(220);
        const tokenEl = document.getElementById(targetTokenId);
        const memId = ui.getMemoryValueElementId(varName, index);
        ui.ensureVisible(memId);
        const memEl = document.getElementById(memId);
        if (!tokenEl || !memEl) return;
        await ui.animateWithFlowHighlight(tokenEl, memEl, async () => {
            await ui.flyHelper(value, tokenEl, memEl, false);
        });
    },
    animateRead: async (varName, value, targetTokenId, index = null) => {
        if (ui.skipMode || ui.isStopping) return;
        await ui.ensureDrawerOpen('memory');
        await ui.wait(220);
        const memId = ui.getMemoryValueElementId(varName, index);
        ui.ensureVisible(memId);
        const memEl = document.getElementById(memId);
        const tokenEl = document.getElementById(targetTokenId);
        if (!tokenEl || !memEl) return;
        await ui.animateWithFlowHighlight(memEl, tokenEl, async () => {
            await ui.flyHelper(value, memEl, tokenEl, false);
        });
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
        await ui.animateWithFlowHighlight(memEl, tokenEl, async () => {
            await ui.flyHelper(value, memEl, tokenEl, false);
        });
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
        await ui.animateWithFlowHighlight(memEl, tokenEl, async () => {
            await ui.flyHelper(valStr, memEl, tokenEl, false);
        });
    },
    animateOperationCollapse: async (domIds, result) => { if (ui.skipMode || ui.isStopping) return; const elements = domIds.map(id => document.getElementById(id)).filter(e => e); if (elements.length === 0) return; elements.forEach(el => { if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.backgroundColor = 'rgba(167, 139, 250, 0.4)'; el.style.boxShadow = '0 0 2px rgba(167, 139, 250, 0.6)'; }); await ui.wait(ui.baseDelay); elements.forEach(el => { el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; el.style.opacity = '0.5'; }); await ui.wait(ui.baseDelay); const first = elements[0]; first.innerText = valueToVisualText(result); first.style.opacity = '1'; first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) elements[i].style.display = 'none'; },
    animateReturnToCall: async (callDomIds, result, sourceId = null) => { if (ui.skipMode) { const elements = callDomIds.map(id => document.getElementById(id)).filter(e => e); if(elements.length > 0) { const first = elements[0]; if(!ui.modifiedTokens.has(first.id)) ui.modifiedTokens.set(first.id, { original: first.innerText, transient: true }); first.innerText = valueToVisualText(result); first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) { const el = elements[i]; if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.display = 'none'; } } return; } const startEl = document.getElementById(callDomIds[0]); if(!startEl) return; if (sourceId) { const sourceEl = document.getElementById(sourceId); if (sourceEl) { await ui.flyHelper(result, sourceEl, startEl, false); } } const elements = callDomIds.map(id => document.getElementById(id)).filter(e => e); elements.forEach(el => { if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.opacity = '0.5'; }); if (!sourceId) await ui.wait(ui.baseDelay); const first = elements[0]; first.innerText = valueToVisualText(result); first.style.opacity = '1'; first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) elements[i].style.display = 'none'; },
    animateParamPass: async (value, sourceId, targetId) => { if (ui.skipMode || ui.isStopping) return; const sourceEl = document.getElementById(sourceId); const targetEl = document.getElementById(targetId); await ui.flyHelper(value, sourceEl, targetEl); }
};

export const consoleUI = { clear: () => document.getElementById('console-output').innerHTML = '' };
