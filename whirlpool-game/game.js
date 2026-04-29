const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const speedEl = document.querySelector("#speed");
const countEl = document.querySelector("#count");
const paintEl = document.querySelector("#paint");
const boostBtn = document.querySelector("#boost");
const resetBtn = document.querySelector("#reset");
const dropButtons = document.querySelectorAll("[data-drop]");

const DPR_MAX = 2;
const BASE_SPIN = 0.72;
const BOOST_IMPULSE = 0.82;
const MAX_SPIN = 8.8;
const SPIN_DECAY = 0.86;
const CENTER_PULL = 0.11;
const ITEM_SWIRL = 1.65;

const dropTypes = {
  boat: { label: "小船", count: 1 },
  balls: { label: "海洋球", count: 16 },
  fish: { label: "小鱼玩具", count: 1 },
  paint: { label: "颜料", count: 7 },
};

const ballColors = ["#ff5c8a", "#ffe45e", "#52e0a5", "#41d8ff", "#9b7cff", "#ff9f43"];
const paintColors = ["#ff4f8b", "#44d7ff", "#ffd166", "#7ce577", "#b56cff"];

let width = 0;
let height = 0;
let dpr = 1;
let lastTime = performance.now();
let spin = BASE_SPIN;
let angle = 0;
let swallowedCount = 0;
let paintLevel = 0;
let items = [];
let droplets = [];

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
  const rect = canvas.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resetGame() {
  spin = BASE_SPIN;
  angle = 0;
  swallowedCount = 0;
  paintLevel = 0;
  items = [];
  droplets = [];
  updateHud();
}

function boost() {
  spin = Math.min(MAX_SPIN, spin + BOOST_IMPULSE);
}

function drop(type) {
  const config = dropTypes[type];
  if (!config) return;

  if (type === "balls") {
    for (let i = 0; i < config.count; i += 1) {
      const spawn = getSpawnPoint(i, config.count);
      items.push(createItem("ball", spawn.x, spawn.y, i * 0.12));
    }
    return;
  }

  if (type === "paint") {
    for (let i = 0; i < config.count; i += 1) {
      const spawn = getSpawnPoint(i, config.count);
      items.push(createItem("paint", spawn.x, spawn.y, i * 0.06));
    }
    return;
  }

  const spawn = getSpawnPoint(0, 1);
  items.push(createItem(type, spawn.x, spawn.y, 0));
}

function getSpawnPoint(index, total) {
  const center = getCenter();
  const radius = Math.min(width, height) * 0.42;
  const spread = total === 1 ? random(-0.3, 0.3) : (index / total) * Math.PI * 0.9 - Math.PI * 0.45;
  const side = random(0, Math.PI * 2);
  const theta = side + spread;

  return {
    x: center.x + Math.cos(theta) * radius + random(-26, 26),
    y: center.y + Math.sin(theta) * radius + random(-24, 24),
  };
}

function createItem(kind, x, y, delay) {
  const center = getCenter();
  const dx = x - center.x;
  const dy = y - center.y;
  return {
    kind,
    x,
    y,
    delay,
    radius: Math.max(36, Math.hypot(dx, dy)),
    theta: Math.atan2(dy, dx),
    scale: 1,
    alpha: 1,
    spin: random(-0.8, 0.8),
    rotation: random(0, Math.PI * 2),
    color: kind === "paint" ? paintColors[Math.floor(Math.random() * paintColors.length)] : ballColors[Math.floor(Math.random() * ballColors.length)],
  };
}

function update(dt) {
  spin = Math.max(BASE_SPIN, spin - SPIN_DECAY * dt);
  angle += spin * dt;

  const center = getCenter();
  items = items.filter((item) => {
    item.delay -= dt;
    if (item.delay > 0) return true;

    const pull = CENTER_PULL * (0.75 + spin * 0.08);
    item.radius -= item.radius * pull * dt;
    item.theta += (ITEM_SWIRL + spin * 0.34) * dt;
    item.rotation += (item.spin + spin * 0.22) * dt;
    item.x = center.x + Math.cos(item.theta) * item.radius;
    item.y = center.y + Math.sin(item.theta) * item.radius;
    item.scale = clamp(item.radius / (Math.min(width, height) * 0.42), 0.08, 1);
    item.alpha = clamp(item.scale * 1.25, 0, 1);

    if (item.kind === "paint" && Math.random() < dt * 18) {
      droplets.push({
        x: item.x,
        y: item.y,
        color: item.color,
        size: random(4, 12),
        life: random(0.45, 1.15),
      });
    }

    if (item.radius < 18) {
      swallow(item);
      return false;
    }

    return true;
  });

  droplets = droplets.filter((drop) => {
    drop.life -= dt;
    drop.size *= 0.992;
    return drop.life > 0;
  });

  updateHud();
}

function swallow(item) {
  swallowedCount += 1;
  if (item.kind === "paint") {
    paintLevel = Math.min(99, paintLevel + 6);
  }

  const center = getCenter();
  const color = item.kind === "boat" ? "#e1a85f" : item.kind === "fish" ? "#ff8f6b" : item.color;
  for (let i = 0; i < 12; i += 1) {
    droplets.push({
      x: center.x + random(-18, 18),
      y: center.y + random(-12, 12),
      color,
      size: random(3, 9),
      life: random(0.4, 0.9),
    });
  }
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  drawWater();
  drawWhirlpool();
  drawDroplets();
  for (const item of items) {
    if (item.delay <= 0) drawItem(item);
  }
}

function drawWater() {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0c3b55");
  gradient.addColorStop(0.52, "#082838");
  gradient.addColorStop(1, "#061923");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = "#b7eeff";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 16; i += 1) {
    const y = 96 + i * 42 + Math.sin(angle * 0.7 + i) * 8;
    ctx.beginPath();
    ctx.moveTo(-40, y);
    for (let x = -40; x < width + 80; x += 70) {
      ctx.quadraticCurveTo(x + 35, y + Math.sin(angle + i + x * 0.03) * 10, x + 70, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawWhirlpool() {
  const center = getCenter();
  const maxR = Math.min(width, height) * 0.34;
  const tint = paintLevel / 99;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle * 0.08);

  const water = ctx.createRadialGradient(0, 0, 8, 0, 0, maxR);
  water.addColorStop(0, "#020b12");
  water.addColorStop(0.2, mixColor("#063149", "#422b62", tint * 0.7));
  water.addColorStop(0.64, mixColor("#0d5f78", "#295fb8", tint * 0.55));
  water.addColorStop(1, "rgba(57, 191, 225, 0)");
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.arc(0, 0, maxR, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = "round";
  for (let i = 0; i < 9; i += 1) {
    const r = maxR * (0.22 + i * 0.085);
    ctx.globalAlpha = 0.62 - i * 0.045;
    ctx.strokeStyle = i % 2 === 0 ? "#d9fbff" : mixColor("#3be0ff", "#ff6fb1", tint);
    ctx.lineWidth = Math.max(2, 7 - i * 0.45);
    ctx.beginPath();
    for (let step = 0; step < 96; step += 1) {
      const p = step / 95;
      const theta = p * Math.PI * 2.25 + angle * (0.65 + i * 0.05) + i * 0.74;
      const rr = r * (1 - p * 0.5);
      const x = Math.cos(theta) * rr;
      const y = Math.sin(theta) * rr;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0, 8, 14, 0.86)";
  ctx.beginPath();
  ctx.arc(0, 0, maxR * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDroplets() {
  ctx.save();
  for (const drop of droplets) {
    ctx.globalAlpha = clamp(drop.life, 0, 1) * 0.78;
    ctx.fillStyle = drop.color;
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, drop.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawItem(item) {
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rotation);
  ctx.scale(item.scale, item.scale);
  ctx.globalAlpha = item.alpha;

  if (item.kind === "boat") drawBoat();
  else if (item.kind === "ball") drawBall(item.color);
  else if (item.kind === "fish") drawFishToy();
  else drawPaintBlob(item.color);

  ctx.restore();
}

function drawBoat() {
  ctx.shadowColor = "rgba(0, 0, 0, 0.32)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#d99a54";
  ctx.beginPath();
  ctx.moveTo(-28, 5);
  ctx.quadraticCurveTo(0, 24, 30, 5);
  ctx.lineTo(21, 15);
  ctx.lineTo(-20, 15);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f4f0da";
  ctx.beginPath();
  ctx.moveTo(-2, -28);
  ctx.lineTo(22, 2);
  ctx.lineTo(-2, 2);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#8f5c35";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-3, -28);
  ctx.lineTo(-3, 14);
  ctx.stroke();
}

function drawBall(color) {
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.beginPath();
  ctx.arc(-4, -5, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawFishToy() {
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#ff8f6b";
  ctx.beginPath();
  ctx.ellipse(0, 0, 25, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(42, -13);
  ctx.lineTo(42, 13);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-11, -4, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#172531";
  ctx.beginPath();
  ctx.arc(-10, -4, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawPaintBlob(color) {
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 12, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.arc(-6, -4, 4, 0, Math.PI * 2);
  ctx.fill();
}

function updateHud() {
  speedEl.textContent = `${(spin / BASE_SPIN).toFixed(1)}x`;
  countEl.textContent = String(swallowedCount);
  paintEl.textContent = paintLevel > 66 ? "浓郁" : paintLevel > 24 ? "染色" : "清澈";
}

function getCenter() {
  return {
    x: width * 0.5,
    y: height * 0.49,
  };
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function mixColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const blue = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r}, ${g}, ${blue})`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

window.addEventListener("resize", resize);
boostBtn.addEventListener("click", boost);
resetBtn.addEventListener("click", resetGame);

for (const button of dropButtons) {
  button.addEventListener("click", () => drop(button.dataset.drop));
}

resize();
resetGame();
requestAnimationFrame(loop);
