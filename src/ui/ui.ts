// @ts-nocheck
import { TokenType } from '../core/language';
import { formatValue } from '../core/config';
import { refreshIcons } from './icons';

export const ui = {
    modifiedTokens: new Map(), lockedTokens: new Set(), 
    speedMultiplier: 1, baseDelay: 800, globalScale: 14, 
    skipMode: false, isDrawerOpen: false, isStopping: false,
    currentWaitResolver: null,
    heapRefs: new WeakMap(),
    heapRefCounter: 1,
    
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
        if(window.innerWidth >= 800) return; 
        document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');
        document.querySelectorAll('.drawer-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`view-${tabName}`).classList.add('active');
    },
    
    ensureDrawerOpen: (tabName) => {
        return new Promise(resolve => {
            if (ui.skipMode || ui.isStopping) { resolve(); return; }
            if (window.innerWidth >= 800) { resolve(); return; } 
            
            const panel = document.getElementById('right-panel');
            const targetContent = document.getElementById(`view-${tabName}`);
            
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
    },

    renderCode: (tokens) => {
        const display = document.getElementById('code-display');
        display.innerHTML = ''; let html = '';
        tokens.forEach(t => {
            let className = 'tok-ident';
            switch(t.type) { case TokenType.KEYWORD: className = 'tok-keyword'; break; case TokenType.STRING: className = 'tok-string'; break; case TokenType.NUMBER: className = 'tok-number'; break; case TokenType.BOOLEAN: className = 'tok-boolean'; break; case TokenType.COMMENT: className = 'tok-comment'; break; case TokenType.OPERATOR: className = 'tok-operator'; break; case TokenType.PUNCTUATION: className = 'tok-punctuation'; break; }
            if (t.type === 'WHITESPACE') html += t.value; else html += `<span id="${t.id}" class="${className}">${t.value}</span>`;
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
        const visibleScopes = scopeStack.filter(s => Object.keys(s.variables).length > 0 || s.name === 'Global');
        const arrayOwners = new Map();
        visibleScopes.forEach((scope) => {
            Object.keys(scope.variables).forEach((name) => {
                const currentValue = scope.variables[name].value;
                if (Array.isArray(currentValue)) {
                    const heapId = ui.getHeapId(currentValue);
                    if (heapId && !arrayOwners.has(heapId)) arrayOwners.set(heapId, name);
                }
            });
        });
        const visibleIds = new Set(visibleScopes.map(s => s.id));
        Array.from(container.children).forEach(child => { if (!visibleIds.has(child.id)) child.remove(); });

        visibleScopes.forEach((scope) => {
            let scopeDiv = document.getElementById(scope.id);
            if (!scopeDiv) {
                scopeDiv = document.createElement('div'); scopeDiv.id = scope.id; scopeDiv.className = 'memory-scope'; scopeDiv.style.borderColor = 'rgba(255,255,255,0.1)';
                const path = scope.getPath(); const titleDiv = document.createElement('div'); titleDiv.className = 'scope-title';
                path.forEach((part, idx) => { const s = document.createElement('span'); s.className = 'breadcrumb-item'; s.innerText = part; titleDiv.appendChild(s); if (idx < path.length - 1) { const sep = document.createElement('span'); sep.className = 'breadcrumb-sep'; sep.innerText = '>'; titleDiv.appendChild(sep); } });
                scopeDiv.appendChild(titleDiv); const varsContainer = document.createElement('div'); varsContainer.id = `scope-vars-${scope.id}`; scopeDiv.appendChild(varsContainer); container.appendChild(scopeDiv);
            }
            const varsContainer = document.getElementById(`scope-vars-${scope.id}`);
            const activeVarNames = new Set(Object.keys(scope.variables));
            Array.from(varsContainer.children).forEach(child => { if (!activeVarNames.has(child.getAttribute('data-var-name'))) child.remove(); });

            Object.keys(scope.variables).forEach(name => {
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
                    valStr = (v.value === undefined ? 'undefined' : JSON.stringify(formatValue(v.value)));
                }
                const rowId = `mem-row-${scope.id}-${name}-main`; let row = document.getElementById(rowId);
                if (!row) { row = document.createElement('div'); row.id = rowId; row.className = 'memory-cell'; groupDiv.insertBefore(row, groupDiv.firstChild); }
                row.innerHTML = `<span class="mem-addr">${v.addr}</span><span class="mem-name">${name}</span><span class="mem-val" id="${Array.isArray(v.value)?`mem-header-${name}`:`mem-val-${name}`}">${valStr}</span>`;
                row.className = 'memory-cell'; 
                if(Array.isArray(v.value)) row.classList.add('sticky-var');
                if(shouldFlash) { row.classList.add(`flash-${flashType}`); targetEl = row; }
                if (Array.isArray(v.value)) {
                    const existing = Array.from(groupDiv.querySelectorAll('.array-element')); existing.forEach(r => { if(parseInt(r.getAttribute('data-index')) >= v.value.length) r.remove(); });
                    v.value.forEach((item, idx) => {
                        const iId = `mem-row-${scope.id}-${name}-${idx}`; let iRow = document.getElementById(iId);
                        if (!iRow) { iRow = document.createElement('div'); iRow.id = iId; iRow.className = 'memory-cell array-element'; iRow.setAttribute('data-index', idx); iRow.classList.add('cell-entry'); groupDiv.appendChild(iRow); }
                        iRow.innerHTML = `<span class="mem-addr"></span><span class="mem-name">${idx}</span><span class="mem-val" id="mem-val-${name}-${idx}">${item===undefined?'empty':JSON.stringify(formatValue(item))}</span>`;
                        if(name===flashVarName && flashIndex===idx) { iRow.classList.add(`flash-${flashType}`); targetEl = iRow; }
                    });
                } else { groupDiv.querySelectorAll('.array-element').forEach(r=>r.remove()); }
            });
        });
        if(targetEl) targetEl.scrollIntoView({ behavior: 'auto', block: 'center' }); 
    },

    animateArrayPop: async (arrName, index) => { if (ui.skipMode) return; await ui.ensureDrawerOpen('memory'); const valSpan = document.getElementById(`mem-val-${arrName}-${index}`); if(valSpan && valSpan.parentElement) { valSpan.parentElement.classList.add('cell-remove'); await ui.wait(400); } },
    highlightArrayElements: async (arrName, indices, type = 'delete') => { if(indices.length > 0) { await ui.ensureDrawerOpen('memory'); ui.ensureVisible(`mem-val-${arrName}-${indices[0]}`); } indices.forEach(i => { const el = document.getElementById(`mem-val-${arrName}-${i}`); if(el && el.parentElement) el.parentElement.classList.add(`flash-${type}`); }); },
    lockTokens: (ids) => ids.forEach(id => ui.lockedTokens.add(id)), unlockTokens: (ids) => ids.forEach(id => ui.lockedTokens.delete(id)),
    replaceTokenText: (tokenId, newValue, isTransient = true) => { if(ui.isStopping) return; const el = document.getElementById(tokenId); if (el) { if (!ui.modifiedTokens.has(tokenId)) { ui.modifiedTokens.set(tokenId, { original: el.innerText, transient: isTransient }); } el.innerText = Array.isArray(newValue) ? JSON.stringify(newValue) : JSON.stringify(formatValue(newValue)); el.classList.add('val-replacement'); } },
    setRawTokenText: (tokenId, text, isTransient = true) => { if(ui.isStopping) return; const el = document.getElementById(tokenId); if (el) { if (!ui.modifiedTokens.has(tokenId)) ui.modifiedTokens.set(tokenId, { original: el.innerText, transient: isTransient }); el.innerText = text; el.classList.add('val-replacement'); } },
    resetTokenText: (tokenId) => { const el = document.getElementById(tokenId); if (el && ui.modifiedTokens.has(tokenId)) { const data = ui.modifiedTokens.get(tokenId); el.innerText = data.original; el.classList.remove('val-replacement'); ui.modifiedTokens.delete(tokenId); } },
    resetVisuals: () => { for (const [id, data] of ui.modifiedTokens) { if (data.transient && !ui.lockedTokens.has(id)) { const el = document.getElementById(id); if (el) { el.innerText = data.original; el.classList.remove('val-replacement'); el.classList.remove('op-result'); el.style.opacity = '1'; el.style.display = 'inline'; el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; } ui.modifiedTokens.delete(id); } } const hidden = document.querySelectorAll('[style*="display: none"]'); hidden.forEach(el => { if(!ui.modifiedTokens.has(el.id) || (ui.modifiedTokens.get(el.id).transient && !ui.lockedTokens.has(el.id))) { el.style.display = 'inline'; el.style.opacity = '1'; el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; } }); },

    flyHelper: async (value, startEl, endEl, delayStart = true) => {
        if (!startEl || !endEl || ui.isStopping) return;
        // Scroll destination into view first
        endEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
        
        // Wait for scroll to reliably finish (fixed timing issue)
        await ui.wait(600); 
        
        if (ui.isStopping) return;

        // Determine Z-Index based on locations
        // Drawer z-index is 100.
        // If both elements are in the editor (not in memory container), keep it low.
        const startInMem = startEl.closest('#memory-container');
        const endInMem = endEl.closest('#memory-container');
        const zIndex = (!startInMem && !endInMem) ? 90 : 9999;

        // Re-calculate positions AFTER scroll is complete
        const start = startEl.getBoundingClientRect(); 
        const end = endEl.getBoundingClientRect();
        
        if (start.top < 0 || end.top < 0) return; 
        const flyer = document.createElement('div'); flyer.className = 'flying-element'; flyer.innerText = JSON.stringify(formatValue(value)); document.body.appendChild(flyer);
        
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

    animateAssignment: async (varName, value, targetTokenId, index = null) => { if (ui.skipMode || ui.isStopping) return; await ui.ensureDrawerOpen('memory'); const tokenEl = document.getElementById(targetTokenId); const memId = ui.getMemoryValueElementId(varName, index); ui.ensureVisible(memId); const memEl = document.getElementById(memId); await ui.flyHelper(value, tokenEl, memEl); },
    animateRead: async (varName, value, targetTokenId, index = null) => { if (ui.skipMode || ui.isStopping) return; await ui.ensureDrawerOpen('memory'); const memId = ui.getMemoryValueElementId(varName, index); ui.ensureVisible(memId); const memEl = document.getElementById(memId); const tokenEl = document.getElementById(targetTokenId); await ui.flyHelper(value, memEl, tokenEl); },
    visualizeIdentifier: async (varName, value, domIds) => { if (!domIds || domIds.length === 0 || ui.isStopping) return; await ui.animateRead(varName, value, domIds[0]); ui.replaceTokenText(domIds[0], value, true); for(let i=1; i<domIds.length; i++) { const el = document.getElementById(domIds[i]); if(el) { if(!ui.modifiedTokens.has(domIds[i])) ui.modifiedTokens.set(domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await ui.wait(800); },
    animateReadHeader: async (varName, value, targetTokenId) => { if (ui.skipMode || ui.isStopping) return; await ui.ensureDrawerOpen('memory'); const memId = `mem-header-${varName}`; ui.ensureVisible(memId); const memEl = document.getElementById(memId); const tokenEl = document.getElementById(targetTokenId); await ui.flyHelper(value, memEl, tokenEl); },
    animateReturnHeader: async (varName, value, targetTokenId) => { await ui.animateReadHeader(varName, value, targetTokenId); },
    animateSpliceRead: async (varName, values, targetTokenId, startIndex) => { if (ui.skipMode || ui.isStopping) return; await ui.ensureDrawerOpen('memory'); const memId = `mem-val-${varName}-${startIndex}`; ui.ensureVisible(memId); const memEl = document.getElementById(memId); const tokenEl = document.getElementById(targetTokenId); if (!memEl || !tokenEl) return; const valStr = `[${values.map(v => JSON.stringify(formatValue(v))).join(', ')}]`; await ui.flyHelper(valStr, memEl, tokenEl); },
    animateOperationCollapse: async (domIds, result) => { if (ui.skipMode || ui.isStopping) return; const elements = domIds.map(id => document.getElementById(id)).filter(e => e); if (elements.length === 0) return; elements.forEach(el => { if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.backgroundColor = 'rgba(167, 139, 250, 0.4)'; el.style.boxShadow = '0 0 2px rgba(167, 139, 250, 0.6)'; }); await ui.wait(ui.baseDelay); elements.forEach(el => { el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; el.style.opacity = '0.5'; }); await ui.wait(ui.baseDelay); const first = elements[0]; first.innerText = JSON.stringify(formatValue(result)); first.style.opacity = '1'; first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) elements[i].style.display = 'none'; },
    animateReturnToCall: async (callDomIds, result, sourceId = null) => { if (ui.skipMode) { const elements = callDomIds.map(id => document.getElementById(id)).filter(e => e); if(elements.length > 0) { const first = elements[0]; if(!ui.modifiedTokens.has(first.id)) ui.modifiedTokens.set(first.id, { original: first.innerText, transient: true }); first.innerText = JSON.stringify(formatValue(result)); first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) { const el = elements[i]; if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.display = 'none'; } } return; } const startEl = document.getElementById(callDomIds[0]); if(!startEl) return; if (sourceId) { const sourceEl = document.getElementById(sourceId); if (sourceEl) { await ui.flyHelper(result, sourceEl, startEl, false); } } const elements = callDomIds.map(id => document.getElementById(id)).filter(e => e); elements.forEach(el => { if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.opacity = '0.5'; }); if (!sourceId) await ui.wait(ui.baseDelay); const first = elements[0]; first.innerText = JSON.stringify(formatValue(result)); first.style.opacity = '1'; first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) elements[i].style.display = 'none'; },
    animateParamPass: async (value, sourceId, targetId) => { if (ui.skipMode || ui.isStopping) return; const sourceEl = document.getElementById(sourceId); const targetEl = document.getElementById(targetId); await ui.flyHelper(value, sourceEl, targetEl); }
};

export const consoleUI = { clear: () => document.getElementById('console-output').innerHTML = '' };
