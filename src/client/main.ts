import { squareName, type PromotionPiece, type Square } from '../shared/chess/index.ts';
import type { RoomSnapshot } from '../shared/protocol.ts';
import { BoardView, pieceImage } from './board-view.ts';
import { ChatView } from './chat-view.ts';
import {
  createSocket,
  request,
  saveName,
  savedName,
  saveToken,
  type RequestResult,
} from './connection.ts';
import { playSound } from './sounds.ts';
import { ERROR_TEXT, PIECE_NAME } from './text.ts';
import { buildView, colorOf, formatClock, type ClientState, type ViewModel } from './view-model.ts';

const CLOCK_WARNING_MS = 30_000;

function element<T extends HTMLElement>(id: string, type: abstract new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`#${id} is missing or not a ${type.name}`);
  return found;
}

const dom = {
  board: element('board', HTMLElement),
  result: element('result', HTMLElement),
  resultTitle: element('result-title', HTMLElement),
  resultReason: element('result-reason', HTMLElement),
  resultClose: element('result-close', HTMLButtonElement),
  clock: element('clock', HTMLElement),
  clockKing: element('clock-king', HTMLImageElement),
  clockTime: element('clock-time', HTMLElement),
  capturedWhite: element('captured-white', HTMLElement),
  capturedBlack: element('captured-black', HTMLElement),
  banner: element('connection-banner', HTMLElement),
  player1: element('player-1', HTMLElement),
  player2: element('player-2', HTMLElement),
  status: element('status', HTMLElement),
  moves: element('moves', HTMLElement),
  seatTake: element('seat-take', HTMLButtonElement),
  seatLeave: element('seat-leave', HTMLButtonElement),
  drawOffer: element('draw-offer', HTMLButtonElement),
  drawAccept: element('draw-accept', HTMLButtonElement),
  drawDecline: element('draw-decline', HTMLButtonElement),
  resign: element('resign', HTMLButtonElement),
  flip: element('flip', HTMLButtonElement),
  chatLog: element('chat-log', HTMLElement),
  chatForm: element('chat-form', HTMLFormElement),
  chatInput: element('chat-input', HTMLInputElement),
  myName: element('my-name', HTMLElement),
  rename: element('rename', HTMLButtonElement),
  nameDialog: element('name-dialog', HTMLDialogElement),
  nameInput: element('name-input', HTMLInputElement),
  promotionDialog: element('promotion-dialog', HTMLDialogElement),
  promotionChoices: element('promotion-choices', HTMLElement),
};

let state: ClientState = {
  session: null,
  room: null,
  selected: null,
  pending: false,
  flipped: false,
  dismissedResult: null,
};
let view: ViewModel = buildView(state);
/** performance.now() when the last snapshot arrived, for the local clock. */
let snapshotAt = 0;
let clockWarnedFor = '';
let errorText: string | null = null;
let errorTimer: ReturnType<typeof setTimeout> | undefined;

const socket = createSocket();
const chat = new ChatView(dom.chatLog);
const board = new BoardView(dom.board, {
  activate: (square) => {
    onSquare(square);
  },
  drop: (from, to) => {
    void tryMove(from, to);
  },
});

function update(patch: Partial<ClientState>): void {
  state = { ...state, ...patch };
  view = buildView(state);
  render();
}

// ------------------------------------------------------------------ server

socket.on('connect', () => {
  dom.banner.hidden = true;
});
socket.on('disconnect', () => {
  dom.banner.textContent = '서버와 연결이 끊어졌습니다. 다시 연결하는 중…';
  dom.banner.hidden = false;
});
socket.on('connect_error', () => {
  dom.banner.textContent = '서버에 연결할 수 없습니다. 잠시 후 다시 시도합니다…';
  dom.banner.hidden = false;
  // A refusal by the server (e.g. connection rate limit) is not retried
  // automatically, unlike network errors.
  if (!socket.active) {
    setTimeout(() => {
      socket.connect();
    }, 5000);
  }
});
socket.on('session', (session) => {
  saveToken(session.token);
  chat.setMyId(session.playerId);
  update({ session });
});
socket.on('room', (room) => {
  const previous = state.room;
  snapshotAt = performance.now();
  const newGame = room.game?.id !== previous?.game?.id;
  const positionChanged = newGame || room.game?.moves.length !== previous?.game?.moves.length;
  let dismissedResult = newGame ? null : state.dismissedResult;
  // A game that had already ended before this page connected shows no banner.
  if (previous === null && room.game?.status === 'finished') dismissedResult = room.game.id;
  update({ room, selected: positionChanged ? null : state.selected, dismissedResult });
  playSounds(previous, room);
});
socket.on('chat:history', (messages) => {
  chat.replace(messages);
});
socket.on('chat', (message) => {
  chat.append(message);
});

// ------------------------------------------------------------------- moves

function onSquare(square: Square): void {
  if (state.selected !== null && view.board.targets.has(square)) {
    void tryMove(state.selected, square);
  } else if (view.board.movable.has(square) && state.selected !== square) {
    update({ selected: square });
  } else {
    update({ selected: null });
  }
}

async function tryMove(from: Square, to: Square): Promise<void> {
  const game = state.room?.game;
  const candidates = view.legalMoves.filter((move) => move.from === from && move.to === to);
  const first = candidates[0];
  if (!game || !first) {
    update({ selected: view.board.movable.has(from) ? from : null });
    return;
  }
  let promotion: PromotionPiece | null = null;
  if (first.promotion) {
    promotion = await choosePromotion(first.color);
    if (!promotion) return;
  }
  update({ pending: true, selected: null });
  playSound('move');
  const result = await request(socket, 'game:move', {
    from: squareName(from),
    to: squareName(to),
    ...(promotion ? { promotion } : {}),
    ply: game.moves.length,
  });
  update({ pending: false });
  report(result);
}

function choosePromotion(color: 'w' | 'b'): Promise<PromotionPiece | null> {
  const pieces: PromotionPiece[] = ['q', 'r', 'b', 'n'];
  dom.promotionChoices.replaceChildren(
    ...pieces.map((type) => {
      const button = document.createElement('button');
      button.type = 'submit';
      button.value = type;
      button.className = 'promotion-choice';
      const image = document.createElement('img');
      image.src = pieceImage({ color, type });
      image.alt = PIECE_NAME[type];
      button.append(image);
      return button;
    }),
  );
  dom.promotionDialog.returnValue = '';
  dom.promotionDialog.showModal();
  return new Promise((resolve) => {
    dom.promotionDialog.addEventListener(
      'close',
      () => {
        const value = dom.promotionDialog.returnValue;
        resolve(pieces.find((piece) => piece === value) ?? null);
      },
      { once: true },
    );
  });
}

// ---------------------------------------------------------------- controls

function report(result: RequestResult): void {
  if (result.ok) return;
  errorText = ERROR_TEXT[result.error];
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    errorText = null;
    render();
  }, 3000);
  render();
}

const send = (event: Parameters<typeof request>[1], ...args: unknown[]) => {
  void request(socket, event, ...args).then(report);
};

dom.seatTake.addEventListener('click', () => {
  send('seat:take');
});
dom.seatLeave.addEventListener('click', () => {
  send('seat:leave');
});
dom.drawOffer.addEventListener('click', () => {
  send('game:offer-draw');
});
dom.drawAccept.addEventListener('click', () => {
  send('game:accept-draw');
});
dom.drawDecline.addEventListener('click', () => {
  send('game:decline-draw');
});
dom.resign.addEventListener('click', () => {
  if (window.confirm('정말 기권하시겠습니까?')) send('game:resign');
});
dom.flip.addEventListener('click', () => {
  update({ flipped: !state.flipped });
});
dom.resultClose.addEventListener('click', () => {
  update({ dismissedResult: state.room?.game?.id ?? null });
});

dom.chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = dom.chatInput.value.trim();
  if (!text) return;
  dom.chatInput.value = '';
  send('chat:send', text);
});

function openNameDialog(): void {
  dom.nameInput.value = state.session?.name ?? savedName() ?? '';
  dom.nameDialog.returnValue = '';
  dom.nameDialog.showModal();
}

dom.rename.addEventListener('click', openNameDialog);
dom.nameDialog.addEventListener('close', () => {
  const name = dom.nameDialog.returnValue === 'ok' ? dom.nameInput.value.trim() : '';
  if (!state.session) {
    // First visit: like the original, ask for the name before joining.
    // Without a name the server assigns an anonymous one.
    if (name) saveName(name);
    socket.connect();
    return;
  }
  if (!name) return;
  void request(socket, 'profile:set-name', name).then((result) => {
    if (result.ok) saveName(name);
    report(result);
  });
});

// ------------------------------------------------------------------ render

function render(): void {
  board.render(view.board);
  // Moves played so far; lets automated tests wait for the server's answer.
  dom.board.dataset.ply = String(state.room?.game?.moves.length ?? 0);
  dom.board.dataset.status = state.room?.game?.status ?? 'none';

  const [first, second] = view.players;
  for (const [node, label] of [
    [dom.player1, first],
    [dom.player2, second],
  ] as const) {
    node.textContent = label ? label.text : '(대기중)';
    node.classList.toggle('me', label?.me ?? false);
    node.classList.toggle('offline', label ? !label.connected : false);
    node.title = label && !label.connected ? '연결 끊김' : '';
  }

  dom.status.textContent = errorText ?? view.status;
  dom.status.classList.toggle('error', errorText !== null);

  renderList(dom.moves, view.moveRows);
  dom.moves.scrollTop = dom.moves.scrollHeight;
  renderCaptured(dom.capturedWhite, 'w', view.captured.w);
  renderCaptured(dom.capturedBlack, 'b', view.captured.b);

  const { controls } = view;
  dom.seatTake.hidden = !controls.seatTake;
  dom.seatLeave.hidden = !controls.seatLeave;
  dom.drawOffer.hidden = controls.draw === 'hidden' || controls.draw === 'respond';
  dom.drawOffer.disabled = controls.draw === 'offered';
  dom.drawOffer.textContent = controls.draw === 'offered' ? '무승부 제안함' : '무승부 신청';
  dom.drawAccept.hidden = controls.draw !== 'respond';
  dom.drawDecline.hidden = controls.draw !== 'respond';
  dom.resign.hidden = !controls.resign;

  const result = view.result;
  dom.result.hidden = result === null;
  if (result) {
    dom.resultTitle.textContent = result.title;
    dom.resultReason.textContent = result.reason;
    dom.result.dataset.tone = result.tone;
  }

  dom.myName.textContent = state.session ? `내 이름: ${state.session.name}` : '';
  renderClock();
}

function renderList(list: HTMLElement, rows: readonly string[]): void {
  while (list.childElementCount > rows.length) list.lastElementChild?.remove();
  rows.forEach((row, index) => {
    let item = list.children[index];
    if (!item) {
      item = document.createElement('li');
      list.append(item);
    }
    if (item.textContent !== row) item.textContent = row;
  });
}

function renderCaptured(row: HTMLElement, color: 'w' | 'b', pieces: readonly string[]): void {
  const key = pieces.join('');
  if (row.dataset.key === key) return;
  row.dataset.key = key;
  row.replaceChildren(
    ...pieces.map((type) => {
      const image = document.createElement('img');
      image.src = pieceImage({ color, type: type as 'p' });
      image.alt = PIECE_NAME[type as 'p'];
      return image;
    }),
  );
}

function renderClock(): void {
  const clock = view.clock;
  dom.clock.hidden = clock === null;
  if (!clock) return;
  const left = clock.remainingMs - (performance.now() - snapshotAt);
  dom.clockTime.textContent = formatClock(left);
  dom.clock.classList.toggle('low', left <= CLOCK_WARNING_MS);
  const king = pieceImage({ color: clock.turn, type: 'k' });
  if (dom.clockKing.getAttribute('src') !== king) dom.clockKing.src = king;
  dom.clockKing.alt = clock.turn === 'w' ? '백 차례' : '흑 차례';

  const key = `${String(state.room?.game?.id)}:${String(state.room?.game?.moves.length)}`;
  if (left <= CLOCK_WARNING_MS && view.myColor === clock.turn && clockWarnedFor !== key) {
    clockWarnedFor = key;
    playSound('clockWarning');
  }
}

setInterval(renderClock, 250);

// ------------------------------------------------------------------ sounds

/** Sound effects of the original game, triggered by snapshot changes. */
function playSounds(previous: RoomSnapshot | null, next: RoomSnapshot): void {
  // The first snapshot after loading the page is not an event to announce.
  if (!previous) return;
  const before = previous.game;
  const after = next.game;
  if (!after) return;
  const me = state.session?.playerId;
  const myColor = colorOf(after, me);
  if (after.id !== before?.id) {
    if (after.status === 'playing') playSound('gameStart');
    return;
  }
  if (after.status === 'finished' && before.status === 'playing') {
    playSound(myColor && after.outcome?.winner === myColor ? 'victory' : 'defeatOrDraw');
    return;
  }
  if (after.moves.length > before.moves.length) {
    const last = after.moves.at(-1);
    if (!last || last.color === myColor) return; // own move already made a sound
    if (!myColor) playSound('move');
    else playSound(last.san.endsWith('+') ? 'check' : 'yourTurn');
  } else if (after.drawOffer && after.drawOffer !== before.drawOffer) {
    playSound('gameStart');
  }
}

render();
if (savedName() === null) openNameDialog();
else socket.connect();
