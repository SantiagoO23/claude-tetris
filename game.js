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
];

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
const startOverlay = document.getElementById('start-overlay');
const startRecords = document.getElementById('start-records');
const startBtn = document.getElementById('start-btn');
const recordMsg = document.getElementById('record-msg');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const overlayRecords = document.getElementById('overlay-records');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const THEME_KEY = 'tetris-theme';
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
let started = false;     // false hasta pulsar "Jugar"
let combo = 0;           // locks consecutivos que limpian líneas
let maxCombo = 0;        // mejor combo de la partida actual
let pendingEntry = null; // récord pendiente de nombre
let gridColor = '#22222e';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
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
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
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
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
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
  showGameOverRecords();
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
  dropAccum += dt;
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
  combo = 0;
  maxCombo = 0;
  pendingEntry = null;
  recordMsg.classList.add('hidden');
  nameForm.classList.add('hidden');
  overlayRecords.classList.add('hidden');
  resetRecordsBtn.classList.add('hidden');
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === themeToggle) return;
  if (e.target instanceof HTMLInputElement) return; // el campo de nombre no dispara teclas del juego
  if (!started) return;
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

restartBtn.addEventListener('click', () => {
  commitRecord('Anónimo'); // si había un récord sin nombre, se guarda igualmente
  init();
});

// ---- Tabla de records (localStorage, siempre en try/catch) ----
function loadRecords() {
  const empty = { top: [], bestCombo: 0, maxLines: 0 };
  try {
    const d = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!d || typeof d !== 'object') return empty;
    const top = (Array.isArray(d.top) ? d.top : [])
      .filter(e => e && Number.isFinite(e.score))
      .map(e => ({
        name: String(e.name ?? '').slice(0, 12) || 'Anónimo',
        score: e.score,
        lines: Number.isFinite(e.lines) ? e.lines : 0,
        combo: Number.isFinite(e.combo) ? e.combo : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
    return {
      top,
      bestCombo: Number.isFinite(d.bestCombo) ? d.bestCombo : 0,
      maxLines: Number.isFinite(d.maxLines) ? d.maxLines : 0,
    };
  } catch { return empty; }
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch {}
}

function qualifies(rec, sc) {
  return sc > 0 && (rec.top.length < MAX_RECORDS || sc > rec.top[rec.top.length - 1].score);
}

// Posición (0-based) de una entrada nueva (empates: después de las existentes)
function insertIndex(rec, sc) {
  const i = rec.top.findIndex(e => e.score < sc);
  return i === -1 ? rec.top.length : i;
}

// highlight = { index, entry }: entrada extra insertada y resaltada en la tabla
function renderRecords(container, rec, highlight) {
  container.textContent = '';
  const table = document.createElement('table');
  const rows = rec.top.slice();
  if (highlight) rows.splice(highlight.index, 0, highlight.entry);
  rows.slice(0, MAX_RECORDS).forEach((e, i) => {
    const tr = document.createElement('tr');
    if (highlight && i === highlight.index) tr.className = 'highlight';
    [`${i + 1}.`, e.name, e.score.toLocaleString()].forEach(t => {
      const td = document.createElement('td');
      td.textContent = t;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'Sin records todavía';
    tr.appendChild(td);
    table.appendChild(tr);
  }
  container.appendChild(table);
  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.textContent = `Mejor combo: ${rec.bestCombo} · Líneas máx: ${rec.maxLines}`;
  container.appendChild(stats);
}

function showGameOverRecords() {
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec); // guarda ya mejor combo / líneas máx aunque no se confirme el nombre
  const q = qualifies(rec, score);
  pendingEntry = null;
  if (q) {
    pendingEntry = { score, lines, combo: maxCombo };
    renderRecords(overlayRecords, rec,
      { index: insertIndex(rec, score), entry: { name: '???', score, lines, combo: maxCombo } });
    nameInput.value = '';
  } else {
    renderRecords(overlayRecords, rec, null);
  }
  recordMsg.classList.toggle('hidden', !q);
  nameForm.classList.toggle('hidden', !q);
  overlayRecords.classList.remove('hidden');
  resetRecordsBtn.classList.remove('hidden');
  if (q) setTimeout(() => nameInput.focus(), 0);
}

// Inserta la entrada pendiente con el nombre dado y la resalta
function commitRecord(name) {
  if (!pendingEntry) return;
  const rec = loadRecords();
  const p = pendingEntry;
  pendingEntry = null;
  const entry = { name: (name || '').trim().slice(0, 12) || 'Anónimo', score: p.score, lines: p.lines, combo: p.combo };
  const idx = insertIndex(rec, p.score);
  if (idx < MAX_RECORDS) {
    // se muestra la tabla previa + la entrada resaltada, y se guarda
    renderRecords(overlayRecords, rec, { index: idx, entry });
    rec.top.splice(idx, 0, entry);
    rec.top = rec.top.slice(0, MAX_RECORDS);
    saveRecords(rec);
  }
  nameForm.classList.add('hidden');
  nameInput.blur();
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitRecord(nameInput.value);
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records?')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch {}
  pendingEntry = null;
  nameForm.classList.add('hidden');
  recordMsg.classList.add('hidden');
  renderRecords(overlayRecords, loadRecords(), null);
});

function showStart() {
  renderRecords(startRecords, loadRecords(), null);
  startOverlay.classList.remove('hidden');
}

startBtn.addEventListener('click', () => {
  started = true;
  startOverlay.classList.add('hidden');
  startBtn.blur();
  init();
});

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
showStart(); // el juego arranca al pulsar "Jugar"
