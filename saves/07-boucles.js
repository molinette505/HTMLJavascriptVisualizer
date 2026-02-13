let i = 0;
let sommeFor = 0;
for (let n = 1; n <= 5; n++) {
  sommeFor += n;
}

let sommeWhile = 0;
while (i < 3) {
  sommeWhile += i;
  i++;
}

let count = 0;
do {
  count++;
} while (count < 2);

console.log("Somme for:", sommeFor);
console.log("Somme while:", sommeWhile);
console.log("Do while count:", count);
