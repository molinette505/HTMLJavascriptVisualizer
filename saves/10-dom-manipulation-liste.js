let titre = document.getElementById("title");
let liste = document.querySelector("#items");
let champ = document.getElementById("item-input");
let status = document.getElementById("status");

titre.innerText = "Liste de courses (DOM)";
let valeurInitiale = champ.value;
status.innerHTML = "<strong>Chargement...</strong>";

let nouvelElement = document.createElement("li");
nouvelElement.className = "item nouveau";
nouvelElement.innerText = valeurInitiale;
liste.appendChild(nouvelElement);

let premier = document.querySelector(".item");
liste.removeChild(premier);

status.innerText = "Mise a jour terminee";

console.log("Input initial:", valeurInitiale);
console.log("Nombre d'elements:", liste.children.length);
