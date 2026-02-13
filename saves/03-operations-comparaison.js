let note = 78;
let seuil = 60;

let plusGrand = note > seuil;
let egal = note === seuil;
let different = note !== seuil;
let intervalle = note >= 70 && note <= 90;

console.log("note > seuil ?", plusGrand);
console.log("note === seuil ?", egal);
console.log("note !== seuil ?", different);
console.log("note dans [70, 90] ?", intervalle);
