// Active le mode p5.js dans les options, puis lance.
// Ce sketch montre un deltaTime fixe configurable dans le panneau d'options.

let x = 40;
let vitesse = 140; // pixels / seconde

function setup() {
  createCanvas(520, 240);
  textFont('monospace');
}

function draw() {
  background(15, 23, 42);

  // Mouvement base sur deltaTime (ms -> secondes)
  const dt = deltaTime / 1000;
  x += vitesse * dt;

  if (x > width - 20 || x < 20) {
    vitesse *= -1;
  }

  noStroke();
  fill(59, 130, 246);
  circle(x, height * 0.55, 40);

  fill(226, 232, 240);
  textSize(16);
  text(`deltaTime = ${Math.round(deltaTime)} ms`, 12, 28);
  text(`dt = ${dt.toFixed(3)} s`, 12, 48);
}
