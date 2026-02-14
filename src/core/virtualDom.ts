// @ts-nocheck

const escapeHtmlText = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeHtmlAttr = (value) => escapeHtmlText(value).replace(/"/g, '&quot;');

const normalizeTagName = (tagName) => String(tagName || 'div').trim().toLowerCase() || 'div';

const normalizeSelector = (selector) => String(selector || '').trim();

const classListFrom = (className) => String(className || '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const parseSelector = (selector) => {
    const normalized = normalizeSelector(selector);
    if (!normalized) return null;
    const parsed = { tag: null, id: null, classes: [] };
    let current = '';
    let mode = 'tag';
    for (let index = 0; index < normalized.length; index++) {
        const char = normalized[index];
        if (char === '#') {
            if (mode === 'tag' && current) parsed.tag = current.toLowerCase();
            if (mode === 'class' && current) parsed.classes.push(current);
            if (mode === 'id' && current) parsed.id = current;
            current = '';
            mode = 'id';
            continue;
        }
        if (char === '.') {
            if (mode === 'tag' && current) parsed.tag = current.toLowerCase();
            if (mode === 'id' && current) parsed.id = current;
            if (mode === 'class' && current) parsed.classes.push(current);
            current = '';
            mode = 'class';
            continue;
        }
        current += char;
    }
    if (mode === 'tag' && current) parsed.tag = current.toLowerCase();
    if (mode === 'id' && current) parsed.id = current;
    if (mode === 'class' && current) parsed.classes.push(current);
    return parsed;
};

const matchesSelector = (element, selector) => {
    const parsed = parseSelector(selector);
    if (!parsed) return false;
    if (parsed.tag && element.tagName !== parsed.tag) return false;
    if (parsed.id && element.id !== parsed.id) return false;
    if (parsed.classes.length > 0) {
        const currentClasses = classListFrom(element.className);
        for (const className of parsed.classes) {
            if (!currentClasses.includes(className)) return false;
        }
    }
    return true;
};

const coerceToNode = (node) => {
    if (node instanceof VirtualElementNode || node instanceof VirtualTextNode) return node;
    if (node && (node.__domType === 'element' || node.__domType === 'text')) return node;
    if (node === null || node === undefined) throw new Error('DOM node attendu');
    return new VirtualTextNode(String(node));
};

const convertNativeNode = (nativeNode) => {
    if (!nativeNode) return null;
    if (nativeNode.nodeType === 3) return new VirtualTextNode(nativeNode.textContent || '');
    if (nativeNode.nodeType !== 1) return null;
    const element = new VirtualElementNode(nativeNode.tagName || 'div');
    if (nativeNode.attributes) {
        for (const attr of Array.from(nativeNode.attributes)) {
            element.setAttribute(attr.name, attr.value);
        }
    }
    for (const childNode of Array.from(nativeNode.childNodes || [])) {
        const child = convertNativeNode(childNode);
        if (child) element.children.push(child);
    }
    return element;
};

const parseAttributes = (rawAttributes) => {
    const attributes = {};
    const source = String(rawAttributes || '');
    const attributeRegex = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match = attributeRegex.exec(source);
    while (match) {
        const name = match[1];
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        attributes[name] = value;
        match = attributeRegex.exec(source);
    }
    return attributes;
};

const parseHtmlFragmentFallback = (html) => {
    const source = String(html || '');
    if (!source.trim()) return [];
    const root = new VirtualElementNode('fragment');
    const stack = [root];
    const tokenRegex = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g;
    let match = tokenRegex.exec(source);
    while (match) {
        const token = match[0];
        if (token.startsWith('<!--')) {
            match = tokenRegex.exec(source);
            continue;
        }
        if (token.startsWith('</')) {
            const closeMatch = token.match(/^<\s*\/\s*([^\s>]+)\s*>$/);
            if (closeMatch) {
                const closingTag = normalizeTagName(closeMatch[1]);
                for (let index = stack.length - 1; index > 0; index--) {
                    if (stack[index].tagName === closingTag) {
                        stack.length = index;
                        break;
                    }
                }
            }
            match = tokenRegex.exec(source);
            continue;
        }
        if (token.startsWith('<')) {
            const openMatch = token.match(/^<\s*([^\s/>]+)([^>]*)>$/);
            if (openMatch) {
                const tagName = normalizeTagName(openMatch[1]);
                const rawTail = openMatch[2] || '';
                const isSelfClosing = /\/\s*$/.test(rawTail) || VOID_TAGS.has(tagName);
                const rawAttributes = rawTail.replace(/\/\s*$/, '');
                const element = new VirtualElementNode(tagName, parseAttributes(rawAttributes));
                stack[stack.length - 1].children.push(element);
                if (!isSelfClosing) {
                    stack.push(element);
                }
                match = tokenRegex.exec(source);
                continue;
            }
        }
        stack[stack.length - 1].children.push(new VirtualTextNode(token));
        match = tokenRegex.exec(source);
    }
    return root.children;
};

const parseHtmlFragment = (html) => {
    const source = String(html || '');
    if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const nativeDocument = parser.parseFromString(`<body>${source}</body>`, 'text/html');
        const body = nativeDocument.body;
        const children = [];
        for (const childNode of Array.from(body.childNodes)) {
            const child = convertNativeNode(childNode);
            if (child) children.push(child);
        }
        return children;
    }
    return parseHtmlFragmentFallback(source);
};

const parseHtmlDocument = (html) => {
    const source = String(html || '');
    if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const nativeDocument = parser.parseFromString(source, 'text/html');
        const nativeBody = nativeDocument.body || nativeDocument.documentElement;
        const bodyElement = new VirtualElementNode('body');
        if (nativeBody) {
            for (const childNode of Array.from(nativeBody.childNodes || [])) {
                const child = convertNativeNode(childNode);
                if (child) bodyElement.children.push(child);
            }
        }
        return bodyElement;
    }
    const bodyElement = new VirtualElementNode('body');
    const bodyMatch = source.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : source;
    bodyElement.children = parseHtmlFragmentFallback(bodyHtml);
    return bodyElement;
};

const walkElements = (root, callback) => {
    if (!(root instanceof VirtualElementNode)) return;
    callback(root);
    for (const child of root.children) {
        if (child instanceof VirtualElementNode) walkElements(child, callback);
    }
};

const findById = (root, id) => {
    let found = null;
    walkElements(root, (element) => {
        if (found) return;
        if (element.id === id) found = element;
    });
    return found;
};

const findBySelector = (root, selector) => {
    let found = null;
    walkElements(root, (element) => {
        if (found) return;
        if (matchesSelector(element, selector)) found = element;
    });
    return found;
};

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
        this.children = [];
        Object.keys(attributes || {}).forEach((name) => {
            this.setAttribute(name, attributes[name]);
        });
    }

    setAttribute(name, value) {
        this.attributes[String(name)] = String(value);
        if (name === 'value') this._value = String(value);
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : undefined;
    }

    removeAttribute(name) {
        delete this.attributes[String(name)];
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
        if (index === -1) throw new Error('removeChild: noeud introuvable');
        const removed = this.children[index];
        this.children.splice(index, 1);
        return removed;
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

const renderAttributes = (attributes) => Object.keys(attributes || {})
    .map((name) => `${name}="${escapeHtmlAttr(attributes[name])}"`)
    .join(' ');

export const serializeVirtualNode = (node, level = 0, pretty = false) => {
    if (node instanceof VirtualTextNode || node.__domType === 'text') {
        if (!pretty) return escapeHtmlText(node.textContent || '');
        const indent = '  '.repeat(level);
        return `${indent}${escapeHtmlText(node.textContent || '')}`;
    }
    if (!(node instanceof VirtualElementNode) && node.__domType !== 'element') return '';
    const attributes = renderAttributes(node.attributes || {});
    const openTag = attributes ? `<${node.tagName} ${attributes}>` : `<${node.tagName}>`;
    const closeTag = `</${node.tagName}>`;
    const children = node.children || [];
    if (!pretty) {
        return `${openTag}${children.map((child) => serializeVirtualNode(child, 0, false)).join('')}${closeTag}`;
    }
    if (children.length === 0) {
        const indent = '  '.repeat(level);
        return `${indent}${openTag}${closeTag}`;
    }
    const onlyText = children.every((child) => child.__domType === 'text');
    if (onlyText) {
        const inlineText = children.map((child) => escapeHtmlText(child.textContent || '')).join('');
        const indent = '  '.repeat(level);
        return `${indent}${openTag}${inlineText}${closeTag}`;
    }
    const indent = '  '.repeat(level);
    const content = children.map((child) => serializeVirtualNode(child, level + 1, true)).join('\n');
    return `${indent}${openTag}\n${content}\n${indent}${closeTag}`;
};

export const serializeVirtualDocument = (virtualDocument, pretty = true) => {
    const body = (virtualDocument && virtualDocument.body) ? virtualDocument.body : new VirtualElementNode('body');
    return serializeVirtualNode(body, 0, pretty);
};

export const createVirtualDocument = (html = '') => {
    const body = parseHtmlDocument(html);
    return new VirtualDocumentNode(body);
};
