let nomsEtudiants = ["Amira", "Leo", "Mia", "Noah"];
let notesEtudiants = [14, 11, 17, 9];
let recap = [];

// FOR: parcours de deux tableaux en parallele.
for (let i = 0; i < etudiants.length && i < notesEtudiants.length; i++) {
  let nom = nomsEtudiants[i];
  let note = notesEtudiants[i];
  let statut = note >= 12 ? "Reussi" : "A reprendre";
  recap.push(`${nomsEtudiants[i]}: ${note} (${statut})`);
}

console.log("Resultats (tableaux paralleles):");
// FOR: affichage final du recapitulatif.
for (let i = 0; i < recap.length; i++) {
  console.log(recap[i]);
}

