let notes = [12, 15, 9, 18];
let total = 0;

for (let i = 0; i < notes.length; i++) {
  total = total + notes[i];
}

console.log("total:", total);
console.log("moyenne:", total / notes.length);
