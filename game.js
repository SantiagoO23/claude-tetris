'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Paleta activa (índices 1-18); se reemplaza al cambiar de skin
let COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#ffffff', // 8 - comodín (se dibuja arcoíris)
  '#ff7043', // 9 - bomba
  '#fff176', // 10 - rayo
  '#f06292', // 11 - tinte
  '#a1887f', // 12 - gravedad
  '#80deea', // 13 - congelar
  '#ff8a65', // 14 - pentominó +
  '#4db6ac', // 15 - pentominó U
  '#aed581', // 16 - pentominó Y
  '#fff59d', // 17 - single 1x1 (recompensa)
  '#b39ddb', // 18 - hueca 3x3 (reto)
];

// Piezas especiales (bloque 1x1) y comodín
const COMODIN = 8;
const SPECIALS = {
  9:  { name: 'Bomba',    icon: '💣' },
  10: { name: 'Rayo',     icon: '⚡' },
  11: { name: 'Tinte',    icon: '🎨' },
  12: { name: 'Gravedad', icon: '⬇' },
  13: { name: 'Congelar', icon: '❄' },
};
const SPECIAL_EVERY = 5;
const FREEZE_MS = 5000;
const COMODIN_BONUS = 50;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

// Piezas no estándar (índices 14-18): pentominós, single y hueca
PIECES[14] = [[0,14,0],[14,14,14],[0,14,0]];                    // +
PIECES[15] = [[15,0,15],[15,15,15],[0,0,0]];                    // U
PIECES[16] = [[0,0,0,0],[16,16,16,16],[0,16,0,0],[0,0,0,0]];   // Y
PIECES[17] = [[17]];                                             // single 1x1
PIECES[18] = [[18,18,18],[18,0,18],[18,18,18]];                 // hueca 3x3

const ODD_PIECES = [14, 15, 16, 18];
const SINGLE = 17;
const ODD_CHANCE = 0.1;

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const themeLabel = document.getElementById('theme-label');
const effectEl = document.getElementById('effect');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
let gridColor = '#22222e';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let nextSpecialAt, pendingSpecial, pendingSingle, freezeLeft, lastEffect;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.random() < ODD_CHANCE
    ? ODD_PIECES[Math.floor(Math.random() * ODD_PIECES.length)]
    : Math.floor(Math.random() * 7) + 1;
  return makePiece(type);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomSpecial() {
  const type = 9 + Math.floor(Math.random() * 5);
  return { type, shape: [[type]], special: true, x: Math.floor(COLS / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      score += board[r].filter(v => v === COMODIN).length * COMODIN_BONUS;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    if (cleared === 4) pendingSingle = true; // recompensa tras un Tetris
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    while (lines >= nextSpecialAt) {
      pendingSpecial = true;
      nextSpecialAt += SPECIAL_EVERY;
    }
    updateHUD();
  }
}

// Efectos de las piezas especiales; (x, y) = celda donde se fijó
function applySpecial(type, x, y) {
  lastEffect = SPECIALS[type].name;
  switch (type) {
    case 9: // Bomba: área 3x3
      for (let r = y - 1; r <= y + 1; r++)
        for (let c = x - 1; c <= x + 1; c++)
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
      break;
    case 10: // Rayo: fila y columna completas
      board[y].fill(0);
      for (let r = 0; r < ROWS; r++) board[r][x] = 0;
      break;
    case 11: { // Tinte: color del bloque de abajo pasa a comodín
      const target = y + 1 < ROWS ? board[y + 1][x] : 0;
      if (target && target !== COMODIN && !SPECIALS[target])
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (board[r][c] === target) board[r][c] = COMODIN;
      break;
    }
    case 12: // Gravedad: compacta huecos por columna
      for (let c = 0; c < COLS; c++) {
        const col = [];
        for (let r = 0; r < ROWS; r++) if (board[r][c]) col.push(board[r][c]);
        for (let r = ROWS - 1; r >= 0; r--) board[r][c] = col.pop() || 0;
      }
      break;
    case 13: // Congelar: pausa la caída automática
      freezeLeft = FREEZE_MS;
      break;
  }
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.special) applySpecial(current.shape[0][0], current.x, current.y);
  else merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  // prioridad: especial > single de recompensa > aleatoria; solo se consume un flag
  if (pendingSpecial) {
    next = randomSpecial();
    pendingSpecial = false;
  } else if (pendingSingle) {
    next = makePiece(SINGLE);
    pendingSingle = false;
  } else {
    next = randomPiece();
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  if (freezeLeft > 0) effectEl.textContent = `❄ Congelado ${Math.ceil(freezeLeft / 1000)}s`;
  else effectEl.textContent = lastEffect || '—';
}

// ---- Skins: paleta completa (18 colores) + función de dibujo de bloque ----
// draw(context, px, py, size, paint, color): paint = color o degradado (comodín)
const RAINBOW = ['#e57373', '#ffd54f', '#81c784', '#4dd0e1', '#ba68c8'];

const SKINS = {
  retro: {
    label: 'Retro',
    iconColor: '#000',
    colors: COLORS.slice(),
    draw(context, px, py, size, paint) {
      context.fillStyle = paint;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    label: 'Neon',
    iconColor: '#fff',
    colors: [
      null,
      '#00e5ff', '#ffee00', '#d500f9', '#00ff6a', '#ff1744', '#2979ff', '#ff9100',
      '#ffffff', '#ff6d00', '#ffff00', '#ff4081', '#c6a07a', '#18ffff',
      '#ff6e40', '#1de9b6', '#b2ff59', '#ffff8d', '#b388ff',
    ],
    draw(context, px, py, size, paint, color) {
      context.shadowColor = color;
      context.shadowBlur = 10;
      context.fillStyle = 'rgba(0,0,0,0.85)';
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      context.strokeStyle = paint;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, size - 6, size - 6);
      context.shadowBlur = 0;
      const a = context.globalAlpha;
      context.globalAlpha = a * 0.25;
      context.fillStyle = paint;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      context.globalAlpha = a;
    },
  },
  pastel: {
    label: 'Pastel',
    iconColor: '#5a4a5e',
    colors: [
      null,
      '#a8e6ef', '#fff1b8', '#d9b8e6', '#b9e8c4', '#f6b8bd', '#bcd8f5', '#ffd5a8',
      '#ffffff', '#ffc2a8', '#fff7c2', '#f8bfd3', '#d7c4bb', '#c3eef2',
      '#ffbfa8', '#a8dcd5', '#d5eab8', '#fffacc', '#d3c8ea',
    ],
    draw(context, px, py, size, paint) {
      const r = size * 0.28;
      const x = px + 2, y = py + 2, w = size - 4, h = size - 4;
      context.fillStyle = paint;
      context.beginPath();
      context.moveTo(x + r, y);
      context.arcTo(x + w, y, x + w, y + h, r);
      context.arcTo(x + w, y + h, x, y + h, r);
      context.arcTo(x, y + h, x, y, r);
      context.arcTo(x, y, x + w, y, r);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fillRect(x + r, y + 3, w - 2 * r, 3);
    },
  },
  pixel: {
    label: 'Pixel art',
    iconColor: '#000',
    colors: [
      null,
      '#29b6f6', '#fbc02d', '#9c27b0', '#43a047', '#e53935', '#3f51b5', '#fb8c00',
      '#ffffff', '#e64a19', '#fdd835', '#d81b60', '#8d6e63', '#26c6da',
      '#f4511e', '#00897b', '#7cb342', '#fff176', '#7e57c2',
    ],
    draw(context, px, py, size, paint) {
      const u = Math.max(2, Math.floor(size / 6)); // "píxel" de la textura
      context.fillStyle = paint;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // textura: ajedrez de píxeles claros y oscuros
      for (let i = 0; i * u < size - 2; i++)
        for (let j = 0; j * u < size - 2; j++) {
          if ((i + j) % 2) continue;
          context.fillStyle = (i + j) % 4 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
          context.fillRect(px + 1 + i * u, py + 1 + j * u, Math.min(u, size - 2 - i * u), Math.min(u, size - 2 - j * u));
        }
      // biselado de medio píxel
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.fillRect(px + 1, py + 1, size - 2, u / 2);
      context.fillRect(px + 1, py + 1, u / 2, size - 2);
      context.fillStyle = 'rgba(0,0,0,0.5)';
      context.fillRect(px + 1, py + size - 1 - u / 2, size - 2, u / 2);
      context.fillRect(px + size - 1 - u / 2, py + 1, u / 2, size - 2);
    },
  },
};

const SKIN_KEY = 'tetris-skin';
let currentSkin = 'retro';

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin];
  const color = COLORS[colorIndex];
  const px = x * size, py = y * size;
  context.save();
  context.globalAlpha = alpha ?? 1;
  let paint = color;
  if (colorIndex === COMODIN) {
    // comodín: degradado arcoíris
    paint = context.createLinearGradient(px, py, px + size, py + size);
    RAINBOW.forEach((c, i, a) => paint.addColorStop(i / (a.length - 1), c));
  }
  skin.draw(context, px, py, size, paint, color);
  // icono de pieza especial
  if (SPECIALS[colorIndex]) {
    context.shadowBlur = 0;
    context.fillStyle = skin.iconColor;
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(SPECIALS[colorIndex].icon, px + size / 2, py + size / 2 + 1);
  }
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeLeft > 0) {
    // congelado: no cae solo (el temporizador no corre en pausa porque el loop se detiene)
    freezeLeft = Math.max(0, freezeLeft - dt);
    dropAccum = 0;
    updateHUD();
  } else {
    dropAccum += dt;
  }
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  nextSpecialAt = SPECIAL_EVERY;
  pendingSpecial = false;
  pendingSingle = false;
  freezeLeft = 0;
  lastEffect = '';
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) {
    // Esc/Enter cierran el desplegable: devolver el foco al juego
    if (e.code === 'Escape' || e.code === 'Enter') skinSelect.blur();
    return;
  }
  if (e.target === themeToggle) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Tema claro / oscuro (oscuro por defecto, persiste en localStorage) ----
function applyTheme(theme) {
  const light = theme === 'light';
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  themeToggle.setAttribute('aria-checked', String(light));
  themeToggle.setAttribute('aria-label', light ? 'Modo oscuro' : 'Modo claro');
  themeLabel.textContent = light ? 'Modo oscuro' : 'Modo claro';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  if (current) draw(); // redibuja también en pausa
}

function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  themeToggle.blur(); // evita que Espacio/flechas vuelvan a activar el botón
});

// ---- Skins visuales (persisten en localStorage) ----
function applySkin(name) {
  if (!SKINS[name]) name = 'retro';
  currentSkin = name;
  COLORS = SKINS[name].colors;
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  if (current) draw(); // redibuja también en pausa
  if (next) drawNext();
}

function loadSkin() {
  try { const s = localStorage.getItem(SKIN_KEY); return SKINS[s] ? s : 'retro'; }
  catch { return 'retro'; }
}

Object.keys(SKINS).forEach(k => {
  const opt = document.createElement('option');
  opt.value = k;
  opt.textContent = SKINS[k].label;
  skinSelect.appendChild(opt);
});

skinSelect.addEventListener('close', () => skinSelect.blur());
skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  try { localStorage.setItem(SKIN_KEY, currentSkin); } catch {}
  skinSelect.blur(); // evita que las flechas cambien el select durante el juego
});

applyTheme(loadTheme());
applySkin(loadSkin());
init();
