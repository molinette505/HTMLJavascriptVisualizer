const DEFAULT_CODE = `// Démo Événements
function onClick() {
  console.log("Clic détecté !");
  counter = counter + 1;
}

let counter = 0;
console.log("Programme prêt.");
// Cliquez sur le bouton "souris" 
// une fois le code terminé.`;

const formatValue = (val) => {
    if (typeof val === 'number') return Number.isInteger(val) ? val : parseFloat(val.toFixed(4));
    if (Array.isArray(val)) return `[${val.map(v => JSON.stringify(v)).join(', ')}]`;
    if (typeof val === 'object' && val !== null && (val.type === 'arrow_func' || val.type === 'function_expr')) return `f (${val.params.join(',')})`;
    return val;
};
