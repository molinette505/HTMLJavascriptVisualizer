let prenom = "Julien";
let brut = "  bonjour javascript  ";
let propre = brut.trim();
let maj = propre.toUpperCase();
let remplace = maj.replace("JAVASCRIPT", "TOUT LE MONDE");
let contient = remplace.includes("BONJOUR");
let extrait = remplace.slice(0, 7);
let longueur = remplace.length;
let message = `Salut ${prenom}, ${5 + longueur}`;

console.log("String originale:", brut);
console.log("trim:", propre);
console.log("toUpperCase:", maj);
console.log("replace:", remplace);
console.log("includes:", contient);
console.log("slice:", extrait);
console.log("length:", longueur);
console.log("template literal:", message);
