// @ts-nocheck
import { formatValue } from '../core/config';
import { isVirtualDomValue } from '../core/virtualDom';
import { escapeHtml } from './markup';

export const valueToVisualText = (value) => {
    if (value === undefined) return 'undefined';
    if (isVirtualDomValue(value)) return String(formatValue(value));
    if (Array.isArray(value)) return JSON.stringify(value);
    return JSON.stringify(formatValue(value));
};

export const valueToCodeVisualText = (value) => {
    if (isVirtualDomValue(value)) {
        if (value.__domType === 'element') return String(value.tagName || 'node').toLowerCase();
        if (value.__domType === 'text') return 'text';
        if (value.__domType === 'document') return 'document';
    }
    return valueToVisualText(value);
};

export const valueToCodePreviewText = (value, initialized = true, functionAlias = null) => {
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

export const getMemoryTypeLabel = (value, hasOwnValue = true) => {
    if (!hasOwnValue) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (isVirtualDomValue(value)) return 'dom-node';
    if (value && typeof value === 'object' && value.type && String(value.type).includes('func')) return 'function';
    if (typeof value === 'function') return 'function';
    return typeof value;
};

export const getCodePreviewTypeLabel = (snapshot) => {
    if (!snapshot || snapshot.initialized === false) return 'undefined';
    if (snapshot.arrayOwner && Array.isArray(snapshot.value)) return 'ref array';
    return getMemoryTypeLabel(snapshot.value, true);
};

export const buildMemoryMetaHtml = ({ typeLabel = '', address = '', showType = false, showAddress = false }) => {
    const parts = [];
    if (showAddress && address) parts.push(`<span class="mem-addr">${escapeHtml(address)}</span>`);
    if (showType && typeLabel) parts.push(`<span class="mem-type">${escapeHtml(typeLabel)}</span>`);
    return parts.length > 0 ? `<span class="mem-meta">${parts.join('')}</span>` : '';
};

export const wrapMemoryValueMarkup = (markup) => `<span class="mem-val-content">${markup}</span>`;

export const applyToggleButtonState = (button, isOn) => {
    if (!button) return;
    button.innerText = isOn ? 'ON' : 'OFF';
    button.classList.toggle('is-on', isOn);
    button.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    button.setAttribute('data-state', isOn ? 'on' : 'off');
};
