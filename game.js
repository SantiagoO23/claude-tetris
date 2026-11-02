'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
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
const gameoverBox = document.getElementById('gameover-box');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSel = document.getElementById('start-level');

const THEME_KEY = 'tetris-theme';
let gridColor = '#22222e';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let nextSpecialAt, pendingSpecial, pendingSingle, freezeLeft, lastEffect;
// startLevel: nivel de la PRÓXIMA partida (selector); baseLevel: nivel inicial de la partida en curso
let startLevel = 1;
let baseLevel = 1;

function intervalForLevel(lv) {
  return Math.max(100, 1000 - (lv - 1) * 90);
}

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
    level = baseLevel + Math.floor(lines / 10);
    dropInterval = intervalForLevel(level);
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === COMODIN) {
    // comodín: degradado arcoíris
    const g = context.createLinearGradient(x * size, y * size, (x + 1) * size, (y + 1) * size);
    ['#e57373', '#ffd54f', '#81c784', '#4dd0e1', '#ba68c8'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    context.fillStyle = g;
  } else {
    context.fillStyle = color;
  }
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  // icono de pieza especial
  if (SPECIALS[colorIndex]) {
    context.fillStyle = '#000';
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(SPECIALS[colorIndex].icon, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
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
  pauseMenu.classList.add('hidden');
  gameoverBox.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    // reanudar: solo se resetea lastTime; dropAccum y freezeLeft se conservan
    lastTime = performance.now();
    overlay.classList.add('hidden');
    pauseMenu.classList.add('hidden');
    if (document.activeElement && overlay.contains(document.activeElement)) document.activeElement.blur();
    cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
  } else {
    cancelAnimationFrame(animId);
    gameoverBox.classList.add('hidden');
    pauseControls.classList.add('hidden');
    controlsBtn.textContent = 'Ver controles';
    controlsBtn.setAttribute('aria-expanded', 'false');
    startLevelSel.value = String(startLevel);
    pauseMenu.classList.remove('hidden');
    overlay.classList.remove('hidden');
    resumeBtn.focus();
  }
}

function loop(ts) {
  const dt = Math.max(0, ts - lastTime);
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
  baseLevel = startLevel;
  level = baseLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalForLevel(level);
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
  pauseMenu.classList.add('hidden');
  gameoverBox.classList.remove('hidden');
  if (document.activeElement && overlay.contains(document.activeElement)) document.activeElement.blur();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    // Esc sobre el select solo cierra su desplegable
    if (e.target === startLevelSel && e.code === 'Escape') return;
    if (!e.repeat) togglePause();
    return;
  }
  if (e.target === themeToggle) return;
  // controles del menú de pausa: el teclado nativo (Enter/Espacio/flechas) es suyo
  if (pauseMenu.contains(e.target)) return;
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

// ---- Menú de pausa ----
resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => {
  const show = pauseControls.classList.toggle('hidden') === false;
  controlsBtn.textContent = show ? 'Ocultar controles' : 'Ver controles';
  controlsBtn.setAttribute('aria-expanded', String(show));
});
// solo afecta a la PRÓXIMA partida; la actual no cambia
startLevelSel.addEventListener('change', () => {
  const v = parseInt(startLevelSel.value, 10);
  startLevel = v >= 1 && v <= 10 ? v : 1;
});
startLevelSel.value = String(startLevel);

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

applyTheme(loadTheme());
init();
