// @ts-nocheck
// File purpose: selector parsing and traversal utilities that emulate querySelector/getElementById behavior.

const normalizeSelector = (selector) => String(selector || '').trim();

const classListFrom = (className) => String(className || '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

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

// Convert one selector group into ordered compound steps + combinators.
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
            last.value = value;
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
        if (char === '[') bracketDepth++;
        else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (char === '(') parenDepth++;
        else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
        if (bracketDepth === 0 && parenDepth === 0 && (char === '>' || char === '+' || char === '~')) {
            pushCompound();
            pushCombinator(char);
            continue;
        }
        if (bracketDepth === 0 && parenDepth === 0 && /\s/.test(char)) {
            const pushed = pushCompound();
            if (pushed) pushCombinator(' ');
            while (index + 1 < source.length && /\s/.test(source[index + 1])) index++;
            continue;
        }
        current += char;
    }
    pushCompound();
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

const walkElements = (root, callback) => {
    if (!root || root.__domType !== 'element') return;
    callback(root);
    for (const child of root.children || []) {
        if (child && child.__domType === 'element') walkElements(child, callback);
    }
};

export const findById = (root, id) => {
    let found = null;
    walkElements(root, (element) => {
        if (found) return;
        if (String(element.id || '') === String(id || '')) found = element;
    });
    return found;
};

// Parent lookup is shared by sibling combinators and pseudo selectors.
export const findParentOfNode = (root, node) => {
    if (!root || root.__domType !== 'element' || !node) return null;
    for (const child of root.children || []) {
        if (child === node) return root;
        if (child && child.__domType === 'element') {
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

const getAttr = (element, name) => {
    if (!element) return undefined;
    if (typeof element.getAttribute === 'function') return element.getAttribute(name);
    if (element.attributes && Object.prototype.hasOwnProperty.call(element.attributes, name)) return element.attributes[name];
    return undefined;
};

// Evaluate CSS-like pseudo selectors against the current virtual node.
const matchesPseudoSelector = (root, element, pseudo) => {
    const name = String((pseudo && pseudo.name) || '').toLowerCase();
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
    if (compound.id && String(element.id || '') !== compound.id) return false;
    if (compound.classes.length > 0) {
        const currentClasses = classListFrom(element.className || getAttr(element, 'class') || '');
        for (const className of compound.classes) {
            if (!currentClasses.includes(className)) return false;
        }
    }
    if (compound.attributes.length > 0) {
        for (const attr of compound.attributes) {
            const currentValue = getAttr(element, attr.name);
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

// Walk selector steps from right-to-left, mirroring browser selector engines.
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

export const findBySelector = (root, selector) => {
    let found = null;
    walkElements(root, (element) => {
        if (found) return;
        if (matchesSelector(root, element, selector)) found = element;
    });
    return found;
};
