// @ts-nocheck
// File purpose: virtual DOM serialization helpers for plain and pretty HTML output.

const escapeHtmlText = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeHtmlAttr = (value) => escapeHtmlText(value).replace(/"/g, '&quot;');

const renderAttributes = (attributes) => Object.keys(attributes || {})
    .map((name) => `${name}="${escapeHtmlAttr(attributes[name])}"`)
    .join(' ');

export const serializeVirtualNode = (node, level = 0, pretty = false) => {
    if (!node) return '';
    if (node.__domType === 'text') {
        if (!pretty) return escapeHtmlText(node.textContent || '');
        const indent = '  '.repeat(level);
        return `${indent}${escapeHtmlText(node.textContent || '')}`;
    }
    if (node.__domType !== 'element') return '';
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
    const body = (virtualDocument && virtualDocument.body)
        ? virtualDocument.body
        : { __domType: 'element', tagName: 'body', attributes: {}, children: [] };
    return serializeVirtualNode(body, 0, pretty);
};
