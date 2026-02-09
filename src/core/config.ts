// @ts-nocheck
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
    if (typeof val === 'object' && val !== null && (val.type === 'arrow_func' || val.type === 'function_expr')) return `f (${val.params.join(',')})`;
    return val;
};
