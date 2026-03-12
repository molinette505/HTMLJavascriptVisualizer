// @ts-nocheck

export const attachMemoryMethods = (ui, deps = {}) => {
    const {
        isVirtualDomValue,
        escapeHtml,
        buildDomInlineValueMarkup,
        buildMemoryMetaHtml,
        wrapMemoryValueMarkup,
        valueToVisualText,
        getMemoryTypeLabel
    } = deps;

    Object.assign(ui, {
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
        ui.lastScopeStack = scopeStack;
        ui.initMemoryDomTooltip();
        ui.hideMemoryDomTooltip();
        ui.hideCodeValueTooltip();
        ui.hideMemoryArrayPortal();
        ui.memoryDomPreviewRefs.clear();
        ui.currentMemoryVarSnapshot.clear();
        if(flashVarName && openDrawer) await ui.ensureDrawerOpen('memory');
        const container = document.getElementById('memory-container'); 
        let targetEl = null;
        const snapshotVarNamesForScope = (scope) => Object.keys(scope.variables).filter((name) => {
            if (name === 'document') return false;
            const entry = scope.variables[name];
            if (!entry) return false;
            return entry.declared !== false;
        });
        const visibleVarNamesForScope = (scope) => Object.keys(scope.variables).filter((name) => {
            if (name === 'document') return false;
            const entry = scope.variables[name];
            if (!entry || entry.hidden === true) return false;
            return entry.declared !== false;
        });
        const snapshotScopes = scopeStack.filter((scope) => {
            const names = snapshotVarNamesForScope(scope);
            return names.length > 0 || scope.name === 'Global';
        });
        const visibleScopes = scopeStack.filter((scope) => {
            const names = visibleVarNamesForScope(scope);
            return names.length > 0 || scope.name === 'Global';
        });
        const arrayOwners = new Map();
        snapshotScopes.forEach((scope) => {
            snapshotVarNamesForScope(scope).forEach((name) => {
                const currentValue = scope.variables[name].value;
                if (Array.isArray(currentValue)) {
                    const heapId = ui.getHeapId(currentValue);
                    if (heapId && !arrayOwners.has(heapId)) arrayOwners.set(heapId, name);
                }
            });
        });
        snapshotScopes.forEach((scope) => {
            snapshotVarNamesForScope(scope).forEach((name) => {
                const v = scope.variables[name];
                const heapId = Array.isArray(v.value) ? ui.getHeapId(v.value) : null;
                const owner = heapId ? arrayOwners.get(heapId) : null;
                const isArrayRef = Boolean(Array.isArray(v.value) && owner && owner !== name);
                ui.currentMemoryVarSnapshot.set(name, {
                    value: v.value,
                    initialized: v.initialized !== false,
                    functionAlias: v.functionAlias || null,
                    arrayOwner: isArrayRef ? owner : null
                });
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
                        ? (itemOwner ? `ref ${itemOwner}` : `length=${item.length}`)
                        : (item===undefined ? 'empty' : valueToVisualText(item)));
                const itemType = getMemoryTypeLabel(item, hasValue);
                const hasDomPreview = hasValue && isVirtualDomValue(item);
                const previewAttrs = hasDomPreview ? ` data-dom-preview="true" data-dom-preview-id="${valueId}"` : '';
                const valueMarkup = hasDomPreview ? buildDomInlineValueMarkup(item) : escapeHtml(displayValue);
                const metaHtml = buildMemoryMetaHtml({
                    typeLabel: itemType,
                    address: '',
                    showType: ui.showMemoryTypes,
                    showAddress: false
                });
                row.className = `memory-cell array-element ${metaHtml ? 'has-meta' : 'no-meta'}`;
                row.innerHTML = `${metaHtml}<span class="mem-name">[${idx}]</span><span class="mem-val" id="${valueId}"${previewAttrs}>${wrapMemoryValueMarkup(valueMarkup)}</span>`;
                if (hasDomPreview) ui.memoryDomPreviewRefs.set(valueId, item);
                if (variableName === flashVarName && isTopLevel && flashIndex === idx && ui.showFlowLine && !ui.showDataFlow) {
                    if (flashType && flashType !== 'none') row.classList.add(`flash-${flashType}`);
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
            const activeVarNames = new Set(visibleVarNamesForScope(scope));
            Array.from(varsContainer.children).forEach(child => { if (!activeVarNames.has(child.getAttribute('data-var-name'))) child.remove(); });

            visibleVarNamesForScope(scope).forEach(name => {
                const v = scope.variables[name]; const groupId = `mem-group-${scope.id}-${name}`; let groupDiv = document.getElementById(groupId);
                const heapId = Array.isArray(v.value) ? ui.getHeapId(v.value) : null;
                const owner = heapId ? arrayOwners.get(heapId) : null;
                const isArrayRef = Boolean(Array.isArray(v.value) && owner && owner !== name);
                if (!groupDiv) { groupDiv = document.createElement('div'); groupDiv.id = groupId; groupDiv.className = 'memory-group'; groupDiv.setAttribute('data-var-name', name); groupDiv.classList.add('cell-entry'); varsContainer.appendChild(groupDiv); }
                const shouldFlash = (
                    name === flashVarName
                    && flashType !== 'none'
                    && flashIndex === null
                    && ui.showFlowLine
                    && !ui.showDataFlow
                );
                let valStr;
                if (Array.isArray(v.value)) {
                    valStr = (owner && owner !== name) ? `ref ${owner}` : `length=${v.value.length}`;
                } else if (v.value && v.value.type && v.value.type.includes('func')) {
                    const paramsDisplay = Array.isArray(v.value.params) ? v.value.params.join(',') : `${v.value.params || ''}`;
                    valStr = v.functionAlias ? `${v.functionAlias}(${paramsDisplay})` : `f(${paramsDisplay})`;
                } else {
                    valStr = valueToVisualText(v.value);
                }
                const valueType = getMemoryTypeLabel(v.value, true);
                const displayType = isArrayRef ? 'ref array' : valueType;
                const rowId = `mem-row-${scope.id}-${name}-main`; let row = document.getElementById(rowId);
                if (!row) { row = document.createElement('div'); row.id = rowId; groupDiv.insertBefore(row, groupDiv.firstChild); }
                const topValueId = Array.isArray(v.value) ? `mem-header-${name}` : `mem-val-${name}`;
                const topHasDomPreview = isVirtualDomValue(v.value);
                const topPreviewAttrs = topHasDomPreview ? ` data-dom-preview="true" data-dom-preview-id="${topValueId}"` : '';
                const topValueMarkup = topHasDomPreview ? buildDomInlineValueMarkup(v.value) : escapeHtml(valStr);
                const metaHtml = buildMemoryMetaHtml({
                    typeLabel: displayType,
                    address: v.addr || '',
                    showType: ui.showMemoryTypes,
                    showAddress: ui.showMemoryAddresses
                });
                row.innerHTML = `${metaHtml}<span class="mem-name">${name}</span><span class="mem-val" id="${topValueId}"${topPreviewAttrs}>${wrapMemoryValueMarkup(topValueMarkup)}</span>`;
                if (topHasDomPreview) ui.memoryDomPreviewRefs.set(topValueId, v.value);
                row.className = `memory-cell ${metaHtml ? 'has-meta' : 'no-meta'}`;
                if(Array.isArray(v.value)) row.classList.add('sticky-var');
                if(shouldFlash) { row.classList.add(`flash-${flashType}`); targetEl = row; }
                if (Array.isArray(v.value) && !isArrayRef) {
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
        if (ui.p5ModeEnabled) ui.updateP5PanelsLayout();
    },

    animateArrayPop: async (arrName, index) => { if (ui.skipMode) return; await ui.ensureDrawerOpen('memory'); const valSpan = document.getElementById(`mem-val-${arrName}-${index}`); if(valSpan && valSpan.parentElement) { valSpan.parentElement.classList.add('cell-remove'); await ui.wait(400); } },
    highlightArrayElements: async (arrName, indices, type = 'delete') => {
        if(indices.length > 0) {
            await ui.ensureDrawerOpen('memory');
            ui.ensureVisible(`mem-val-${arrName}-${indices[0]}`);
        }
        const touchedRows = [];
        indices.forEach(i => {
            const el = document.getElementById(`mem-val-${arrName}-${i}`);
            const row = el && el.parentElement ? el.parentElement : null;
            if (!row) return;
            if (type) row.classList.add(`flash-${type}`);
            row.classList.add('array-cell-focus');
            touchedRows.push(row);
        });
        if (touchedRows.length > 0) {
            window.setTimeout(() => {
                touchedRows.forEach((row) => row.classList.remove('array-cell-focus'));
            }, Math.max(320, Math.round(720 / Math.max(0.1, ui.speedMultiplier))));
        }
    },
    });
};
