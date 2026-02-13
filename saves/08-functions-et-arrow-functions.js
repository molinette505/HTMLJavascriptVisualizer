function add(a, b) {
  return a + b;
}

function appliquer(x, operation) {
  return operation(x);
}

let doubler = (n) => n * 2;
let plusUn = function(n) { return n + 1; };

let total = add(4, 6);
let res1 = appliquer(5, doubler);
let res2 = appliquer(5, plusUn);

console.log("add(4, 6):", total);
console.log("appliquer(5, doubler):", res1);
console.log("appliquer(5, plusUn):", res2);
