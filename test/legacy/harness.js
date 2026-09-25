// Loads the original browser script (static/js/Chess.js) into an isolated
// Node vm context so its rule functions can be exercised directly.
//
// - `document.getElementById` only resolves IDs that exist in Chess.html,
//   so code that looks up a non-existent element fails like in a browser.
// - `io()` returns a fake socket that records handlers and emitted events.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const scriptSource = readFileSync(`${root}static/js/Chess.js`, 'utf8');
const htmlIds = new Set(
  [...readFileSync(`${root}Chess.html`, 'utf8').matchAll(/id=['"]([^'"]+)['"]/g)].map((m) => m[1]),
);

function fakeElement() {
  const el = {
    style: {},
    classList: { add() {}, toggle() {}, remove() {} },
    children: [],
    textContent: '',
    appendChild(child) {
      el.children.push(child);
      return child;
    },
    removeChild(child) {
      el.children.splice(el.children.indexOf(child), 1);
    },
    hasChildNodes() {
      return el.children.length > 0;
    },
    get firstChild() {
      return el.children[0];
    },
    addEventListener() {},
    play() {},
    focus() {},
  };
  return el;
}

export function loadLegacyClient() {
  const handlers = new Map();
  const emitted = [];
  const socket = {
    id: 'legacy-socket',
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, data) {
      emitted.push({ event, data });
    },
    disconnect() {},
  };
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!htmlIds.has(id)) return null;
      if (!elements.has(id)) elements.set(id, fakeElement());
      return elements.get(id);
    },
    createElement: () => fakeElement(),
    createTextNode: (text) => ({ text }),
    getElementsByClassName: () => ({ length: 0, item: () => null }),
  };
  const context = vm.createContext({
    io: () => socket,
    document,
    console: { log() {} },
    setTimeout: () => 0,
    setInterval: () => 0,
    clearInterval() {},
    prompt: () => '',
    alert() {},
    Math,
    Number,
    String,
  });
  vm.runInContext(scriptSource, context, { filename: 'static/js/Chess.js' });
  return { ctx: context, handlers, emitted };
}

/**
 * Places pieces on the legacy board. The legacy client stores the board from
 * the local player's point of view; with `선공 = 1` (white) row 0 is rank 8
 * and column 0 is file a, so `a1` maps to [7][0].
 *
 * @param ctx vm context returned by loadLegacyClient
 * @param pieces e.g. { e1: 'wK', h1: 'wR', h2: 'bP' }
 */
export function setWhitePerspectiveBoard(ctx, pieces) {
  const names = { K: '킹', Q: '퀸', R: '룩', B: '비숍', N: '나이트', P: '폰' };
  ctx.선공 = 1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.체스판[r][c] = '';
      ctx.체스판말의색[r][c] = '';
    }
  }
  for (const [square, code] of Object.entries(pieces)) {
    const [row, col] = toLegacy(square);
    ctx.체스판말의색[row][col] = code[0] === 'w' ? '하양' : '검정';
    ctx.체스판[row][col] = names[code[1]];
  }
}

/** Converts algebraic square (white perspective) to legacy [row, col]. */
export function toLegacy(square) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  return [8 - rank, file];
}
