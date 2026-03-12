// @ts-nocheck
// File purpose: HTML-to-virtual-node parsing helpers with adapters for node construction.

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

// Convert browser DOM nodes into project-specific virtual node instances.
const convertNativeNode = (nativeNode, deps) => {
    if (!nativeNode) return null;
    if (nativeNode.nodeType === 3) return deps.createTextNode(nativeNode.textContent || '');
    if (nativeNode.nodeType !== 1) return null;
    const element = deps.createElementNode(nativeNode.tagName || 'div');
    if (nativeNode.attributes) {
        for (const attr of Array.from(nativeNode.attributes)) {
            element.setAttribute(attr.name, attr.value);
        }
    }
    for (const childNode of Array.from(nativeNode.childNodes || [])) {
        const child = convertNativeNode(childNode, deps);
        if (child) element.children.push(child);
    }
    return element;
};

// Lightweight parser fallback used when DOMParser is unavailable (tests/non-browser envs).
const parseHtmlFragmentFallback = (html, deps) => {
    const source = String(html || '');
    if (!source.trim()) return [];
    const root = deps.createElementNode('fragment');
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
                const closingTag = deps.normalizeTagName(closeMatch[1]);
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
                const tagName = deps.normalizeTagName(openMatch[1]);
                const rawTail = openMatch[2] || '';
                const isSelfClosing = /\/\s*$/.test(rawTail) || deps.isVoidTag(tagName);
                const rawAttributes = rawTail.replace(/\/\s*$/, '');
                const element = deps.createElementNode(tagName, parseAttributes(rawAttributes));
                stack[stack.length - 1].children.push(element);
                if (!isSelfClosing) {
                    stack.push(element);
                }
                match = tokenRegex.exec(source);
                continue;
            }
        }
        stack[stack.length - 1].children.push(deps.createTextNode(token));
        match = tokenRegex.exec(source);
    }
    return root.children;
};

// Parse an HTML fragment and create nodes through adapters supplied by virtualDom.ts.
export const parseHtmlFragmentWithAdapters = (html, deps) => {
    const source = String(html || '');
    if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const nativeDocument = parser.parseFromString(`<body>${source}</body>`, 'text/html');
        const body = nativeDocument.body;
        const children = [];
        for (const childNode of Array.from(body.childNodes)) {
            const child = convertNativeNode(childNode, deps);
            if (child) children.push(child);
        }
        return children;
    }
    return parseHtmlFragmentFallback(source, deps);
};

// Parse a full HTML document and normalize output to a virtual <body> element.
export const parseHtmlDocumentWithAdapters = (html, deps) => {
    const source = String(html || '');
    if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const nativeDocument = parser.parseFromString(source, 'text/html');
        const nativeBody = nativeDocument.body || nativeDocument.documentElement;
        const bodyElement = deps.createElementNode('body');
        if (nativeBody) {
            for (const childNode of Array.from(nativeBody.childNodes || [])) {
                const child = convertNativeNode(childNode, deps);
                if (child) bodyElement.children.push(child);
            }
        }
        return bodyElement;
    }
    const bodyElement = deps.createElementNode('body');
    const bodyMatch = source.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : source;
    bodyElement.children = parseHtmlFragmentFallback(bodyHtml, deps);
    return bodyElement;
};
