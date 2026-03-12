// @ts-nocheck
// File purpose: structured console value rendering with expandable object/array trees.
import { formatValue } from '../core/config';
import { isVirtualDomValue } from '../core/virtualDom';

const truncateConsoleText = (value, max = 140) => {
    const text = String(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}...`;
};

const isFunctionDescriptorValue = (value) => Boolean(
    value
    && typeof value === 'object'
    && typeof value.type === 'string'
    && value.type.includes('func')
);

const getFunctionDescriptorLabel = (value) => {
    const params = Array.isArray(value && value.params) ? value.params : [];
    const joined = params.map((entry) => String(entry)).join(', ');
    if (value && value.name) return `f ${value.name}(${joined})`;
    return `f(${joined})`;
};

const getConsoleObjectEntries = (value) => {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) {
        const entries = [];
        for (let index = 0; index < value.length; index++) {
            if (Object.prototype.hasOwnProperty.call(value, index)) {
                entries.push([String(index), value[index]]);
            }
        }
        return entries;
    }
    if (value instanceof Map) {
        const entries = [];
        value.forEach((entryValue, entryKey) => {
            entries.push([String(entryKey), entryValue]);
        });
        return entries;
    }
    if (value instanceof Set) {
        const entries = [];
        Array.from(value.values()).forEach((entryValue, index) => {
            entries.push([String(index), entryValue]);
        });
        return entries;
    }
    return Object.keys(value).map((key) => [key, value[key]]);
};

const toConsoleInlinePreview = (value) => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${truncateConsoleText(value, 36)}"`;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    if (typeof value === 'function') return `f ${value.name || '(anonymous)'}()`;
    if (isVirtualDomValue(value)) return truncateConsoleText(String(formatValue(value)), 48);
    if (isFunctionDescriptorValue(value)) return getFunctionDescriptorLabel(value);
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value && typeof value === 'object') {
        const ctor = value.constructor && value.constructor.name ? value.constructor.name : 'Object';
        return ctor;
    }
    return truncateConsoleText(String(value), 36);
};

const createConsolePrimitiveNode = (value) => {
    const node = document.createElement('span');
    node.className = 'console-value';
    if (value === undefined) {
        node.classList.add('console-value-undefined');
        node.innerText = 'undefined';
        return node;
    }
    if (value === null) {
        node.classList.add('console-value-null');
        node.innerText = 'null';
        return node;
    }
    if (typeof value === 'string') {
        node.classList.add('console-value-string');
        node.innerText = `"${value}"`;
        return node;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        node.classList.add('console-value-number');
        node.innerText = String(value);
        return node;
    }
    if (typeof value === 'boolean') {
        node.classList.add('console-value-boolean');
        node.innerText = String(value);
        return node;
    }
    if (typeof value === 'function') {
        node.classList.add('console-value-function');
        node.innerText = `f ${value.name || '(anonymous)'}()`;
        return node;
    }
    if (isVirtualDomValue(value)) {
        node.classList.add('console-value-dom-node');
        node.innerText = String(formatValue(value));
        return node;
    }
    if (isFunctionDescriptorValue(value)) {
        node.classList.add('console-value-function');
        node.innerText = getFunctionDescriptorLabel(value);
        return node;
    }
    node.classList.add('console-value-generic');
    node.innerText = String(value);
    return node;
};

export const createConsoleValueNode = (value, stack = []) => {
    if (value && typeof value === 'object' && !isVirtualDomValue(value) && !isFunctionDescriptorValue(value)) {
        if (stack.includes(value)) {
            const circularNode = document.createElement('span');
            circularNode.className = 'console-value console-value-circular';
            circularNode.innerText = '[Circular]';
            return circularNode;
        }

        const details = document.createElement('details');
        details.className = 'console-object-tree';

        const summary = document.createElement('summary');
        summary.className = 'console-object-summary';
        const typeLabel = Array.isArray(value)
            ? `Array(${value.length})`
            : ((value.constructor && value.constructor.name) ? value.constructor.name : 'Object');
        const summaryType = document.createElement('span');
        summaryType.className = 'console-object-type';
        summaryType.innerText = typeLabel;
        summary.appendChild(summaryType);

        const entries = getConsoleObjectEntries(value);
        if (entries.length > 0) {
            const previewText = entries
                .slice(0, 3)
                .map(([entryKey, entryValue]) => (
                    Array.isArray(value)
                        ? toConsoleInlinePreview(entryValue)
                        : `${entryKey}: ${toConsoleInlinePreview(entryValue)}`
                ))
                .join(', ');
            const preview = document.createElement('span');
            preview.className = 'console-object-preview';
            preview.innerText = entries.length > 3 ? `${previewText}, ...` : previewText;
            summary.appendChild(preview);
        }

        details.appendChild(summary);

        const children = document.createElement('div');
        children.className = 'console-object-children';
        if (entries.length === 0) {
            const emptyRow = document.createElement('div');
            emptyRow.className = 'console-object-empty';
            emptyRow.innerText = '(empty)';
            children.appendChild(emptyRow);
        } else {
            entries.forEach(([entryKey, entryValue]) => {
                const row = document.createElement('div');
                row.className = 'console-object-row';
                const key = document.createElement('span');
                key.className = 'console-object-key';
                key.innerText = String(entryKey);
                row.appendChild(key);
                const separator = document.createElement('span');
                separator.className = 'console-object-separator';
                separator.innerText = ':';
                row.appendChild(separator);
                row.appendChild(createConsoleValueNode(entryValue, [...stack, value]));
                children.appendChild(row);
            });
        }
        details.appendChild(children);
        return details;
    }

    return createConsolePrimitiveNode(value);
};

export const filterRuntimeStack = (stackValue) => {
    if (!stackValue) return '';
    const lines = String(stackValue)
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
    const filtered = lines.filter((line) => !/interpreter\.ts|\bParser\b/i.test(line));
    return filtered.join('\n');
};
