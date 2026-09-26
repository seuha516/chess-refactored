import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import { squareName, type Color, type PromotionPiece, type Square } from '../shared/chess/index.ts';
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
import { COLOR_NAME, ERROR_TEXT, PIECE_NAME } from './text.ts';
import {
  buildView,
  colorOf,
  formatClock,
  lobbyRows,
  moveRowText,
  type ClientState,
  type LobbyRow,
  type SeatView,
  type ViewModel,
} from './view-model.ts';

const CLOCK_WARNING_MS = 30_000;
const CONFIRM_TIMEOUT_MS = 6000;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function element<T extends HTMLElement>(id: string, type: abstract new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`#${id} is missing or not a ${type.name}`);
  return found;
}

interface SeatElements {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly tag: HTMLElement;
  readonly haul: HTMLElement;
  readonly clock: HTMLElement;
  readonly action: HTMLElement;
}

function seatElements(id: string): SeatElements {
  const root = element(id, HTMLElement);
  const part = (selector: string) => {
    const found = root.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`#${id} ${selector} is missing`);
    return found;
  };
  return {
    root,
    name: part('.seat-name'),
    tag: part('.seat-tag'),
    haul: part('.seat-haul'),
    clock: part('.clock'),
    action: part('.seat-action'),
  };
}

const dom = {
  brand: element('brand', HTMLAnchorElement),
  lobbyView: element('lobby-view', HTMLElement),
  createRoom: element('create-room', HTMLFormElement),
  roomName: element('room-name', HTMLInputElement),
  lobbyStatus: element('lobby-status', HTMLElement),
  roomList: element('room-list', HTMLElement),
  roomCount: element('room-count', HTMLElement),
  lobbyEmpty: element('lobby-empty', HTMLElement),
  roomBar: element('room-bar', HTMLElement),
  roomTitle: element('room-title', HTMLElement),
  roomMeta: element('room-meta', HTMLElement),
  backToLobby: element('back-to-lobby', HTMLButtonElement),
  copyLink: element('copy-link', HTMLButtonElement),
  copyLinkLabel: element('copy-link-label', HTMLElement),
  roomView: element('room-view', HTMLElement),
  seatTop: seatElements('seat-top'),
  seatBottom: seatElements('seat-bottom'),
  board: element('board', HTMLElement),
  stash: element('stash', HTMLElement),
  rimRanks: element('rim-ranks', HTMLElement),
  rimFiles: element('rim-files', HTMLElement),
  result: element('result', HTMLElement),
  resultTitle: element('result-title', HTMLElement),
  resultReason: element('result-reason', HTMLElement),
  resultJoin: element('result-join', HTMLElement),
  resultClose: element('result-close', HTMLButtonElement),
  timeControl: element('time-control', HTMLElement),
  capturedWhite: element('captured-white', HTMLElement),
  capturedBlack: element('captured-black', HTMLElement),
  banner: element('connection-banner', HTMLElement),
  status: element('status', HTMLElement),
  moves: element('moves', HTMLElement),
  moveCount: element('move-count', HTMLElement),
  movesEmpty: element('moves-empty', HTMLElement),
  seatTake: element('seat-take', HTMLButtonElement),
  seatLeave: element('seat-leave', HTMLButtonElement),
  drawOffer: element('draw-offer', HTMLButtonElement),
  drawOfferLabel: element('draw-offer-label', HTMLElement),
  drawAccept: element('draw-accept', HTMLButtonElement),
  drawDecline: element('draw-decline', HTMLButtonElement),
  resign: element('resign', HTMLButtonElement),
  flip: element('flip', HTMLButtonElement),
  controls: element('controls', HTMLElement),
  confirm: element('confirm', HTMLElement),
  confirmText: element('confirm-text', HTMLElement),
  confirmYes: element('confirm-yes', HTMLButtonElement),
  confirmNo: element('confirm-no', HTMLButtonElement),
  online: element('online', HTMLElement),
  chatLog: element('chat-log', HTMLElement),
  chatForm: element('chat-form', HTMLFormElement),
  chatInput: element('chat-input', HTMLInputElement),
  myName: element('my-name', HTMLElement),
  rename: element('rename', HTMLButtonElement),
  nameDialog: element('name-dialog', HTMLDialogElement),
  nameDialogTitle: element('name-dialog-title', HTMLElement),
  nameCancel: element('name-cancel', HTMLButtonElement),
  nameOk: element('name-ok', HTMLButtonElement),
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
/** A resignation or draw offer waiting for the second, confirming press. */
let confirming: 'resign' | 'draw' | null = null;
let confirmTimer: ReturnType<typeof setTimeout> | undefined;

/** Current server time, estimated from the last snapshot. */
const serverNow = () => (state.room ? state.room.at + (performance.now() - snapshotAt) : 0);

const socket = createSocket();
const chat = new ChatView(dom.chatLog);
const board = new BoardView(
  dom.board,
  {
    activate: (square) => {
      onSquare(square);
    },
    drop: (from, to) => {
      void tryMove(from, to);
    },
  },
  { ranks: dom.rimRanks, files: dom.rimFiles },
);

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
      setConfirming(null);
      delete dom.seatTop.root.dataset.who;
      delete dom.seatBottom.root.dataset.who;
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

// On Vercel the server closes every connection after at most 5 minutes and
// the client reconnects at once; only show the banner if that takes a while.
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
socket.on('connect', () => {
  clearTimeout(bannerTimer);
  dom.banner.hidden = true;
  enterRoute();
});
socket.on('disconnect', () => {
  clearTimeout(bannerTimer);
  if (idleDisconnected) return;
  bannerTimer = setTimeout(() => {
    dom.banner.textContent = '서버와 연결이 끊어졌습니다. 다시 연결하는 중…';
    dom.banner.hidden = false;
  }, 3000);
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

// A tab left in the background (and not playing) disconnects after a while,
// so idle visitors do not keep a server function running; it reconnects as
// soon as it is shown again.
const IDLE_DISCONNECT_MS = 5 * 60_000;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let idleDisconnected = false;
document.addEventListener('visibilitychange', () => {
  clearTimeout(idleTimer);
  if (document.visibilityState === 'hidden') {
    idleTimer = setTimeout(() => {
      const playing = state.room?.game?.status === 'playing' && view.myColor !== null;
      if (playing || !socket.connected) return;
      idleDisconnected = true;
      socket.disconnect();
    }, IDLE_DISCONNECT_MS);
  } else if (idleDisconnected) {
    idleDisconnected = false;
    socket.connect();
  }
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

function choosePromotion(color: Color): Promise<PromotionPiece | null> {
  const pieces: PromotionPiece[] = ['q', 'r', 'b', 'n'];
  dom.promotionChoices.replaceChildren(
    ...pieces.map((type) => {
      const button = document.createElement('button');
      button.type = 'submit';
      button.value = type;
      button.className = 'promotion-choice';
      const image = document.createElement('img');
      image.src = pieceImage({ color, type });
      image.alt = '';
      const label = document.createElement('span');
      label.textContent = PIECE_NAME[type];
      button.append(image, label);
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

dom.brand.addEventListener('click', (event) => {
  event.preventDefault();
  navigate({ kind: 'lobby' });
});

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

let copiedTimer: ReturnType<typeof setTimeout> | undefined;
dom.copyLink.addEventListener('click', () => {
  if (route.kind !== 'room') return;
  const url = roomUrl(route.roomId);
  navigator.clipboard.writeText(url).then(
    () => {
      dom.copyLinkLabel.textContent = '복사했습니다';
      dom.copyLink.classList.add('done');
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        dom.copyLinkLabel.textContent = '초대 링크 복사';
        dom.copyLink.classList.remove('done');
      }, 2000);
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
dom.drawAccept.addEventListener('click', () => {
  send('game:accept-draw');
});
dom.drawDecline.addEventListener('click', () => {
  send('game:decline-draw');
});

/** Resigning and offering a draw take a second press on the confirm bar. */
function setConfirming(next: typeof confirming): void {
  confirming = next;
  clearTimeout(confirmTimer);
  if (next) {
    confirmTimer = setTimeout(() => {
      setConfirming(null);
      render();
    }, CONFIRM_TIMEOUT_MS);
  }
}

dom.drawOffer.addEventListener('click', () => {
  setConfirming('draw');
  render();
  dom.confirmYes.focus();
});
dom.resign.addEventListener('click', () => {
  setConfirming('resign');
  render();
  dom.confirmYes.focus();
});
dom.confirmYes.addEventListener('click', () => {
  const action = confirming;
  setConfirming(null);
  if (action === 'resign') send('game:resign');
  if (action === 'draw') send('game:offer-draw');
  render();
});
dom.confirmNo.addEventListener('click', () => {
  const action = confirming;
  setConfirming(null);
  render();
  (action === 'resign' ? dom.resign : dom.drawOffer).focus();
});
dom.confirm.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') dom.confirmNo.click();
});

dom.flip.addEventListener('click', () => {
  update({ flipped: !state.flipped });
});
dom.resultClose.addEventListener('click', () => {
  update({ dismissedResult: state.room?.game?.id ?? null });
});
dom.seatTake.addEventListener('click', () => {
  // Joining from the result plaque also puts the plaque away.
  if (dom.seatTake.parentElement === dom.resultJoin) {
    update({ dismissedResult: state.room?.game?.id ?? null });
  }
});

dom.chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = dom.chatInput.value.trim();
  if (!text) return;
  dom.chatInput.value = '';
  send('chat:send', text);
});

function openNameDialog(): void {
  const firstVisit = !state.session;
  dom.nameDialogTitle.textContent = firstVisit ? '대국에서 쓸 이름을 정해주세요' : '이름 바꾸기';
  dom.nameOk.textContent = firstVisit ? '시작하기' : '바꾸기';
  dom.nameCancel.textContent = firstVisit ? '익명으로 시작' : '취소';
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
  const inRoom = route.kind === 'room';
  document.body.dataset.route = inRoom ? 'room' : 'lobby';
  dom.lobbyView.hidden = inRoom;
  dom.roomView.hidden = !inRoom;
  dom.roomBar.hidden = !inRoom;
  dom.myName.textContent = state.session?.name ?? '';
  dom.rename.hidden = !state.session;
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
  dom.roomCount.textContent = rows.length ? `${String(rows.length)}개` : '';
  dom.roomList.replaceChildren(...rows.map(lobbyTable));
}

/** A room in the lobby, drawn as a table seen from above with its two seats. */
function lobbyTable(row: LobbyRow): HTMLElement {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `room-item${row.playing ? ' playing' : ''}`;
  button.dataset.room = row.id;

  const top = document.createElement('span');
  top.className = 'mini-table';
  top.setAttribute('aria-hidden', 'true');
  const [far, near] = row.seats;
  top.append(miniSeat(far), miniBoard(), miniSeat(near));

  const name = document.createElement('span');
  name.className = 'room-item-name';
  name.textContent = row.name;
  const status = document.createElement('span');
  status.className = 'room-item-status';
  status.textContent = row.status;
  const players = document.createElement('span');
  players.className = 'room-item-players';
  const seated = row.seats.filter((seat): seat is string => seat !== null);
  players.textContent = seated.length ? seated.join(row.playing ? ' vs ' : ', ') : '빈 테이블';
  const text = document.createElement('span');
  text.className = 'room-item-text';
  text.append(name, status, players);

  button.append(top, text);
  item.append(button);
  return item;
}

function miniSeat(name: string | null): HTMLElement {
  const seat = document.createElement('span');
  seat.className = name ? 'mini-seat' : 'mini-seat empty';
  seat.textContent = name ?? '빈 자리';
  return seat;
}

function miniBoard(): HTMLElement {
  const top = document.createElement('span');
  top.className = 'mini-board';
  return top;
}

function renderRoom(): void {
  const room = state.room;
  dom.roomTitle.textContent = room?.name ?? '';
  dom.roomMeta.textContent = room ? `${String(room.online)}명 접속` : '';
  document.title = room ? `${room.name} - Chess` : 'Chess';

  board.render(view.board);
  // Moves played so far; lets automated tests wait for the server's answer.
  dom.board.dataset.ply = String(room?.game?.moves.length ?? 0);
  dom.board.dataset.status = room?.game?.status ?? 'none';

  renderSeat(dom.seatTop, view.seats.top);
  renderSeat(dom.seatBottom, view.seats.bottom);

  dom.status.textContent = errorText ?? (room ? view.status : '방에 들어가는 중…');
  dom.status.classList.toggle('error', errorText !== null);
  dom.status.classList.toggle(
    'my-turn',
    errorText === null && view.myColor !== null && view.board.movable.size > 0,
  );

  renderMoves();
  renderCaptured(dom.capturedWhite, 'w', view.captured.w);
  renderCaptured(dom.capturedBlack, 'b', view.captured.b);
  dom.online.textContent = room ? `${String(room.online)}명` : '';

  const { controls } = view;
  dom.seatTake.hidden = !room || !controls.seatTake;
  // Waiting alone at the table: the invitation is the thing to do next.
  dom.copyLink.classList.toggle('invite', controls.seatLeave && (room?.seats.length ?? 0) < 2);
  dom.seatLeave.hidden = !controls.seatLeave;
  const drawVisible = controls.draw === 'offer' || controls.draw === 'offered';
  if (
    (confirming === 'draw' && controls.draw !== 'offer') ||
    (confirming === 'resign' && !controls.resign)
  ) {
    setConfirming(null);
  }
  dom.drawOffer.hidden = !drawVisible || confirming !== null;
  dom.drawOffer.disabled = controls.draw === 'offered';
  dom.drawOfferLabel.textContent = controls.draw === 'offered' ? '무승부 제안함' : '무승부 제안';
  dom.drawAccept.hidden = controls.draw !== 'respond' || confirming !== null;
  dom.drawDecline.hidden = controls.draw !== 'respond' || confirming !== null;
  dom.resign.hidden = !controls.resign || confirming !== null;
  dom.flip.hidden = confirming !== null;
  dom.controls.classList.toggle('responding', controls.draw === 'respond');
  dom.controls.classList.toggle(
    'solo',
    [...dom.controls.children].every(
      (child) => child === dom.flip || (child as HTMLElement).hidden,
    ),
  );
  dom.confirm.hidden = confirming === null;
  if (confirming) {
    dom.confirmText.textContent =
      confirming === 'resign'
        ? '정말 기권할까요? 이 대국은 패배로 끝납니다.'
        : '상대에게 무승부를 제안할까요?';
    dom.confirmYes.textContent = confirming === 'resign' ? '기권하기' : '제안하기';
    dom.confirmYes.classList.toggle('danger', confirming === 'resign');
    dom.confirmYes.classList.toggle('primary', confirming === 'draw');
  }

  const result = view.result;
  dom.result.hidden = result === null;
  if (result) {
    dom.resultTitle.textContent = result.title;
    dom.resultReason.textContent = result.reason;
    dom.result.dataset.tone = result.tone;
  }
  // The join button sits on the free seat, or on the result plaque while it is shown,
  // so there is only ever one of it.
  const played = colorOf(room?.game ?? null, state.session?.playerId) !== null;
  if (result && controls.seatTake) {
    place(dom.resultJoin, dom.seatTake);
    dom.seatTake.textContent = played ? '한 판 더' : '참가하기';
  } else {
    place(dom.resultJoin, null);
    dom.seatTake.textContent = '참가';
  }
  renderClock();
}

function renderSeat(seat: SeatElements, model: SeatView): void {
  const player = model.player;
  seat.root.dataset.color = model.color ?? '';
  seat.root.dataset.state = player ? (player.connected ? 'seated' : 'away') : 'empty';
  seat.root.classList.toggle('is-me', player?.me ?? false);
  seat.name.textContent = player ? player.text : '빈 자리';
  // Someone sitting down (or standing up) settles into the seat.
  const who = player?.text ?? '';
  if (state.room) {
    if (
      seat.root.dataset.who !== undefined &&
      seat.root.dataset.who !== who &&
      !reducedMotion.matches
    ) {
      seat.root.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)' },
      );
    }
    seat.root.dataset.who = who;
  }
  seat.name.title = player && !player.connected ? '연결 끊김' : '';
  const tags: string[] = [];
  if (player?.me) tags.push('나');
  if (model.color) tags.push(COLOR_NAME[model.color]);
  if (player && !player.connected) tags.push('연결 끊김');
  if (!model.color && player && !model.action) tags.push('대기 중');
  seat.tag.textContent = tags.join(' · ');

  // The pieces this player has taken, and their material lead.
  const haul =
    model.color === 'w' ? dom.capturedBlack : model.color === 'b' ? dom.capturedWhite : null;
  place(seat.haul, haul);
  const lead = model.color ? view.material[model.color] : 0;
  seat.haul.dataset.lead = lead ? `+${String(lead)}` : '';

  const button =
    model.action === 'take' ? dom.seatTake : model.action === 'leave' ? dom.seatLeave : null;
  place(seat.action, button);
}

/** Makes `child` the only content of `slot`, returning what was there to the stash. */
function place(slot: HTMLElement, child: HTMLElement | null): void {
  for (const current of [...slot.children]) {
    if (current !== child) dom.stash.append(current);
  }
  if (child && child.parentElement !== slot) slot.append(child);
}

/** The move sheet: "1. e4 e5" rows, the latest move marked. */
function renderMoves(): void {
  const rows = view.moveRows;
  const list = dom.moves;
  while (list.childElementCount > rows.length) list.lastElementChild?.remove();
  rows.forEach((row, index) => {
    let item = list.children[index] as HTMLElement | undefined;
    if (!item) {
      item = document.createElement('li');
      list.append(item);
    }
    const key = moveRowText(row);
    if (item.dataset.key === key) return;
    item.dataset.key = key;
    const number = document.createElement('span');
    number.className = 'move-no';
    number.textContent = `${String(row.number)}.`;
    const white = document.createElement('span');
    white.className = 'move';
    white.textContent = row.white;
    const parts: (Node | string)[] = [number, ' ', white];
    if (row.black !== null) {
      const black = document.createElement('span');
      black.className = 'move';
      black.textContent = row.black;
      parts.push(' ', black);
    }
    item.replaceChildren(...parts);
  });
  list.querySelector('.latest')?.classList.remove('latest');
  const moves = list.querySelectorAll('.move');
  moves[moves.length - 1]?.classList.add('latest');
  const plies = state.room?.game?.moves.length ?? 0;
  dom.moveCount.textContent = plies ? `${String(plies)}수` : '';
  dom.movesEmpty.hidden = rows.length > 0;
  list.hidden = rows.length === 0;
  list.scrollTop = list.scrollHeight;
  list.scrollLeft = list.scrollWidth;
}

function renderCaptured(row: HTMLElement, color: Color, pieces: readonly string[]): void {
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

/** The clock on each seat, counting down locally between snapshots. */
function renderClock(): void {
  const clock = view.clock;
  const game = state.room?.game;
  dom.timeControl.hidden = !game;
  if (game) {
    const { initialMs, incrementMs } = game.timeControl;
    dom.timeControl.textContent = `${String(initialMs / 60_000)}분 + 수마다 ${String(incrementMs / 1000)}초`;
  }
  for (const [seat, model] of [
    [dom.seatTop, view.seats.top],
    [dom.seatBottom, view.seats.bottom],
  ] as const) {
    const node = seat.clock;
    const color = model.color;
    node.hidden = clock === null || color === null;
    seat.root.classList.toggle('running', clock?.running === color && color !== null);
    if (!clock || !color) continue;
    const stored = color === 'w' ? clock.whiteMs : clock.blackMs;
    const running = clock.running === color;
    const left = running ? stored - (performance.now() - snapshotAt) : stored;
    const text = formatClock(left);
    if (node.textContent !== text) node.textContent = text;
    node.classList.toggle('low', left <= CLOCK_WARNING_MS);
    node.setAttribute('aria-label', `${COLOR_NAME[color]} 남은 시간 ${text}`);

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
