// @ts-nocheck
// File purpose: virtual DOM node classes and high-level document factory used by runtime simulation.

import { findById, findBySelector, findParentOfNode } from './virtualDomQuery';
import { serializeVirtualNode as serializeVirtualNodeImpl, serializeVirtualDocument as serializeVirtualDocumentImpl } from './virtualDomSerialize';
import { parseHtmlDocumentWithAdapters, parseHtmlFragmentWithAdapters } from './virtualDomParse';

const escapeHtmlText = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const normalizeTagName = (tagName) => String(tagName || 'div').trim().toLowerCase() || 'div';

const classListFrom = (className) => String(className || '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeStyleName = (name) => String(name || '').trim().toLowerCase();

const parseStyleDeclaration = (styleText) => {
    const styleMap = {};
    const source = String(styleText || '').trim();
    if (!source) return styleMap;
    source.split(';').forEach((chunk) => {
        const entry = chunk.trim();
        if (!entry) return;
        const colonIndex = entry.indexOf(':');
        if (colonIndex === -1) return;
        const rawName = entry.slice(0, colonIndex).trim();
        const rawValue = entry.slice(colonIndex + 1).trim();
        const name = normalizeStyleName(rawName);
        if (!name) return;
        styleMap[name] = rawValue;
    });
    return styleMap;
};

const styleDeclarationToString = (styleMap) => Object.keys(styleMap || {})
    .map((name) => `${name}: ${styleMap[name]}`)
    .join('; ');

const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const coerceToNode = (node) => {
    if (node instanceof VirtualElementNode || node instanceof VirtualTextNode) return node;
    if (node && (node.__domType === 'element' || node.__domType === 'text')) return node;
    if (node === null || node === undefined) throw new Error('DOM node attendu');
    return new VirtualTextNode(String(node));
};

// Adapter wrapper keeps node construction in this file while parser logic lives in virtualDomParse.ts.
function parseHtmlFragment(html) {
    return parseHtmlFragmentWithAdapters(html, {
        createElementNode: (tagName, attributes = {}) => new VirtualElementNode(tagName, attributes),
        createTextNode: (text) => new VirtualTextNode(text),
        normalizeTagName,
        isVoidTag: (tagName) => VOID_TAGS.has(tagName)
    });
}

// Always normalize parsed content to a VirtualElementNode('body') root.
function parseHtmlDocument(html) {
    return parseHtmlDocumentWithAdapters(html, {
        createElementNode: (tagName, attributes = {}) => new VirtualElementNode(tagName, attributes),
        createTextNode: (text) => new VirtualTextNode(text),
        normalizeTagName,
        isVoidTag: (tagName) => VOID_TAGS.has(tagName)
    });
}

export class VirtualTextNode {
    constructor(text = '') {
        this.__domType = 'text';
        this.textContent = String(text);
        this.children = [];
    }

    get innerText() {
        return this.textContent;
    }

    set innerText(value) {
        this.textContent = String(value);
    }

    get innerHTML() {
        return escapeHtmlText(this.textContent);
    }

    set innerHTML(value) {
        this.textContent = String(value);
    }

    get value() {
        return this.textContent;
    }

    set value(nextValue) {
        this.textContent = String(nextValue);
    }

    toJSON() {
        return this.textContent;
    }
}

export class VirtualElementNode {
    constructor(tagName = 'div', attributes = {}) {
        this.__domType = 'element';
        this.tagName = normalizeTagName(tagName);
        this.attributes = {};
        this._styleMap = {};
        this._listeners = {};
        this._onclickHandler = null;
        this.children = [];
        Object.keys(attributes || {}).forEach((name) => {
            this.setAttribute(name, attributes[name]);
        });
    }

    setAttribute(name, value) {
        const attrName = String(name);
        const attrValue = String(value);
        this.attributes[attrName] = attrValue;
        if (attrName === 'value') this._value = attrValue;
        if (attrName === 'style') this._styleMap = parseStyleDeclaration(attrValue);
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : undefined;
    }

    removeAttribute(name) {
        const attrName = String(name);
        delete this.attributes[attrName];
        if (attrName === 'style') this._styleMap = {};
    }

    _syncStyleAttribute() {
        const styleText = styleDeclarationToString(this._styleMap);
        if (!styleText) {
            delete this.attributes.style;
            return;
        }
        this.attributes.style = styleText;
    }

    get id() {
        return this.getAttribute('id') || '';
    }

    set id(value) {
        if (value === undefined || value === null || value === '') this.removeAttribute('id');
        else this.setAttribute('id', value);
    }

    get className() {
        return this.getAttribute('class') || '';
    }

    set className(value) {
        if (value === undefined || value === null || value === '') this.removeAttribute('class');
        else this.setAttribute('class', value);
    }

    get classList() {
        const owner = this;
        return {
            __domProxyType: 'classList',
            __domOwner: owner,
            add: (...tokens) => {
                const current = classListFrom(owner.className);
                tokens.forEach((token) => {
                    const normalized = String(token || '').trim();
                    if (!normalized) return;
                    if (!current.includes(normalized)) current.push(normalized);
                });
                owner.className = current.join(' ');
            },
            remove: (...tokens) => {
                const toRemove = new Set(tokens.map((token) => String(token || '').trim()).filter(Boolean));
                const next = classListFrom(owner.className).filter((entry) => !toRemove.has(entry));
                owner.className = next.join(' ');
            },
            contains: (token) => classListFrom(owner.className).includes(String(token || '').trim()),
            toggle: (token) => {
                const normalized = String(token || '').trim();
                if (!normalized) return false;
                const current = classListFrom(owner.className);
                if (current.includes(normalized)) {
                    owner.className = current.filter((entry) => entry !== normalized).join(' ');
                    return false;
                }
                current.push(normalized);
                owner.className = current.join(' ');
                return true;
            }
        };
    }

    get style() {
        const owner = this;
        return {
            __domProxyType: 'style',
            __domOwner: owner,
            addProperty: (name, value) => {
                const normalizedName = normalizeStyleName(name);
                if (!normalizedName) return;
                owner._styleMap[normalizedName] = String(value);
                owner._syncStyleAttribute();
            },
            setProperty: (name, value) => {
                const normalizedName = normalizeStyleName(name);
                if (!normalizedName) return;
                owner._styleMap[normalizedName] = String(value);
                owner._syncStyleAttribute();
            },
            removeProperty: (name) => {
                const normalizedName = normalizeStyleName(name);
                if (!normalizedName) return '';
                const previous = Object.prototype.hasOwnProperty.call(owner._styleMap, normalizedName)
                    ? owner._styleMap[normalizedName]
                    : '';
                delete owner._styleMap[normalizedName];
                owner._syncStyleAttribute();
                return previous;
            },
            getPropertyValue: (name) => {
                const normalizedName = normalizeStyleName(name);
                if (!normalizedName) return '';
                return owner._styleMap[normalizedName] || '';
            }
        };
    }

    addEventListener(type, handler) {
        const eventType = String(type || '').trim().toLowerCase();
        if (!eventType || !handler) return;
        if (!Array.isArray(this._listeners[eventType])) this._listeners[eventType] = [];
        this._listeners[eventType].push(handler);
    }

    addEventlistener(type, handler) {
        this.addEventListener(type, handler);
    }

    addEventListent(type, handler) {
        this.addEventListener(type, handler);
    }

    removeEventListener(type, handler) {
        const eventType = String(type || '').trim().toLowerCase();
        if (!eventType || !Array.isArray(this._listeners[eventType])) return;
        if (!handler) {
            this._listeners[eventType] = [];
            return;
        }
        this._listeners[eventType] = this._listeners[eventType].filter((entry) => entry !== handler);
    }

    removeEventlistener(type, handler) {
        this.removeEventListener(type, handler);
    }

    removeEventListent(type, handler) {
        this.removeEventListener(type, handler);
    }

    getEventHandlers(type) {
        const eventType = String(type || '').trim().toLowerCase();
        if (!eventType) return [];
        const handlers = [];
        if (eventType === 'click') {
            const inline = this.getAttribute('onclick');
            if (inline !== undefined && inline !== null && String(inline).trim() !== '') {
                handlers.push({ kind: 'inline-attr', handler: String(inline) });
            }
            if (this._onclickHandler) handlers.push({ kind: 'onclick-prop', handler: this._onclickHandler });
        }
        const listeners = Array.isArray(this._listeners[eventType]) ? this._listeners[eventType] : [];
        listeners.forEach((listener) => handlers.push({ kind: 'listener', handler: listener }));
        return handlers;
    }

    get onclick() {
        return this._onclickHandler;
    }

    set onclick(handler) {
        if (handler === undefined || handler === null) {
            this._onclickHandler = null;
            return;
        }
        this._onclickHandler = handler;
    }

    get value() {
        if (Object.prototype.hasOwnProperty.call(this.attributes, 'value')) return this.attributes.value;
        return this._value || '';
    }

    set value(nextValue) {
        this._value = String(nextValue);
        this.attributes.value = String(nextValue);
    }

    get innerText() {
        return this.children.map((child) => child.innerText || '').join('');
    }

    set innerText(nextValue) {
        this.children = [new VirtualTextNode(String(nextValue))];
    }

    get innerHTML() {
        return this.children.map((child) => serializeVirtualNode(child)).join('');
    }

    set innerHTML(nextValue) {
        this.children = parseHtmlFragment(String(nextValue));
    }

    appendChild(node) {
        const child = coerceToNode(node);
        this.children.push(child);
        return child;
    }

    removeChild(node) {
        const index = this.children.indexOf(node);
        if (index !== -1) {
            const removed = this.children[index];
            this.children.splice(index, 1);
            return removed;
        }
        const nestedParent = findParentOfNode(this, node);
        if (nestedParent) {
            const nestedIndex = nestedParent.children.indexOf(node);
            if (nestedIndex !== -1) {
                const removed = nestedParent.children[nestedIndex];
                nestedParent.children.splice(nestedIndex, 1);
                return removed;
            }
        }
        throw new Error('removeChild: noeud introuvable');
    }

    getElementById(id) {
        return findById(this, String(id));
    }

    querySelector(selector) {
        return findBySelector(this, String(selector));
    }

    describe() {
        const idPart = this.id ? `#${this.id}` : '';
        const classPart = this.className ? `.${classListFrom(this.className).join('.')}` : '';
        return `<${this.tagName}${idPart}${classPart}>`;
    }

    toJSON() {
        return this.describe();
    }
}

export class VirtualDocumentNode {
    constructor(bodyElement = new VirtualElementNode('body')) {
        this.__domType = 'document';
        this.body = bodyElement instanceof VirtualElementNode ? bodyElement : new VirtualElementNode('body');
    }

    createElement(tagName) {
        return new VirtualElementNode(tagName);
    }

    appendChild(node) {
        return this.body.appendChild(node);
    }

    removeChild(node) {
        return this.body.removeChild(node);
    }

    getElementById(id) {
        return this.body.getElementById(id);
    }

    querySelector(selector) {
        return this.body.querySelector(selector);
    }

    get innerText() {
        return this.body.innerText;
    }

    set innerText(nextValue) {
        this.body.innerText = nextValue;
    }

    get innerHTML() {
        return this.body.innerHTML;
    }

    set innerHTML(nextValue) {
        this.body.innerHTML = nextValue;
    }

    get value() {
        return this.body.value;
    }

    set value(nextValue) {
        this.body.value = nextValue;
    }

    toJSON() {
        return '[document]';
    }
}

export const isVirtualDomValue = (value) => Boolean(value && (value.__domType === 'document' || value.__domType === 'element' || value.__domType === 'text'));

export const serializeVirtualNode = serializeVirtualNodeImpl;
export const serializeVirtualDocument = serializeVirtualDocumentImpl;

export const createVirtualDocument = (html = '') => {
    const body = parseHtmlDocument(html);
    return new VirtualDocumentNode(body);
};
