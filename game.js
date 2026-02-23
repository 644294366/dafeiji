const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const muteBtn = document.getElementById("mute");

const W = canvas.width;
const H = canvas.height;

const keys = new Set();
let lastTime = 0;
let audioCtx = null;
let masterGain = null;
let muted = false;
const audioSupported = !!(window.AudioContext || window.webkitAudioContext);

const state = {
  running: true,
  started: false,
  paused: false,
  score: 0,
  player: {
    x: W / 2,
    y: H - 60,
    w: 32,
    h: 36,
    speed: 280,
  },
  bullets: [],
  enemies: [],
  spawnTimer: 0,
  fireCooldown: 0,
  gameOverSounded: false,
};

function resetGame() {
  state.running = true;
  state.started = true;
  state.paused = false;
  state.score = 0;
  state.player.x = W / 2;
  state.player.y = H - 60;
  state.bullets = [];
  state.enemies = [];
  state.spawnTimer = 0;
  state.fireCooldown = 0;
  state.gameOverSounded = false;
  scoreEl.textContent = "0";
}

function initGame() {
  state.running = true;
  state.started = false;
  state.paused = false;
  state.score = 0;
  state.player.x = W / 2;
  state.player.y = H - 60;
  state.bullets = [];
  state.enemies = [];
  state.spawnTimer = 0;
  state.fireCooldown = 0;
  state.gameOverSounded = false;
  scoreEl.textContent = "0";
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function ensureAudio() {
  if (!audioSupported) return;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function beep({ freq, duration, type, gain }) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  const now = audioCtx.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp);
  amp.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}

function playShoot() {
  beep({ freq: 720, duration: 0.06, type: "square", gain: 0.05 });
}

function playHit() {
  beep({ freq: 220, duration: 0.09, type: "triangle", gain: 0.08 });
}

function playGameOver() {
  beep({ freq: 120, duration: 0.4, type: "sawtooth", gain: 0.12 });
}

function setMuted(nextMuted) {
  muted = nextMuted;
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : 1;
  }
  muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  muteBtn.textContent = muted ? "音效：关" : "音效：开";
  localStorage.setItem("mute", muted ? "1" : "0");
}


function shoot() {
  if (state.fireCooldown > 0) return;
  state.fireCooldown = 0.18;
  state.bullets.push({
    x: state.player.x,
    y: state.player.y - state.player.h / 2 - 8,
    r: 3,
    vy: -520,
  });
  playShoot();
}

function spawnEnemy() {
  const size = 28 + Math.random() * 16;
  state.enemies.push({
    x: 20 + Math.random() * (W - 40),
    y: -size,
    w: size,
    h: size,
    vy: 90 + Math.random() * 120,
  });
}

function rectHit(a, b) {
  return (
    a.x - a.w / 2 < b.x + b.w / 2 &&
    a.x + a.w / 2 > b.x - b.w / 2 &&
    a.y - a.h / 2 < b.y + b.h / 2 &&
    a.y + a.h / 2 > b.y - b.h / 2
  );
}

function update(dt) {
  if (!state.started || state.paused || !state.running) return;

  const p = state.player;
  let dir = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) dir -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) dir += 1;

  p.x = clamp(p.x + dir * p.speed * dt, 16, W - 16);

  if (keys.has("Space")) shoot();

  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy();
    state.spawnTimer = 0.55 + Math.random() * 0.4;
  }

  for (const b of state.bullets) {
    b.y += b.vy * dt;
  }
  state.bullets = state.bullets.filter((b) => b.y + b.r > -10);

  for (const e of state.enemies) {
    e.y += e.vy * dt;
  }

  for (const e of state.enemies) {
    const playerBox = { x: p.x, y: p.y, w: p.w, h: p.h };
    if (rectHit(playerBox, { x: e.x, y: e.y, w: e.w, h: e.h })) {
      state.running = false;
    }
    if (e.y - e.h / 2 > H) {
      state.running = false;
    }
  }

  const aliveEnemies = [];
  for (const e of state.enemies) {
    let hit = false;
    for (const b of state.bullets) {
      const bulletBox = { x: b.x, y: b.y, w: b.r * 2, h: b.r * 2 };
      if (rectHit(bulletBox, { x: e.x, y: e.y, w: e.w, h: e.h })) {
        hit = true;
        b.y = -1000;
        state.score += 10;
        scoreEl.textContent = String(state.score);
        playHit();
        break;
      }
    }
    if (!hit) aliveEnemies.push(e);
  }
  state.enemies = aliveEnemies;
}

function drawBackground() {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#0b0f1a";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(58, 242, 181, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = (i + 1) * 100;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawPlayer() {
  const p = state.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Main hull
  ctx.fillStyle = "#3af2b5";
  ctx.beginPath();
  ctx.moveTo(0, -p.h / 2 - 6);
  ctx.lineTo(p.w / 2 + 8, p.h / 2 - 2);
  ctx.lineTo(0, p.h / 2 + 6);
  ctx.lineTo(-p.w / 2 - 8, p.h / 2 - 2);
  ctx.closePath();
  ctx.fill();

  // Cockpit
  ctx.fillStyle = "#e8eef8";
  ctx.beginPath();
  ctx.moveTo(0, -p.h / 2 - 2);
  ctx.lineTo(6, 2);
  ctx.lineTo(0, 10);
  ctx.lineTo(-6, 2);
  ctx.closePath();
  ctx.fill();

  // Side wings
  ctx.fillStyle = "#2bd39d";
  ctx.beginPath();
  ctx.moveTo(p.w / 2 + 2, -4);
  ctx.lineTo(p.w / 2 + 14, 10);
  ctx.lineTo(p.w / 2 + 2, 10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-p.w / 2 - 2, -4);
  ctx.lineTo(-p.w / 2 - 14, 10);
  ctx.lineTo(-p.w / 2 - 2, 10);
  ctx.closePath();
  ctx.fill();

  // Thrusters
  ctx.fillStyle = "#ff4d6d";
  ctx.beginPath();
  ctx.moveTo(-6, p.h / 2 + 4);
  ctx.lineTo(0, p.h / 2 + 16);
  ctx.lineTo(6, p.h / 2 + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.moveTo(-3, p.h / 2 + 4);
  ctx.lineTo(0, p.h / 2 + 12);
  ctx.lineTo(3, p.h / 2 + 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBullets() {
  ctx.fillStyle = "#ffd166";
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnemies() {
  for (const e of state.enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.strokeRect(-e.w / 2, -e.h / 2, e.w, e.h);
    ctx.restore();
  }
}

function drawGameOver() {
  if (state.running || !state.started) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Trebuchet MS, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("游戏结束", W / 2, H / 2 - 10);
  ctx.font = "16px Trebuchet MS, Arial, sans-serif";
  ctx.fillStyle = "#9fb2d6";
  ctx.fillText("按 R 重新开始", W / 2, H / 2 + 24);
  ctx.restore();
}

function drawPaused() {
  if (!state.paused || !state.started || !state.running) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px Trebuchet MS, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Paused", W / 2, H / 2);
  ctx.restore();
}

function drawStart() {
  if (state.started) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px Trebuchet MS, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("按 Enter 开始", W / 2, H / 2);
  ctx.restore();
}

function loop(ts) {
  const t = ts / 1000;
  const dt = Math.min(0.033, t - lastTime || 0);
  lastTime = t;
  update(dt);

  if (state.started && !state.running && !state.gameOverSounded) {
    playGameOver();
    state.gameOverSounded = true;
  }

  drawBackground();
  drawPlayer();
  drawBullets();
  drawEnemies();
  drawStart();
  drawPaused();
  drawGameOver();

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  ensureAudio();
  if (e.code === "Enter" && !state.started) {
    resetGame();
    return;
  }
  if (e.code === "KeyP" && state.started && state.running) {
    state.paused = !state.paused;
    return;
  }
  if (e.code === "KeyR") {
    resetGame();
    return;
  }
  keys.add(e.code);
  if (["ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

setMuted(localStorage.getItem("mute") === "1");
muteBtn.addEventListener("click", () => {
  ensureAudio();
  setMuted(!muted);
});
initGame();
requestAnimationFrame(loop);
