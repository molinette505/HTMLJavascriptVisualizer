let note = 14;
let resultat = "";

if (note >= 16) {
  resultat = "Excellent";
} else if (note >= 12) {
  resultat = "Reussi";
} else {
  resultat = "A reprendre";
}

let jour = 3;
let nomJour = "";

switch (jour) {
  case 1:
    nomJour = "Lundi";
    break;
  case 2:
    nomJour = "Mardi";
    break;
  case 3:
    nomJour = "Mercredi";
    break;
  default:
    nomJour = "Inconnu";
}

console.log("resultat:", resultat);
console.log("nomJour:", nomJour);

