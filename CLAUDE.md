# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tetris clone: `index.html` + `style.css` + `game.js` (plain HTML5 Canvas, vanilla ES6, global scope). No `package.json`, bundler, linter, or tests. Nothing to build.

- Run: open `index.html` in a browser, or serve statically (`npx serve .` / `python -m http.server 8000`). Verify changes by reloading.
- README, in-game UI strings, and code comments are in Spanish. Keep that convention.

## Architecture (`game.js`)

- Board is a `ROWS x COLS` (20x10) matrix; cell is `0` or a color index 1-7. `PIECES` and `COLORS` are parallel arrays indexed by that same value (index 0 is `null`). Piece matrices store their own index as cell values.
- Canvas is 300x600 = `COLS*BLOCK` x `ROWS*BLOCK` (`BLOCK = 30`). Changing any of the three requires editing `<canvas id="board">` in `index.html`. The next-piece preview uses a second canvas, `#next-canvas` (4x4 cells, drawn in `drawNext`).
- Module-level mutable state (`board, current, next, score, lines, level, paused, gameOver, dropInterval, ...`) is reset by `init()`. Flow: `spawn()` moves `next` to `current`; a spawn that collides calls `endGame()`; `lockPiece()` -> `merge()` -> `clearLines()` -> `spawn()`.
- `loop(ts)` accumulates time and drops one row when `dropAccum >= dropInterval`. Interval = `max(100, 1000 - (level-1)*90)` ms; level rises every 10 lines.
- Rotation: `rotateCW` (transpose + reverse), `tryRotate` applies wall kicks (0, ±1, ±2 columns). Collision via `collide(shape, ox, oy)`; ghost via `ghostY()`.
- Scoring: `LINE_SCORES` x level; hard drop +2/cell, soft drop +1/row. README documents this; keep both in sync.
- Controls (keydown handler): arrows move/soft-drop, Up or X rotates, Space hard-drops, P pauses. Pause and game-over share the `#overlay` element.
