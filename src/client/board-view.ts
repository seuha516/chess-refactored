import {
  fileOf,
  makeSquare,
  rankOf,
  squareName,
  type Color,
  type Piece,
  type Square,
} from '../shared/chess/index.ts';
import { COLOR_NAME, PIECE_NAME } from './text.ts';
import type { BoardModel } from './view-model.ts';

export interface BoardHandlers {
  /** A square was clicked or activated with the keyboard. */
  activate(square: Square): void;
  /** A piece was dragged from one square and dropped on another. */
  drop(from: Square, to: Square): void;
}

/**
 * The 3D table, when there is one: it draws the pieces and the drag, while
 * this view keeps the input, focus and screen-reader text.
 */
export interface BoardPresenter {
  hover(square: Square | null): void;
  dragStart(from: Square, x: number, y: number): void;
  dragMove(x: number, y: number, over: Square | null): void;
  dragEnd(): void;
}

/** Where the coordinates engraved on the table rim go. */
export interface BoardRim {
  readonly ranks: HTMLElement;
  readonly files: HTMLElement;
}

const PIECE_FILE: Record<Piece['type'], string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const pieceImage = (piece: Piece): string =>
  `/images/pieces/${piece.color === 'w' ? 'white' : 'black'}_${PIECE_FILE[piece.type]}.svg`;

const DRAG_THRESHOLD_PX = 4;
const SLIDE_MS = 190;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Renders the board as a grid of buttons. Moves can be made by clicking (or
 * pressing Enter/Space on) the source and target squares — the minimum FIDE
 * Online Regulations 3.5 asks for — or by dragging with mouse, pen or touch
 * (Pointer Events; the original used HTML5 drag and drop, which does not
 * work on touch screens). Arrow keys move the keyboard focus.
 */
export class BoardView {
  readonly #root: HTMLElement;
  readonly #rim: BoardRim | null;
  readonly #handlers: BoardHandlers;
  readonly #squares = new Map<Square, HTMLButtonElement>();
  #model: BoardModel | null = null;
  #focused: Square = 0;
  #drag: {
    from: Square;
    pointerId: number;
    startX: number;
    startY: number;
    ghost: HTMLImageElement | null;
    over: Square | null;
  } | null = null;
  #suppressClick = false;
  /** A move dropped by drag is already where it belongs; do not slide it. */
  #dropped: { from: Square; to: Square } | null = null;
  #presenter: BoardPresenter | null = null;

  constructor(root: HTMLElement, handlers: BoardHandlers, rim: BoardRim | null = null) {
    this.#root = root;
    this.#rim = rim;
    this.#handlers = handlers;
    for (let square = 0; square < 64; square++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `square ${(fileOf(square) + rankOf(square)) % 2 ? 'light' : 'dark'}`;
      button.dataset.square = String(square);
      button.setAttribute('role', 'gridcell');
      button.tabIndex = -1;
      this.#squares.set(square, button);
    }
    root.addEventListener('click', this.#onClick);
    root.addEventListener('keydown', this.#onKeyDown);
    root.addEventListener('pointerdown', this.#onPointerDown);
    root.addEventListener('pointermove', this.#onPointerMove);
    root.addEventListener('pointerup', this.#onPointerUp);
    root.addEventListener('pointercancel', this.#cancelDrag);
    root.addEventListener('pointerover', (event) => {
      this.#presenter?.hover(this.#squareFromEvent(event.target));
    });
    root.addEventListener('pointerleave', () => {
      this.#presenter?.hover(null);
    });
  }

  /** Hands the pieces and the drag over to the 3D table (or back, with null). */
  setPresenter(presenter: BoardPresenter | null): void {
    this.#presenter = presenter;
    this.#root.classList.toggle('is-3d', presenter !== null);
  }

  render(model: BoardModel): void {
    const previous = this.#model;
    const orientationChanged = previous?.orientation !== model.orientation;
    this.#model = model;
    if (orientationChanged) this.#layout(model.orientation);
    for (const [square, button] of this.#squares) this.#renderSquare(square, button, model);
    if (previous && model.ply !== previous.ply) {
      if (!orientationChanged && model.ply === previous.ply + 1 && !this.#presenter) {
        this.#slide(model);
      }
      this.#dropped = null;
    }
  }

  /** Places the 64 buttons in rows for the given orientation, with coordinates. */
  #layout(orientation: Color): void {
    const rows: HTMLElement[] = [];
    for (let row = 0; row < 8; row++) {
      const rowElement = document.createElement('div');
      rowElement.className = 'board-row';
      rowElement.setAttribute('role', 'row');
      for (let column = 0; column < 8; column++) {
        const square = this.#squareAt(row, column, orientation);
        const button = this.#squares.get(square);
        if (!button) continue;
        button.querySelectorAll('.coord').forEach((label) => {
          label.remove();
        });
        // Small in-square coordinates, shown where the board has no rim.
        if (column === 0) button.append(coordinate('rank', String(rankOf(square) + 1)));
        if (row === 7) button.append(coordinate('file', squareName(square).charAt(0)));
        rowElement.append(button);
      }
      rows.push(rowElement);
    }
    this.#root.replaceChildren(...rows);
    if (this.#rim) {
      const files = 'abcdefgh'.split('');
      const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
      if (orientation === 'b') {
        files.reverse();
        ranks.reverse();
      }
      this.#rim.files.replaceChildren(...files.map((text) => rimLabel(text)));
      this.#rim.ranks.replaceChildren(...ranks.map((text) => rimLabel(text)));
    }
    this.#updateTabStop();
  }

  #squareAt(row: number, column: number, orientation: Color): Square {
    const square = orientation === 'w' ? makeSquare(column, 7 - row) : makeSquare(7 - column, row);
    if (square === null) throw new Error('square out of range');
    return square;
  }

  #renderSquare(square: Square, button: HTMLButtonElement, model: BoardModel): void {
    const piece = model.board[square] ?? null;
    const isTarget = model.targets.has(square);
    button.classList.toggle(
      'last-move',
      model.lastMove?.from === square || model.lastMove?.to === square,
    );
    button.classList.toggle('selected', model.selected === square);
    button.classList.toggle('target', isTarget);
    button.classList.toggle('capture-target', isTarget && piece !== null);
    button.classList.toggle('check', model.check === square);
    button.classList.toggle('movable', model.movable.has(square));
    button.setAttribute('aria-selected', String(model.selected === square));

    let image = button.querySelector<HTMLImageElement>('img.piece');
    if (piece) {
      if (!image) {
        image = document.createElement('img');
        image.className = 'piece';
        image.alt = '';
        image.draggable = false;
        button.prepend(image);
      }
      const src = pieceImage(piece);
      if (image.getAttribute('src') !== src) image.src = src;
    } else {
      image?.remove();
    }

    const parts = [squareName(square)];
    parts.push(piece ? `${COLOR_NAME[piece.color]} ${PIECE_NAME[piece.type]}` : '빈 칸');
    if (model.selected === square) parts.push('선택됨');
    if (isTarget) parts.push('이동 가능');
    if (model.check === square) parts.push('체크');
    button.setAttribute('aria-label', parts.join(', '));
  }

  /** Slides the piece of the last move (and the rook of a castling) into place. */
  #slide(model: BoardModel): void {
    const move = model.lastMove;
    if (!move || reducedMotion.matches) return;
    if (this.#dropped?.from === move.from && this.#dropped.to === move.to) return;
    const paths: [Square, Square][] = [[move.from, move.to]];
    const piece = model.board[move.to];
    const fileStep = fileOf(move.to) - fileOf(move.from);
    if (piece?.type === 'k' && Math.abs(fileStep) === 2) {
      const rank = rankOf(move.to);
      const rookFrom = makeSquare(fileStep > 0 ? 7 : 0, rank);
      const rookTo = makeSquare(fileOf(move.to) - Math.sign(fileStep), rank);
      if (rookFrom !== null && rookTo !== null) paths.push([rookFrom, rookTo]);
    }
    for (const [from, to] of paths) {
      const start = this.#squares.get(from)?.getBoundingClientRect();
      const end = this.#squares.get(to);
      const image = end?.querySelector<HTMLImageElement>('img.piece');
      if (!start || !end || !image) continue;
      const box = end.getBoundingClientRect();
      const dx = start.left - box.left;
      const dy = start.top - box.top;
      end.classList.add('arriving');
      image
        .animate(
          [{ transform: `translate(${String(dx)}px, ${String(dy)}px)` }, { transform: 'none' }],
          {
            duration: SLIDE_MS,
            easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)',
          },
        )
        .finished.catch(() => undefined)
        .finally(() => {
          end.classList.remove('arriving');
        });
    }
  }

  #updateTabStop(): void {
    for (const [square, button] of this.#squares)
      button.tabIndex = square === this.#focused ? 0 : -1;
  }

  #squareFromEvent(target: EventTarget | null): Square | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLElement>('.square');
    if (!button?.dataset.square) return null;
    return Number(button.dataset.square);
  }

  #onClick = (event: MouseEvent): void => {
    if (this.#suppressClick) {
      this.#suppressClick = false;
      return;
    }
    const square = this.#squareFromEvent(event.target);
    if (square === null) return;
    this.#focused = square;
    this.#updateTabStop();
    this.#handlers.activate(square);
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    const steps: Record<string, [number, number]> = {
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const step = steps[event.key];
    const current = this.#squareFromEvent(event.target);
    if (!step || current === null) return;
    event.preventDefault();
    // Arrow keys follow the screen, so invert them when black is at the bottom.
    const sign = this.#model?.orientation === 'b' ? -1 : 1;
    const next = makeSquare(fileOf(current) + step[0] * sign, rankOf(current) + step[1] * sign);
    if (next === null) return;
    this.#focused = next;
    this.#updateTabStop();
    this.#squares.get(next)?.focus();
  };

  #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const square = this.#squareFromEvent(event.target);
    if (square === null || !this.#model?.movable.has(square)) return;
    this.#drag = {
      from: square,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      ghost: null,
      over: null,
    };
  };

  #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (drag?.pointerId !== event.pointerId) return;
    if (!drag.ghost) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < DRAG_THRESHOLD_PX) return;
      const piece = this.#model?.board[drag.from];
      if (!piece) return;
      // Selecting the piece shows its legal targets while dragging.
      if (this.#model?.selected !== drag.from) this.#handlers.activate(drag.from);
      drag.ghost = document.createElement('img');
      drag.ghost.className = 'drag-ghost';
      drag.ghost.alt = '';
      if (this.#presenter) {
        // The 3D table lifts the piece itself.
        drag.ghost.hidden = true;
        this.#presenter.dragStart(drag.from, event.clientX, event.clientY);
      } else {
        drag.ghost.src = pieceImage(piece);
      }
      document.body.append(drag.ghost);
      this.#squares.get(drag.from)?.classList.add('dragging');
      // Capture only once a drag has started: capturing on pointerdown would
      // retarget the click of a plain tap to the board container.
      this.#root.setPointerCapture(event.pointerId);
    }
    drag.ghost.style.transform = `translate(${String(event.clientX)}px, ${String(event.clientY)}px)`;
    const over = this.#squareFromEvent(document.elementFromPoint(event.clientX, event.clientY));
    this.#presenter?.dragMove(event.clientX, event.clientY, over);
    if (over !== drag.over) {
      if (drag.over !== null) this.#squares.get(drag.over)?.classList.remove('drop-hover');
      drag.over = over;
      if (over !== null) this.#squares.get(over)?.classList.add('drop-hover');
    }
  };

  #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (drag?.pointerId !== event.pointerId) return;
    const dragged = drag.ghost !== null;
    this.#cancelDrag();
    if (!dragged) return; // a plain click; handled by the click event
    // The click that follows a drag must not re-select or deselect.
    this.#suppressClick = true;
    setTimeout(() => (this.#suppressClick = false), 0);
    const target = this.#squareFromEvent(document.elementFromPoint(event.clientX, event.clientY));
    if (target !== null && target !== drag.from) {
      this.#dropped = { from: drag.from, to: target };
      this.#handlers.drop(drag.from, target);
    }
  };

  #cancelDrag = (): void => {
    const drag = this.#drag;
    if (!drag) return;
    if (drag.ghost) this.#presenter?.dragEnd();
    drag.ghost?.remove();
    this.#squares.get(drag.from)?.classList.remove('dragging');
    if (drag.over !== null) this.#squares.get(drag.over)?.classList.remove('drop-hover');
    if (this.#root.hasPointerCapture(drag.pointerId)) {
      this.#root.releasePointerCapture(drag.pointerId);
    }
    this.#drag = null;
  };
}

function coordinate(kind: 'rank' | 'file', text: string): HTMLElement {
  const label = document.createElement('span');
  label.className = `coord coord-${kind}`;
  label.textContent = text;
  label.setAttribute('aria-hidden', 'true');
  return label;
}

function rimLabel(text: string): HTMLElement {
  const label = document.createElement('span');
  label.textContent = text;
  return label;
}
