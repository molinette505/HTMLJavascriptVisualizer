// @ts-nocheck
// File purpose: reusable DOM tree/preview helper functions shared by UI modules.
import { formatValue } from '../core/config';
import { escapeHtml } from './markup';

export const resolveVirtualDomNodeByPath = (domDocument, path = '') => {
    const root = domDocument && domDocument.body ? domDocument.body : null;
    if (!root) return null;
    const normalized = String(path || '').trim();
    if (!normalized || normalized === '0') return root;
    const parts = normalized
        .split('.')
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry));
    if (parts.length === 0) return root;
    let cursor = root;
    const startIndex = parts[0] === 0 ? 1 : 0;
    for (let index = startIndex; index < parts.length; index++) {
        const childIndex = parts[index];
        if (!cursor || !Array.isArray(cursor.children) || childIndex < 0 || childIndex >= cursor.children.length) {
            return cursor;
        }
        cursor = cursor.children[childIndex];
    }
    return cursor || root;
};

const PREVIEW_VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const serializePreviewNode = (node, path = '0') => {
    if (!node) return '';
    if (node.__domType === 'text') return escapeHtml(String(node.textContent || ''));
    if (node.__domType !== 'element') return '';
    const tag = String(node.tagName || 'div').toLowerCase();
    const attrs = Object.keys(node.attributes || {})
        .map((name) => `${name}="${escapeHtml(String(node.attributes[name] || ''))}"`)
        .join(' ');
    const pathAttr = `data-vdom-path="${escapeHtml(path)}"`;
    const joinedAttrs = [attrs, pathAttr].filter(Boolean).join(' ').trim();
    const openTag = joinedAttrs ? `<${tag} ${joinedAttrs}>` : `<${tag}>`;
    if (PREVIEW_VOID_TAGS.has(tag)) return openTag;
    const children = (node.children || [])
        .map((child, index) => serializePreviewNode(child, `${path}.${index}`))
        .join('');
    return `${openTag}${children}</${tag}>`;
};

export const buildDomPreviewDocument = (domDocument, cssText = '') => {
    const bodyNode = (domDocument && domDocument.body) ? domDocument.body : null;
    const bodyMarkup = bodyNode ? serializePreviewNode(bodyNode, '0') : '<body data-vdom-path="0"></body>';
    const safeCss = String(cssText || '').replace(/<\/style/gi, '<\\/style');
    const styleBlock = safeCss.trim() ? `<style>${safeCss}</style>` : '';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styleBlock}</head>${bodyMarkup}</html>`;
};

const domTreeRefs = new WeakMap();
let domTreeRefCounter = 1;

export const getDomTreeRef = (node) => {
    if (!node || (typeof node !== 'object')) return null;
    let ref = domTreeRefs.get(node);
    if (!ref) {
        ref = `N${String(domTreeRefCounter++).padStart(4, '0')}`;
        domTreeRefs.set(node, ref);
    }
    return ref;
};

export const buildDomTreeMarkup = (node, depth = 0, includeIds = true, idPrefix = 'dom-tree-node-') => {
    if (!node) return '';
    const treeRef = getDomTreeRef(node);
    if (node.__domType === 'text') {
        const trimmed = String(node.textContent || '').trim();
        if (!trimmed) return '';
        const text = escapeHtml(trimmed);
        const idAttr = includeIds ? ` id="${idPrefix}${treeRef}"` : '';
        return `<div${idAttr} data-dom-tree-ref="${treeRef}" class="dom-tree-node dom-tree-text" style="margin-left:${depth * 18}px"><span class="dom-tree-text-label">TEXTE</span><span class="dom-tree-attr" data-dom-attr="text">"${text}"</span></div>`;
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
    const idAttr = includeIds ? ` id="${idPrefix}${treeRef}"` : '';
    const self = `<div${idAttr} data-dom-tree-ref="${treeRef}" class="dom-tree-node" style="margin-left:${depth * 18}px"><span class="dom-tree-tag">${tag}</span>${idPart}${classPart}${attrsPart}</div>`;
    const children = (node.children || []).map((child) => buildDomTreeMarkup(child, depth + 1, includeIds, idPrefix)).filter(Boolean).join('');
    return `${self}${children}`;
};

export const buildDomInlineValueMarkup = (node) => {
    if (!node) return '<span class="mem-dom-inline-empty">dom-node</span>';
    if (node.__domType === 'text') {
        const trimmed = String(node.textContent || '').trim();
        const text = escapeHtml(trimmed || '(vide)');
        return `<span class="mem-dom-inline mem-dom-inline-text"><span class="dom-tree-text-label">TEXTE</span><span class="dom-tree-attr">"${text}"</span></span>`;
    }
    if (node.__domType !== 'element') return `<span class="mem-dom-inline">${escapeHtml(String(formatValue(node)))}</span>`;

    const tag = escapeHtml(String(node.tagName || 'node').toLowerCase());
    const idPart = node.id ? `<span class="dom-tree-id">#${escapeHtml(node.id)}</span>` : '';
    const classes = String(node.className || '')
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((className) => `.${escapeHtml(className)}`)
        .join(' ');
    const classPart = classes ? `<span class="dom-tree-class">${classes}</span>` : '';
    const attrs = Object.keys(node.attributes || {})
        .filter((name) => name !== 'id' && name !== 'class')
        .map((name) => {
            const raw = String(node.attributes[name] || '');
            return `<span class="dom-tree-attr">[${escapeHtml(name)}="${escapeHtml(raw)}"]</span>`;
        })
        .join('');
    const attrsPart = attrs ? `<span class="dom-tree-attrs">${attrs}</span>` : '';
    return `<span class="mem-dom-inline"><span class="dom-tree-tag">${tag}</span>${idPart}${classPart}${attrsPart}</span>`;
};

export const mapDomPropertyToAttr = (property) => {
    const normalized = String(property || '').trim();
    if (!normalized) return '';
    if (normalized === 'className') return 'class';
    if (normalized === 'textContent' || normalized === 'innerText') return 'text';
    return normalized;
};

export const createDomFlyBadgeElement = (node) => {
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
