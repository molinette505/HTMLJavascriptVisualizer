let notes = [12, 15, 18];

notes.push(20);
let dernier = notes.pop();
notes.unshift(10);
let premier = notes.shift();

notes.splice(1, 1, 16, 17);
let tranche = notes.slice(1, 3);
let taille = notes.length;

console.log("Dernier retire:", dernier);
console.log("Premier retire:", premier);
console.log("Notes:", notes);
console.log("Slice non destructif:", tranche);
console.log("Taille:", taille);
