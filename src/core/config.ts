// @ts-nocheck
import { isVirtualDomValue } from './virtualDom';

export const DEFAULT_CODE = `// Démo Événements
let a = [1, 2, 3];
let b = a; // b partage la meme reference que a

function onClick() {
  b.unshift(0); // modifie aussi a
  let removed = a.shift();
  console.log("removed:", removed);
  console.log("a:", a);
  console.log("b:", b);
}

console.log("Reference partagee: modifie b et observe a.");`;

export const formatValue = (val) => {
    if (typeof val === 'number') return Number.isInteger(val) ? val : parseFloat(val.toFixed(4));
    if (Array.isArray(val)) return `[${val.map(v => JSON.stringify(v)).join(', ')}]`;
    if (isVirtualDomValue(val)) {
        if (val.__domType === 'document') return '[document]';
        if (val.__domType === 'text') return `"${val.textContent}"`;
        const tag = String(val.tagName || 'node').toLowerCase();
        const idPart = val.id ? `#${val.id}` : '';
        const classPart = val.className ? `.${String(val.className).trim().replace(/\s+/g, '.')}` : '';
        const attrsPart = Object.keys(val.attributes || {})
            .filter((name) => name !== 'id' && name !== 'class')
            .map((name) => {
                const attrValue = String(val.attributes[name]).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                return `[${name}="${attrValue}"]`;
            })
            .join('');
        return `${tag}${idPart}${classPart}${attrsPart}`;
    }
    if (typeof val === 'object' && val !== null && (val.type === 'arrow_func' || val.type === 'function_expr')) return `f (${val.params.join(',')})`;
    if (typeof val === 'object' && val !== null && val.type === 'function_decl_ref') return val.name || 'f()';
    return val;
};
