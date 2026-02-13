// WHILE: on repete tant que la condition est vraie.
// Exemple: une batterie qui se charge jusqu'a 100%.
let batterie = 20;
while (batterie < 100) {
  batterie += 20;
  console.log(`Charge batterie: ${batterie}%`);
}

// FOR: parcours d'un tableau avec un index.
// Exemple: lecture des temperatures et calcul de la moyenne.
let temperatures = [18, 21, 19, 24, 20];
let somme = 0;
for (let i = 0; i < temperatures.length; i++) {
  somme += temperatures[i];
  console.log(`temperatures[${i}] = ${temperatures[i]}`);
}
let moyenne = somme / temperatures.length;

// DO WHILE: execute au moins une fois, puis teste la condition.
let essais = 0;
do {
  essais++;
} while (essais < 2);

console.log("Batterie finale:", batterie);
console.log("Moyenne des temperatures:", moyenne);
console.log("Compteur do while:", essais);
