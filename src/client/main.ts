import { squareName, type PromotionPiece, type Square } from '../shared/chess/index.ts';
import type { CreateRoomResult, LobbySnapshot, RoomSnapshot } from '../shared/protocol.ts';
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
import {
  buildView,
  colorOf,
  formatClock,
  lobbyRows,
  type ClientState,
  type ViewModel,
} from './view-model.ts';

const CLOCK_WARNING_MS = 30_000;

function element<T extends HTMLElement>(id: string, type: abstract new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`#${id} is missing or not a ${type.name}`);
  return found;
}

const dom = {
  lobbyView: element('lobby-view', HTMLElement),
  createRoom: element('create-room', HTMLFormElement),
  roomName: element('room-name', HTMLInputElement),
  lobbyStatus: element('lobby-status', HTMLElement),
  roomList: element('room-list', HTMLElement),
  lobbyEmpty: element('lobby-empty', HTMLElement),
  lobbyMyName: element('lobby-my-name', HTMLElement),
  lobbyRename: element('lobby-rename', HTMLButtonElement),
  roomBar: element('room-bar', HTMLElement),
  roomTitle: element('room-title', HTMLElement),
  backToLobby: element('back-to-lobby', HTMLButtonElement),
  copyLink: element('copy-link', HTMLButtonElement),
  roomView: element('room-view', HTMLElement),
  captured: element('captured', HTMLElement),
  board: element('board', HTMLElement),
  result: element('result', HTMLElement),
  resultTitle: element('result-title', HTMLElement),
  resultReason: element('result-reason', HTMLElement),
  resultClose: element('result-close', HTMLButtonElement),
  clock1: element('clock-1', HTMLElement),
  clock2: element('clock-2', HTMLElement),
  timeControl: element('time-control', HTMLElement),
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

// ------------------------------------------------------------------- state

type Route = { readonly kind: 'lobby' } | { readonly kind: 'room'; readonly roomId: string };

function routeFromUrl(): Route {
  const roomId = new URLSearchParams(location.search).get('room');
  return roomId ? { kind: 'room', roomId } : { kind: 'lobby' };
}

const roomUrl = (roomId: string) =>
  `${location.origin}${location.pathname}?room=${encodeURIComponent(roomId)}`;

let route: Route = routeFromUrl();
let lobby: LobbySnapshot | null = null;
let state: ClientState = {
  session: null,
  room: null,
  selected: null,
  pending: false,
  flipped: false,
  dismissedResult: null,
};
let view: ViewModel = buildView(state);
/** performance.now() when the last room snapshot arrived, for local clocks. */
let snapshotAt = 0;
let clockWarnedFor = '';
let lastSyncRequest = 0;
let errorText: string | null = null;
let errorTimer: ReturnType<typeof setTimeout> | undefined;

/** Current server time, estimated from the last snapshot. */
const serverNow = () => (state.room ? state.room.at + (performance.now() - snapshotAt) : 0);

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
  view = buildView(state, serverNow());
  render();
}

// ----------------------------------------------------------------- routing

function navigate(next: Route): void {
  route = next;
  const url =
    next.kind === 'room' ? roomUrl(next.roomId) : `${location.origin}${location.pathname}`;
  if (url !== location.href) history.pushState(null, '', url);
  enterRoute();
}

window.addEventListener('popstate', () => {
  route = routeFromUrl();
  enterRoute();
});

/** Shows the current route and subscribes to it on the server. */
function enterRoute(): void {
  if (route.kind === 'room') {
    if (state.room?.id !== route.roomId) {
      chat.replace([]);
      update({ room: null, selected: null, pending: false, flipped: false, dismissedResult: null });
    }
  }
  render();
  if (!socket.connected) return; // re-entered on connect
  if (route.kind === 'lobby') {
    void request(socket, 'lobby:enter').then(report);
    return;
  }
  const roomId = route.roomId;
  void request(socket, 'room:join', roomId).then((result) => {
    if (result.ok || route.kind !== 'room' || route.roomId !== roomId) return;
    // The room is gone (or the link is wrong): back to the lobby with a message.
    navigate({ kind: 'lobby' });
    report(result);
  });
}

// ------------------------------------------------------------------ server

socket.on('connect', () => {
  dom.banner.hidden = true;
  enterRoute();
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
socket.on('lobby', (snapshot) => {
  lobby = snapshot;
  render();
});
socket.on('room', (room) => {
  if (route.kind !== 'room' || route.roomId !== room.id) return;
  const previous = state.room;
  snapshotAt = performance.now();
  const newGame = room.game?.id !== previous?.game?.id;
  const positionChanged = newGame || room.game?.moves.length !== previous?.game?.moves.length;
  let dismissedResult = newGame ? null : state.dismissedResult;
  // A game that had already ended before this page joined shows no banner.
  if (previous === null && room.game?.status === 'finished') dismissedResult = room.game.id;
  for (const message of room.chat) chat.append(message);
  update({ room, selected: positionChanged ? null : state.selected, dismissedResult });
  playSounds(previous, room);
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
  }, 4000);
  render();
}

const send = (event: Parameters<typeof request>[1], ...args: unknown[]) => {
  void request(socket, event, ...args).then(report);
};

dom.createRoom.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = dom.roomName.value.trim();
  void (request(socket, 'room:create', name) as Promise<CreateRoomResult | RequestResult>).then(
    (result) => {
      if (!result.ok) {
        report(result);
        return;
      }
      dom.roomName.value = '';
      if ('roomId' in result) navigate({ kind: 'room', roomId: result.roomId });
    },
  );
});

dom.roomList.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-room]') : null;
  const roomId = target?.getAttribute('data-room');
  if (roomId) navigate({ kind: 'room', roomId });
});

dom.backToLobby.addEventListener('click', () => {
  navigate({ kind: 'lobby' });
});

dom.copyLink.addEventListener('click', () => {
  if (route.kind !== 'room') return;
  const url = roomUrl(route.roomId);
  navigator.clipboard.writeText(url).then(
    () => {
      dom.copyLink.textContent = '복사했습니다!';
      setTimeout(() => (dom.copyLink.textContent = '초대 링크 복사'), 2000);
    },
    () => {
      window.prompt('이 링크를 친구에게 보내세요.', url);
    },
  );
});

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
dom.lobbyRename.addEventListener('click', openNameDialog);
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
  const inRoom = route.kind === 'room';
  dom.lobbyView.hidden = inRoom;
  dom.roomView.hidden = !inRoom;
  dom.roomBar.hidden = !inRoom;
  dom.captured.hidden = !inRoom;
  const myName = state.session ? `내 이름: ${state.session.name}` : '';
  dom.myName.textContent = myName;
  dom.lobbyMyName.textContent = myName;
  if (inRoom) renderRoom();
  else renderLobby();
}

function renderLobby(): void {
  document.title = 'Chess';
  dom.lobbyStatus.textContent = errorText ?? (lobby ? '' : '방 목록을 불러오는 중…');
  dom.lobbyStatus.hidden = !dom.lobbyStatus.textContent;
  dom.lobbyStatus.classList.toggle('error', errorText !== null);
  const rows = lobby ? lobbyRows(lobby) : [];
  dom.lobbyEmpty.hidden = !lobby || rows.length > 0;
  dom.roomList.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `room-item${row.playing ? ' playing' : ''}`;
      button.dataset.room = row.id;
      const name = document.createElement('span');
      name.className = 'room-item-name';
      name.textContent = row.name;
      const detail = document.createElement('span');
      detail.className = 'room-item-detail';
      detail.textContent = row.detail;
      button.append(name, detail);
      item.append(button);
      return item;
    }),
  );
}

function renderRoom(): void {
  const room = state.room;
  dom.roomTitle.textContent = room?.name ?? '';
  document.title = room ? `${room.name} - Chess` : 'Chess';

  board.render(view.board);
  // Moves played so far; lets automated tests wait for the server's answer.
  dom.board.dataset.ply = String(room?.game?.moves.length ?? 0);
  dom.board.dataset.status = room?.game?.status ?? 'none';

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

  dom.status.textContent = errorText ?? (room ? view.status : '방에 들어가는 중…');
  dom.status.classList.toggle('error', errorText !== null);

  renderList(dom.moves, view.moveRows);
  dom.moves.scrollTop = dom.moves.scrollHeight;
  renderCaptured(dom.capturedWhite, 'w', view.captured.w);
  renderCaptured(dom.capturedBlack, 'b', view.captured.b);

  const { controls } = view;
  dom.seatTake.hidden = !room || !controls.seatTake;
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

/** Clocks under the player names: white left, black right (as in `view.players`). */
function renderClock(): void {
  const clock = view.clock;
  const game = state.room?.game;
  dom.timeControl.hidden = !game;
  if (game) {
    const { initialMs, incrementMs } = game.timeControl;
    dom.timeControl.textContent = `${String(initialMs / 60_000)}분 + ${String(incrementMs / 1000)}초 (수마다 추가)`;
  }
  const sides = [
    [dom.clock1, 'w'],
    [dom.clock2, 'b'],
  ] as const;
  for (const [node, color] of sides) {
    node.hidden = clock === null;
    if (!clock) continue;
    const stored = color === 'w' ? clock.whiteMs : clock.blackMs;
    const running = clock.running === color;
    const left = running ? stored - (performance.now() - snapshotAt) : stored;
    node.textContent = formatClock(left);
    node.classList.toggle('running', running);
    node.classList.toggle('low', left <= CLOCK_WARNING_MS);
    node.setAttribute(
      'aria-label',
      `${color === 'w' ? '백' : '흑'} 남은 시간 ${formatClock(left)}`,
    );

    // Warn once per game when the player's own time gets low.
    const key = `${String(game?.id)}:${color}`;
    if (running && left <= CLOCK_WARNING_MS && view.myColor === color && clockWarnedFor !== key) {
      clockWarnedFor = key;
      playSound('clockWarning');
    }
  }
}

/**
 * Runs the local clocks. When a time rule is due (a clock reached zero, a
 * disconnected player's grace period ended), asks the server to apply it:
 * on Vercel the server instance that armed a timer for it may be gone.
 */
let lastFullRender = 0;
setInterval(() => {
  if (route.kind !== 'room' || !state.room) return;
  const now = performance.now();
  if (now - lastFullRender > 1000) {
    lastFullRender = now;
    update({}); // refreshes countdown texts
  } else {
    renderClock();
  }
  if (view.syncAt !== null && serverNow() >= view.syncAt + 250 && now - lastSyncRequest > 3000) {
    lastSyncRequest = now;
    void request(socket, 'room:sync');
  }
}, 100);

// ------------------------------------------------------------------ sounds

/** Sound effects of the original game, triggered by snapshot changes. */
function playSounds(previous: RoomSnapshot | null, next: RoomSnapshot): void {
  // The first snapshot after entering a room is not an event to announce.
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
