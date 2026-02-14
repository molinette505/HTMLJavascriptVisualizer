function doubler(n) {
  return n * 2;
}

function appliquer(x, operation) {
  return operation(x);
}

let resultat = appliquer(5, doubler);
console.log("resultat:", resultat);
