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

const splitSelectorGroups = (selector) => {
    const source = normalizeSelector(selector);
    if (!source) return [];
    const groups = [];
    let current = '';
    let bracketDepth = 0;
    let parenDepth = 0;
    let quote = null;
    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        if (quote) {
            current += char;
            if (char === '\\') {
                if (index + 1 < source.length) {
                    current += source[index + 1];
                    index++;
                }
                continue;
            }
            if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === '\'') {
            quote = char;
            current += char;
            continue;
        }
        if (char === '[') bracketDepth++;
        else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (char === '(') parenDepth++;
        else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
        if (char === ',' && bracketDepth === 0 && parenDepth === 0) {
            if (current.trim()) groups.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim()) groups.push(current.trim());
    return groups;
};

const parseAttributeSelector = (content) => {
    const normalized = String(content || '').trim();
    if (!normalized) return null;
    const match = normalized.match(/^([^\s~|^$*=\]]+)\s*(?:([~|^$*]?=)\s*(.+))?$/);
    if (!match) return null;
    const name = String(match[1] || '').trim();
    if (!name) return null;
    const op = match[2] ? String(match[2]).trim() : 'exists';
    let rawValue = match[3] ? String(match[3]).trim() : '';
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith('\'') && rawValue.endsWith('\''))) {
        rawValue = rawValue.slice(1, -1);
    }
    return { name, op, value: rawValue };
};

const parseNthExpression = (expression, index) => {
    const source = String(expression || '').trim().toLowerCase();
    if (!source) return false;
    if (source === 'odd') return index % 2 === 1;
    if (source === 'even') return index % 2 === 0;
    if (/^[+-]?\d+$/.test(source)) return index === Number(source);
    const compact = source.replace(/\s+/g, '');
    const nthMatch = compact.match(/^([+-]?\d*)n([+-]?\d+)?$/);
    if (!nthMatch) return false;
    const rawA = nthMatch[1];
    const rawB = nthMatch[2];
    let a = 0;
    if (rawA === '' || rawA === '+') a = 1;
    else if (rawA === '-') a = -1;
    else a = Number(rawA);
    const b = rawB ? Number(rawB) : 0;
    if (a === 0) return index === b;
    const diff = index - b;
    if ((diff / a) < 0) return false;
    return diff % a === 0;
};

const parseCompoundSelector = (compoundText) => {
    const source = String(compoundText || '').trim();
    if (!source) return null;
    const parsed = {
        tag: null,
        universal: false,
        id: null,
        classes: [],
        attributes: [],
        pseudos: []
    };
    let index = 0;
    const readIdentifier = () => {
        const start = index;
        while (index < source.length) {
            const char = source[index];
            if (char === '#' || char === '.' || char === '[' || char === ':' || char === ']' || char === '(' || char === ')' || /\s/.test(char)) break;
            index++;
        }
        return source.slice(start, index);
    };
    if (source[index] === '*') {
        parsed.universal = true;
        index++;
    } else if (source[index] && source[index] !== '#' && source[index] !== '.' && source[index] !== '[' && source[index] !== ':') {
        const tagName = readIdentifier();
        if (tagName) parsed.tag = tagName.toLowerCase();
    }
    while (index < source.length) {
        const char = source[index];
        if (char === '#') {
            index++;
            const idName = readIdentifier();
            if (idName) parsed.id = idName;
            continue;
        }
        if (char === '.') {
            index++;
            const className = readIdentifier();
            if (className) parsed.classes.push(className);
            continue;
        }
        if (char === '[') {
            index++;
            const start = index;
            let quote = null;
            while (index < source.length) {
                const current = source[index];
                if (quote) {
                    if (current === '\\') {
                        index += 2;
                        continue;
                    }
                    if (current === quote) quote = null;
                    index++;
                    continue;
                }
                if (current === '"' || current === '\'') {
                    quote = current;
                    index++;
                    continue;
                }
                if (current === ']') break;
                index++;
            }
            const attrText = source.slice(start, index);
            const attr = parseAttributeSelector(attrText);
            if (attr) parsed.attributes.push(attr);
            if (source[index] === ']') index++;
            continue;
        }
        if (char === ':') {
            index++;
            const pseudoStart = index;
            while (index < source.length && /[a-zA-Z0-9-]/.test(source[index])) index++;
            const pseudoName = source.slice(pseudoStart, index).toLowerCase();
            let pseudoArg = null;
            if (source[index] === '(') {
                index++;
                const argStart = index;
                let parenDepth = 1;
                let quote = null;
                while (index < source.length && parenDepth > 0) {
                    const current = source[index];
                    if (quote) {
                        if (current === '\\') {
                            index += 2;
                            continue;
                        }
                        if (current === quote) quote = null;
                        index++;
                        continue;
                    }
                    if (current === '"' || current === '\'') {
                        quote = current;
                        index++;
                        continue;
                    }
                    if (current === '(') parenDepth++;
                    else if (current === ')') parenDepth--;
                    index++;
                }
                pseudoArg = source.slice(argStart, Math.max(argStart, index - 1)).trim();
            }
            if (pseudoName) parsed.pseudos.push({ name: pseudoName, arg: pseudoArg });
            continue;
        }
        index++;
    }
    return parsed;
};

const parseSelectorChain = (selector) => {
    const source = normalizeSelector(selector);
    if (!source) return [];
    const tokens = [];
    let current = '';
    let bracketDepth = 0;
    let parenDepth = 0;
    let quote = null;
    const pushCompound = () => {
        const trimmed = current.trim();
        if (!trimmed) {
            current = '';
            return false;
        }
        tokens.push({ type: 'compound', value: trimmed });
        current = '';
        return true;
    };
    const pushCombinator = (value) => {
        if (tokens.length === 0) return;
        const last = tokens[tokens.length - 1];
        if (last.type === 'combinator') {
            if (value !== ' ') tokens[tokens.length - 1] = { type: 'combinator', value };
            return;
        }
        tokens.push({ type: 'combinator', value });
    };
    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        if (quote) {
            current += char;
            if (char === '\\') {
                if (index + 1 < source.length) {
                    current += source[index + 1];
                    index++;
                }
                continue;
            }
            if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === '\'') {
            quote = char;
            current += char;
            continue;
        }
        if (char === '[') {
            bracketDepth++;
            current += char;
            continue;
        }
        if (char === ']') {
            bracketDepth = Math.max(0, bracketDepth - 1);
            current += char;
            continue;
        }
        if (char === '(') {
            parenDepth++;
            current += char;
            continue;
        }
        if (char === ')') {
            parenDepth = Math.max(0, parenDepth - 1);
            current += char;
            continue;
        }
        if (bracketDepth === 0 && parenDepth === 0 && (char === '>' || char === '+' || char === '~')) {
            pushCompound();
            pushCombinator(char);
            continue;
        }
        if (bracketDepth === 0 && parenDepth === 0 && /\s/.test(char)) {
            const pushed = pushCompound();
            if (pushed) pushCombinator(' ');
            continue;
        }
        current += char;
    }
    pushCompound();
    while (tokens.length > 0 && tokens[tokens.length - 1].type === 'combinator') tokens.pop();
    const steps = [];
    let pendingCombinator = null;
    tokens.forEach((token) => {
        if (token.type === 'combinator') {
            pendingCombinator = token.value;
            return;
        }
        const parsedCompound = parseCompoundSelector(token.value);
        if (!parsedCompound) return;
        steps.push({
            combinator: steps.length === 0 ? null : (pendingCombinator || ' '),
            compound: parsedCompound
        });
        pendingCombinator = null;
    });
    return steps;
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
        if (matchesSelector(root, element, selector)) found = element;
    });
    return found;
};

const findParentOfNode = (root, node) => {
    if (!(root instanceof VirtualElementNode) || !node) return null;
    for (const child of root.children || []) {
        if (child === node) return root;
        if (child instanceof VirtualElementNode) {
            const match = findParentOfNode(child, node);
            if (match) return match;
        }
    }
    return null;
};

const getElementChildren = (node) => (node && node.children ? node.children.filter((child) => child && child.__domType === 'element') : []);

const getPreviousElementSibling = (root, node) => {
    const parent = findParentOfNode(root, node);
    if (!parent) return null;
    const siblings = getElementChildren(parent);
    const index = siblings.indexOf(node);
    if (index <= 0) return null;
    return siblings[index - 1];
};

const getPreviousElementSiblings = (root, node) => {
    const parent = findParentOfNode(root, node);
    if (!parent) return [];
    const siblings = getElementChildren(parent);
    const index = siblings.indexOf(node);
    if (index <= 0) return [];
    return siblings.slice(0, index).reverse();
};

const isEmptyElementNode = (node) => {
    const children = node && node.children ? node.children : [];
    for (const child of children) {
        if (child.__domType === 'element') return false;
        if (child.__domType === 'text' && String(child.textContent || '').trim() !== '') return false;
    }
    return true;
};

const matchesPseudoSelector = (root, element, pseudo) => {
    const name = String(pseudo && pseudo.name || '').toLowerCase();
    const arg = pseudo ? pseudo.arg : null;
    const parent = findParentOfNode(root, element);
    const siblings = parent ? getElementChildren(parent) : [];
    const siblingIndex = siblings.indexOf(element);
    const typeSiblings = parent
        ? siblings.filter((node) => String(node.tagName || '').toLowerCase() === String(element.tagName || '').toLowerCase())
        : [];
    const typeIndex = typeSiblings.indexOf(element);
    if (name === 'first-child') return siblingIndex === 0;
    if (name === 'last-child') return siblingIndex !== -1 && siblingIndex === siblings.length - 1;
    if (name === 'only-child') return siblingIndex !== -1 && siblings.length === 1;
    if (name === 'nth-child') return siblingIndex !== -1 && parseNthExpression(arg, siblingIndex + 1);
    if (name === 'first-of-type') return typeIndex === 0;
    if (name === 'last-of-type') return typeIndex !== -1 && typeIndex === typeSiblings.length - 1;
    if (name === 'only-of-type') return typeIndex !== -1 && typeSiblings.length === 1;
    if (name === 'nth-of-type') return typeIndex !== -1 && parseNthExpression(arg, typeIndex + 1);
    if (name === 'empty') return isEmptyElementNode(element);
    if (name === 'root') return element === root;
    if (name === 'not') {
        if (!arg) return true;
        const notCompound = parseCompoundSelector(arg);
        if (!notCompound) return true;
        return !matchesCompound(root, element, notCompound);
    }
    return false;
};

const matchesCompound = (root, element, compound) => {
    if (!compound || !element || element.__domType !== 'element') return false;
    if (compound.tag && String(element.tagName || '').toLowerCase() !== compound.tag) return false;
    if (compound.id && element.id !== compound.id) return false;
    if (compound.classes.length > 0) {
        const currentClasses = classListFrom(element.className);
        for (const className of compound.classes) {
            if (!currentClasses.includes(className)) return false;
        }
    }
    if (compound.attributes.length > 0) {
        for (const attr of compound.attributes) {
            const currentValue = element.getAttribute(attr.name);
            if (attr.op === 'exists') {
                if (currentValue === undefined) return false;
                continue;
            }
            if (currentValue === undefined) return false;
            const current = String(currentValue);
            const expected = String(attr.value || '');
            if (attr.op === '=' && current !== expected) return false;
            if (attr.op === '~=' && !current.split(/\s+/).filter(Boolean).includes(expected)) return false;
            if (attr.op === '|=' && !(current === expected || current.startsWith(`${expected}-`))) return false;
            if (attr.op === '^=' && !current.startsWith(expected)) return false;
            if (attr.op === '$=' && !current.endsWith(expected)) return false;
            if (attr.op === '*=' && !current.includes(expected)) return false;
        }
    }
    if (compound.pseudos.length > 0) {
        for (const pseudo of compound.pseudos) {
            if (!matchesPseudoSelector(root, element, pseudo)) return false;
        }
    }
    return true;
};

const matchesSelectorSteps = (root, candidate, steps) => {
    if (!steps || steps.length === 0) return false;
    let current = candidate;
    if (!matchesCompound(root, current, steps[steps.length - 1].compound)) return false;
    for (let index = steps.length - 1; index > 0; index--) {
        const combinator = steps[index].combinator || ' ';
        const expected = steps[index - 1].compound;
        if (combinator === '>') {
            const parent = findParentOfNode(root, current);
            if (!parent || !matchesCompound(root, parent, expected)) return false;
            current = parent;
            continue;
        }
        if (combinator === '+') {
            const sibling = getPreviousElementSibling(root, current);
            if (!sibling || !matchesCompound(root, sibling, expected)) return false;
            current = sibling;
            continue;
        }
        if (combinator === '~') {
            const siblings = getPreviousElementSiblings(root, current);
            const matched = siblings.find((node) => matchesCompound(root, node, expected));
            if (!matched) return false;
            current = matched;
            continue;
        }
        let parent = findParentOfNode(root, current);
        let matched = null;
        while (parent) {
            if (matchesCompound(root, parent, expected)) {
                matched = parent;
                break;
            }
            parent = findParentOfNode(root, parent);
        }
        if (!matched) return false;
        current = matched;
    }
    return true;
};

const matchesSelector = (root, element, selector) => {
    const groups = splitSelectorGroups(selector);
    if (groups.length === 0) return false;
    for (const group of groups) {
        const steps = parseSelectorChain(group);
        if (steps.length === 0) continue;
        if (matchesSelectorSteps(root, element, steps)) return true;
    }
    return false;
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
        this._styleMap = {};
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
