const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const sizeEl = document.querySelector("#size");
const ttlEl = document.querySelector("#ttl");
const restartBtn = document.querySelector("#restart");
const touchButtons = document.querySelectorAll("[data-dir]");

const DPR_MAX = 2;
const keys = new Set();
const pointer = { active: false, x: 0, y: 0 };
const dirs = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

let width = 0;
let height = 0;
let dpr = 1;
let lastTime = performance.now();
let spawnTimer = 0;
let specialSpawnTimer = 0;
let item = null;
let specialReward = null;
let particles = [];
let gusts = [];
let state = createState();

const ballColors = [
  "#ff595e",
  "#ffca3a",
  "#8ac926",
  "#1982c4",
  "#6a4c93",
  "#00c2a8",
  "#ff8fab",
  "#f77f00",
];
const MAX_ABSORBED_BALLS = 44;
const HUNGER_DELAY = 5;
const SHRINK_RATE = 0.18;
const MIN_GROWTH = 1;
const BALL_GROWTH_BASE = 0.16;
const BALL_GROWTH_RADIUS_FACTOR = 0.008;
const WHITE_BALL_GROWTH = BALL_GROWTH_BASE + 14 * BALL_GROWTH_RADIUS_FACTOR;
const LIGHTNING_SPEED_MULTIPLIER = 1.55;
const LIGHTNING_SPIN_MULTIPLIER = 2.15;
const SHEEP_SPEED_MULTIPLIER = 0.5;
const SHEEP_SLOW_TIME = 4;
const specialRewards = [
  { id: "lightning", icon: "⚡", color: "#ffe45e", radius: 24, score: 30, growth: 0.12, ttl: 5, speedBoost: 3.5 },
  { id: "diamond", icon: "💎", color: "#69e7ff", radius: 24, score: 80, growth: 0.35, ttl: 6 },
  { id: "bunny", icon: "🐇", color: "#ffffff", radius: 24, score: 35, growth: 0.22, ttl: 5.5 },
  { id: "sheep", icon: "🐑", color: "#f3efe5", radius: 25, score: 45, growth: WHITE_BALL_GROWTH * 5, ttl: 6, slowTime: SHEEP_SLOW_TIME },
  { id: "fire", icon: "🔥", color: "#ff6b1a", radius: 24, score: 25, growth: 0.25, ttl: 5, fireBurst: true },
];

function createState() {
  return {
    score: 0,
    growth: 1,
    noEatTime: 0,
    shrinkDropTimer: 0,
    speedBoostTime: 0,
    slowTime: 0,
    absorbedBalls: [],
    tornado: {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.56,
      radius: 38,
      angle: 0,
      speed: 248,
    },
  };
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
  const rect = canvas.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.tornado.x = clamp(state.tornado.x, 24, width - 24);
  state.tornado.y = clamp(state.tornado.y, 86, height - 24);
}

function restart() {
  state = createState();
  item = null;
  specialReward = null;
  particles = [];
  gusts = [];
  spawnTimer = 0.2;
  specialSpawnTimer = random(5, 9);
  updateHud();
}

function spawnItem() {
  const radius = random(10, 18);
  const color = ballColors[Math.floor(Math.random() * ballColors.length)];
  const margin = Math.max(52, radius * 2);
  item = {
    color,
    value: Math.round(radius * 1.2),
    radius,
    x: random(margin, width - margin),
    y: random(106, height - margin),
    ttl: random(4.2, 6.8),
    maxTtl: 0,
    wobble: random(0, Math.PI * 2),
    pulse: 0,
  };
  item.maxTtl = item.ttl;
}

function spawnSpecialReward() {
  const reward = specialRewards[Math.floor(Math.random() * specialRewards.length)];
  const margin = reward.radius + 32;
  specialReward = {
    ...reward,
    x: random(margin, width - margin),
    y: random(118, height - margin),
    maxTtl: reward.ttl,
    pulse: random(0, Math.PI * 2),
  };
}

function update(dt) {
  const tornado = state.tornado;
  state.noEatTime += dt;
  state.speedBoostTime = Math.max(0, state.speedBoostTime - dt);
  state.slowTime = Math.max(0, state.slowTime - dt);
  const spinMultiplier = state.speedBoostTime > 0 ? LIGHTNING_SPIN_MULTIPLIER : 1;
  tornado.angle += dt * (5.2 + state.growth * 0.3) * spinMultiplier;
  tornado.radius = 35 + state.growth * 7.5;
  const speedMultiplier = state.slowTime > 0 ? SHEEP_SPEED_MULTIPLIER : state.speedBoostTime > 0 ? LIGHTNING_SPEED_MULTIPLIER : 1;
  tornado.speed = (236 + state.growth * 10) * speedMultiplier;

  const input = getInputVector();
  tornado.x += input.x * tornado.speed * dt;
  tornado.y += input.y * tornado.speed * dt;
  tornado.x = clamp(tornado.x, tornado.radius * 0.68, width - tornado.radius * 0.68);
  tornado.y = clamp(tornado.y, 90, height - tornado.radius * 0.36);

  spawnTimer -= dt;
  if (!item && spawnTimer <= 0) {
    spawnItem();
  }

  specialSpawnTimer -= dt;
  if (!specialReward && specialSpawnTimer <= 0) {
    spawnSpecialReward();
  }

  if (item) {
    item.ttl -= dt;
    item.pulse += dt;
    if (item.ttl <= 0) {
      burst(item.x, item.y, item.color, 10, false);
      item = null;
      spawnTimer = random(0.35, 1);
    } else {
      const eatDistance = tornado.radius * 0.78 + item.radius;
      if (distance(tornado.x, tornado.y, item.x, item.y) < eatDistance) {
        state.score += item.value;
        state.growth += getBallGrowth(item);
        state.noEatTime = 0;
        state.shrinkDropTimer = 0;
        absorbBall(item);
        burst(item.x, item.y, item.color, 20, true);
        item = null;
        spawnTimer = random(0.25, 0.75);
      }
    }
  }

  if (specialReward) {
    specialReward.ttl -= dt;
    specialReward.pulse += dt;
    if (specialReward.ttl <= 0) {
      burst(specialReward.x, specialReward.y, specialReward.color, 12, false);
      specialReward = null;
      specialSpawnTimer = random(7, 13);
    } else {
      const eatDistance = tornado.radius * 0.8 + specialReward.radius;
      if (distance(tornado.x, tornado.y, specialReward.x, specialReward.y) < eatDistance) {
        applySpecialReward(specialReward);
        burst(specialReward.x, specialReward.y, specialReward.color, 28, true);
        specialReward = null;
        specialSpawnTimer = random(7, 13);
      }
    }
  }

  shrinkTornado(dt);

  if (Math.random() < dt * 4) {
    gusts.push({
      x: random(-80, width + 40),
      y: random(120, height - 40),
      len: random(38, 110),
      alpha: random(0.08, 0.22),
      speed: random(34, 82),
    });
  }

  gusts = gusts.filter((gust) => {
    gust.x += gust.speed * dt;
    gust.y += Math.sin((gust.x + gust.len) * 0.014) * 0.2;
    return gust.x < width + 130;
  });

  particles = particles.filter((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.986;
    particle.vy *= 0.986;
    particle.size *= 0.993;
    return particle.life > 0;
  });

  updateHud();
}

function applySpecialReward(reward) {
  state.score += reward.score;
  state.growth += reward.growth;
  state.noEatTime = 0;
  state.shrinkDropTimer = 0;

  if (reward.speedBoost) {
    state.speedBoostTime = Math.max(state.speedBoostTime, reward.speedBoost);
  }

  if (reward.slowTime) {
    state.slowTime = Math.max(state.slowTime, reward.slowTime);
  }

  if (reward.fireBurst) {
    spawnTimer = 0.05;
    for (let i = 0; i < 4; i += 1) {
      absorbBall({
        color: i % 2 === 0 ? "#ff6b1a" : "#ffd166",
        radius: random(10, 16),
      });
    }
    return;
  }

  const absorbCount = reward.id === "diamond" ? 3 : 2;
  for (let i = 0; i < absorbCount; i += 1) {
    absorbBall({
      color: reward.color,
      radius: random(10, 17),
    });
  }
}

function getBallGrowth(ball) {
  return BALL_GROWTH_BASE + ball.radius * BALL_GROWTH_RADIUS_FACTOR;
}

function shrinkTornado(dt) {
  if (state.noEatTime <= HUNGER_DELAY || state.growth <= MIN_GROWTH) return;

  state.growth = Math.max(MIN_GROWTH, state.growth - SHRINK_RATE * dt);
  state.shrinkDropTimer += dt;

  if (state.shrinkDropTimer < 0.75 || state.absorbedBalls.length === 0) return;

  state.shrinkDropTimer = 0;
  const dropped = state.absorbedBalls.shift();
  const tornado = state.tornado;
  const x = tornado.x + random(-tornado.radius * 0.34, tornado.radius * 0.34);
  const y = tornado.y + random(-tornado.radius * 0.4, tornado.radius * 0.56);
  burst(x, y, dropped.color, 8, false);
}

function absorbBall(ball) {
  state.absorbedBalls.push({
    color: ball.color,
    size: clamp(ball.radius * 0.48, 5, 9),
    phase: random(0, Math.PI * 2),
    band: random(0.04, 0.92),
    orbit: random(0.72, 1.08),
  });

  if (state.absorbedBalls.length > MAX_ABSORBED_BALLS) {
    state.absorbedBalls.splice(0, state.absorbedBalls.length - MAX_ABSORBED_BALLS);
  }
}

function getInputVector() {
  let x = 0;
  let y = 0;

  if (keys.has("ArrowUp") || keys.has("KeyW")) y -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) y += 1;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) x -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) x += 1;
  for (const [dir, axis] of Object.entries(dirs)) {
    if (keys.has(`Touch${dir}`)) {
      x += axis.x;
      y += axis.y;
    }
  }

  if (pointer.active) {
    const dx = pointer.x - state.tornado.x;
    const dy = pointer.y - state.tornado.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 10) {
      x += dx / dist;
      y += dy / dist;
    }
  }

  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  drawGround();
  drawGusts();
  if (item) drawItem(item);
  if (specialReward) drawSpecialReward(specialReward);
  drawParticles();
  drawTornado(state.tornado);
  drawVignette();
}

function drawGround() {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#263545");
  sky.addColorStop(0.48, "#1c2930");
  sky.addColorStop(1, "#252d28");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#b5c6d6";
  ctx.lineWidth = 1;
  for (let x = -80; x < width + 120; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.quadraticCurveTo(x + width * 0.08, height * 0.66, x + 210, height * 0.36);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 80; i += 1) {
    const x = (i * 137.5) % width;
    const y = 116 + ((i * 91.7) % Math.max(1, height - 150));
    ctx.fillStyle = i % 3 === 0 ? "#47533d" : "#34433b";
    ctx.fillRect(x, y, 4 + (i % 5), 2);
  }
  ctx.restore();
}

function drawGusts() {
  ctx.save();
  ctx.lineCap = "round";
  for (const gust of gusts) {
    ctx.globalAlpha = gust.alpha;
    ctx.strokeStyle = "#e8f2ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gust.x, gust.y);
    ctx.quadraticCurveTo(gust.x + gust.len * 0.48, gust.y - 12, gust.x + gust.len, gust.y + 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTornado(tornado) {
  const rings = 9;
  const tipY = tornado.y + tornado.radius * 0.9;

  ctx.save();
  ctx.translate(tornado.x, tornado.y);
  ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
  ctx.shadowBlur = 18;

  for (let i = 0; i < rings; i += 1) {
    const t = i / (rings - 1);
    const y = lerp(-tornado.radius * 1.04, tornado.radius * 0.82, t);
    const rx = lerp(tornado.radius * 0.92, tornado.radius * 0.22, t);
    const ry = lerp(13, 5, t);
    const offset = Math.sin(tornado.angle * 1.4 + i * 0.86) * tornado.radius * 0.18 * (1 - t * 0.55);

    ctx.globalAlpha = 0.46 + t * 0.22;
    ctx.fillStyle = i % 2 ? "#d3dce7" : "#8f9dab";
    ctx.beginPath();
    ctx.ellipse(offset, y, rx, ry, -0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(offset * 0.88, y - 1, rx * 0.88, ry * 0.58, -0.1, 0, Math.PI * 1.55);
    ctx.stroke();
  }

  const cone = ctx.createLinearGradient(0, -tornado.radius * 1.1, 0, tornado.radius);
  cone.addColorStop(0, "rgba(226, 234, 243, 0.3)");
  cone.addColorStop(0.5, "rgba(185, 197, 209, 0.24)");
  cone.addColorStop(1, "rgba(78, 84, 88, 0.12)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(-tornado.radius * 0.92, -tornado.radius * 0.95);
  ctx.bezierCurveTo(tornado.radius * 0.7, -tornado.radius * 1.16, tornado.radius * 0.52, -tornado.radius * 0.04, tornado.radius * 0.18, tornado.radius * 0.9);
  ctx.quadraticCurveTo(0, tornado.radius * 1.04, -tornado.radius * 0.18, tornado.radius * 0.9);
  ctx.bezierCurveTo(-tornado.radius * 0.52, -tornado.radius * 0.04, -tornado.radius * 0.7, -tornado.radius * 1.16, -tornado.radius * 0.92, -tornado.radius * 0.95);
  ctx.fill();

  drawAbsorbedBalls(tornado);
  drawLightningEffect(tornado);

  ctx.globalAlpha = 0.23;
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.ellipse(0, tipY - tornado.y, tornado.radius * 0.36, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLightningEffect(tornado) {
  if (state.speedBoostTime <= 0) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "#ffe45e";
  ctx.shadowBlur = 18;

  for (let i = 0; i < 4; i += 1) {
    const t = (i + random(0.08, 0.72)) / 4;
    const y = lerp(-tornado.radius * 0.9, tornado.radius * 0.5, t);
    const bodyWidth = lerp(tornado.radius * 0.82, tornado.radius * 0.24, t);
    const side = i % 2 === 0 ? 1 : -1;
    const startX = side * bodyWidth * random(0.52, 0.86);
    const endX = side * (bodyWidth + random(18, 34));
    const segments = 4;

    ctx.globalAlpha = random(0.46, 0.92);
    ctx.strokeStyle = i % 2 === 0 ? "#fff6a5" : "#ffe45e";
    ctx.lineWidth = random(2, 4);
    ctx.beginPath();
    ctx.moveTo(startX, y);

    for (let j = 1; j <= segments; j += 1) {
      const progress = j / segments;
      const zig = (j % 2 === 0 ? -1 : 1) * random(6, 15);
      const x = lerp(startX, endX, progress) + zig;
      const nextY = y + random(-18, 18) * progress;
      ctx.lineTo(x, nextY);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "#fff6a5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -tornado.radius * 0.22, tornado.radius * 0.72, tornado.radius * 0.18, -0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawAbsorbedBalls(tornado) {
  if (state.absorbedBalls.length === 0) return;

  ctx.save();
  ctx.shadowBlur = 8;
  for (let i = 0; i < state.absorbedBalls.length; i += 1) {
    const ball = state.absorbedBalls[i];
    const t = ball.band;
    const y = lerp(-tornado.radius * 0.9, tornado.radius * 0.72, t);
    const bodyWidth = lerp(tornado.radius * 0.74, tornado.radius * 0.17, t);
    const phase = tornado.angle * (1.2 + t * 0.7) + ball.phase + i * 0.22;
    const orbitX = Math.cos(phase) * bodyWidth * ball.orbit;
    const orbitY = Math.sin(phase) * lerp(8, 3, t);
    const depth = (Math.sin(phase) + 1) * 0.5;
    const size = ball.size * lerp(0.72, 1.18, depth);

    ctx.globalAlpha = lerp(0.5, 0.95, depth);
    ctx.fillStyle = ball.color;
    ctx.shadowColor = ball.color;
    ctx.beginPath();
    ctx.arc(orbitX, y + orbitY, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = lerp(0.2, 0.55, depth);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(orbitX - size * 0.3, y + orbitY - size * 0.34, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawItem(target) {
  const fade = clamp(target.ttl / target.maxTtl, 0, 1);
  const wobble = Math.sin(target.pulse * 5 + target.wobble) * 2;

  ctx.save();
  ctx.translate(target.x, target.y + wobble);
  ctx.globalAlpha = clamp(fade * 1.25, 0.18, 1);
  ctx.shadowColor = target.color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = target.color;
  ctx.beginPath();
  ctx.arc(0, 0, target.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.globalAlpha = clamp(fade * 1.2, 0.16, 0.82);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-target.radius * 0.32, -target.radius * 0.38, target.radius * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = fade < 0.35 ? "#ff6b6b" : "#ffd166";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(target.x, target.y, target.radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fade);
  ctx.stroke();
  ctx.restore();
}

function drawSpecialReward(reward) {
  const fade = clamp(reward.ttl / reward.maxTtl, 0, 1);
  const pulse = 1 + Math.sin(reward.pulse * 5) * 0.08;
  const glow = reward.radius * (1.5 + Math.sin(reward.pulse * 4) * 0.12);

  ctx.save();
  ctx.translate(reward.x, reward.y);
  ctx.globalAlpha = clamp(fade * 1.35, 0.18, 1);
  ctx.shadowColor = reward.color;
  ctx.shadowBlur = 20;

  const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, glow);
  halo.addColorStop(0, hexToRgba(reward.color, 0.8));
  halo.addColorStop(0.55, hexToRgba(reward.color, 0.25));
  halo.addColorStop(1, hexToRgba(reward.color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, glow, 0, Math.PI * 2);
  ctx.fill();

  ctx.scale(pulse, pulse);
  ctx.font = `${Math.round(reward.radius * 1.55)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(reward.icon, 0, 1);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.86;
  ctx.strokeStyle = fade < 0.35 ? "#ff6b6b" : reward.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(reward.x, reward.y, reward.radius + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fade);
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.life, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.68);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.34)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function burst(x, y, color, count, pullIn) {
  for (let i = 0; i < count; i += 1) {
    const angle = random(0, Math.PI * 2);
    const speed = random(60, pullIn ? 190 : 110);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (pullIn ? 40 : 0),
      color,
      size: random(2, 5),
      life: random(0.45, 0.95),
    });
  }
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  sizeEl.textContent = `${state.growth.toFixed(1)}x`;
  ttlEl.textContent = item ? `${Math.ceil(item.ttl)}s` : "--";
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function setPointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));

canvas.addEventListener("pointerdown", (event) => {
  pointer.active = true;
  setPointerFromEvent(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (pointer.active) setPointerFromEvent(event);
});
canvas.addEventListener("pointerup", () => {
  pointer.active = false;
});
canvas.addEventListener("pointercancel", () => {
  pointer.active = false;
});

for (const button of touchButtons) {
  const dir = button.dataset.dir;
  const activate = () => {
    keys.add(`Touch${dir}`);
  };
  const deactivate = () => {
    keys.delete(`Touch${dir}`);
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    activate();
  });
  button.addEventListener("pointerup", deactivate);
  button.addEventListener("pointerleave", deactivate);
  button.addEventListener("pointercancel", deactivate);
}

restartBtn.addEventListener("click", restart);

resize();
restart();
requestAnimationFrame(loop);
