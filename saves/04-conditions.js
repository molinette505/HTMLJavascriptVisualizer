let temperature = 14;
let meteo = "pluie";

if (temperature < 0) {
  console.log("Il gele.");
} else if (temperature < 15) {
  console.log("Il fait frais.");
} else {
  console.log("Il fait doux.");
}

switch (meteo) {
  case "soleil":
    console.log("On sort les lunettes.");
    break;
  case "pluie":
    console.log("Prends un parapluie.");
    break;
  default:
    console.log("Meteo inconnue.");
}
