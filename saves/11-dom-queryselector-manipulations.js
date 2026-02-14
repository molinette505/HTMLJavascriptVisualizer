let app = document.querySelector("section#shop.app.catalogue");
let imageHero = document.querySelector("img#hero.media.cover");
let status = document.querySelector("p#status.status");
let liste = document.querySelector("ul#products.list");
let cartePromo = document.querySelector("li#prod-b.card.promo");
let carteArchive = document.querySelector("li#prod-c.card.archive");
let zoneActions = document.querySelector("div#actions.actions");
let boutonRefresh = document.querySelector("button#refresh-btn.btn");

status.innerText = "Mise a jour du catalogue...";
imageHero.setAttribute("src", "https://images.unsplash.com/photo-1527443224154-c4f06179a351?auto=format&fit=crop&w=900&q=80");
imageHero.setAttribute("alt", "Poste gaming RGB");
imageHero.setAttribute("data-scene", "gaming");
app.setAttribute("data-version", "v2");
boutonRefresh.className = "btn active";
zoneActions.classList.add("visible");

let badgePrincipal = document.querySelector("span#badge-a.badge.nouveau");
badgePrincipal.className = "badge top-vente";

liste.removeChild(cartePromo);
liste.removeChild(carteArchive);

let nouvelleCarte1 = document.createElement("li");
nouvelleCarte1.className = "card nouveau";
nouvelleCarte1.setAttribute("id", "prod-d");
nouvelleCarte1.setAttribute("data-stock", "12");
nouvelleCarte1.innerHTML = "<span id=\"badge-d\" class=\"badge nouveau\">NOUVEAU</span><strong id=\"name-d\" class=\"name\">Souris sans fil</strong>";

let nouvelleCarte2 = document.createElement("li");
nouvelleCarte2.className = "card promo";
nouvelleCarte2.setAttribute("id", "prod-e");
nouvelleCarte2.setAttribute("data-stock", "7");
nouvelleCarte2.innerHTML = "<span id=\"badge-e\" class=\"badge promo\">PROMO</span><strong id=\"name-e\" class=\"name\">Micro USB</strong>";

liste.appendChild(nouvelleCarte1);
liste.appendChild(nouvelleCarte2);

let titreNouveau = document.querySelector("strong#name-d.name");
titreNouveau.setAttribute("title", "Edition 2026");

status.innerHTML = "<strong>Catalogue mis a jour</strong>";
console.log("Produits affiches:", liste.children.length);
