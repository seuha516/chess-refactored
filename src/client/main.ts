import '@fontsource-variable/hahmlet/wght.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import {
  initialPosition,
  squareName,
  type Color,
  type PieceType,
  type PromotionPiece,
  type Square,
} from '../shared/chess/index.ts';
import type {
  CreateRoomResult,
  LobbySnapshot,
  MascotTug,
  RoomSnapshot,
} from '../shared/protocol.ts';
import { BoardView, pieceImage } from './board-view.ts';
import { ChatView } from './chat-view.ts';
import {
  claimSession,
  createSocket,
  request,
  saveName,
  savedName,
  saveToken,
  type RequestResult,
} from './connection.ts';
import type { SceneModel, TableStage, ViewPreset } from './scene/stage.ts';
import * as sfx from './sfx.ts';
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
  resume: element('resume', HTMLButtonElement),
  resumeTitle: element('resume-title', HTMLElement),
  resumeName: element('resume-name', HTMLElement),
  roomBar: element('room-bar', HTMLElement),
  roomTitle: element('room-title', HTMLElement),
  roomMeta: element('room-meta', HTMLElement),
  backToLobby: element('back-to-lobby', HTMLButtonElement),
  copyLink: element('copy-link', HTMLButtonElement),
  copyLinkLabel: element('copy-link-label', HTMLElement),
  copyLinkIcon: document.getElementById('copy-link-icon'),
  sound: element('sound', HTMLButtonElement),
  soundIcon: document.getElementById('sound-icon'),
  lobbyScene: element('lobby-scene', HTMLElement),
  roomView: element('room-view', HTMLElement),
  scene: element('scene', HTMLElement),
  seatTop: seatElements('seat-top'),
  seatBottom: seatElements('seat-bottom'),
  board: element('board', HTMLElement),
  stash: element('stash', HTMLElement),
  rimRanks: element('rim-ranks', HTMLElement),
  rimFiles: element('rim-files', HTMLElement),
  invite: element('invite', HTMLElement),
  inviteTitle: element('invite-title', HTMLElement),
  inviteText: element('invite-text', HTMLElement),
  inviteCopy: element('invite-copy', HTMLButtonElement),
  inviteCopyLabel: element('invite-copy-label', HTMLElement),
  inviteCopyIcon: document.getElementById('invite-copy-icon'),
  inviteSeat: element('invite-seat', HTMLElement),
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
  statusNote: element('status-note', HTMLElement),
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
  viewTools: element('view-tools', HTMLElement),
  view: element('view', HTMLButtonElement),
  viewLabel: element('view-label', HTMLElement),
  controls: element('controls', HTMLElement),
  confirm: element('confirm', HTMLElement),
  confirmText: element('confirm-text', HTMLElement),
  confirmYes: element('confirm-yes', HTMLButtonElement),
  confirmNo: element('confirm-no', HTMLButtonElement),
  leaveConfirm: element('leave-confirm', HTMLElement),
  leaveYes: element('leave-yes', HTMLButtonElement),
  leaveNo: element('leave-no', HTMLButtonElement),
  online: element('online', HTMLElement),
  chatLog: element('chat-log', HTMLElement),
  chatForm: element('chat-form', HTMLFormElement),
  chatInput: element('chat-input', HTMLInputElement),
  myName: element('my-name', HTMLElement),
  myInitial: element('my-initial', HTMLElement),
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
/**
 * Resigning, offering a draw or walking away from a game in progress waits
 * for a second, confirming press.
 */
let confirming: 'resign' | 'draw' | 'leave' | null = null;
let confirmTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * The room whose waiting seat this tab sat in. If the seat is released while
 * the connection is gone (a phone put the page to sleep while the player sent
 * the link), the tab sits down again once it is back.
 */
let seatedIn: string | null = null;
let reseatTried = false;
/** A room this tab has just created: sit down as soon as it is entered. */
let sitOnEntry: string | null = null;

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

/** The 3D table; null until it has loaded, or for good where WebGL is missing. */
let stage: TableStage | null = null;
// three.js loads after the page is usable; until it is, the board waits hidden.
void import('./scene/stage.ts')
  .then(({ createStage }) => createStage())
  .catch(() => null)
  .then((created) => {
    stage = created;
    created?.onViewChange(renderView);
    created?.onTug(sendTug);
    renderView(created?.viewPreset ?? 'default');
    document.body.dataset.scene = created ? '3d' : '2d';
    board.setPresenter(created);
    render();
  });

/** The lobby's table: a set standing ready, nobody playing. */
const LOBBY_SCENE: SceneModel = {
  board: {
    board: initialPosition().board,
    ply: 0,
    orientation: 'w',
    lastMove: null,
    check: null,
    selected: null,
    targets: new Set(),
    movable: new Set(),
  },
  gameId: null,
  status: 'none',
  outcome: null,
  captured: { w: [], b: [] },
  me: null,
  pending: false,
  resultTone: null,
};

function sceneModel(): SceneModel {
  const game = state.room?.game ?? null;
  return {
    board: view.board,
    gameId: game?.id ?? null,
    status: game?.status ?? 'none',
    outcome: game?.outcome ?? null,
    captured: view.captured,
    me: colorOf(game, state.session?.playerId),
    pending: state.pending,
    resultTone: view.result?.tone ?? null,
  };
}

function update(patch: Partial<ClientState>): void {
  state = { ...state, ...patch };
  view = buildView(state, serverNow());
  render();
}

// ----------------------------------------------------------------- routing

function navigate(next: Route): void {
  if (next.kind === 'lobby') seatedIn = null;
  route = next;
  const url =
    next.kind === 'room' ? roomUrl(next.roomId) : `${location.origin}${location.pathname}`;
  if (url !== location.href) history.pushState(null, '', url);
  enterRoute();
}

window.addEventListener('popstate', () => {
  route = routeFromUrl();
  if (route.kind === 'lobby') seatedIn = null;
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
    if (route.kind !== 'room' || route.roomId !== roomId) return;
    if (result.ok) {
      // Whoever opens a table sits down at it.
      if (sitOnEntry === roomId) {
        sitOnEntry = null;
        send('seat:take');
      }
      return;
    }
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
  reseatTried = false;
  enterRoute();
});
socket.on('disconnect', () => {
  clearTimeout(bannerTimer);
  if (idleDisconnected) return;
  bannerTimer = setTimeout(() => {
    dom.banner.textContent = '연결이 끊겼어요. 다시 연결하는 중…';
    dom.banner.hidden = false;
  }, 3000);
});
socket.on('connect_error', () => {
  dom.banner.textContent = '서버에 연결하지 못했어요. 곧 다시 시도할게요.';
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
/**
 * The viewer pulling their 몽돌이, passed on to the room: about eight times a
 * second while pulling (the other screens smooth between), always the release.
 */
const TUG_INTERVAL_MS = 120;
let lastTugAt = 0;
let queuedTug: MascotTug | null = null;
let tugTimer: ReturnType<typeof setTimeout> | undefined;
function emitTug(tug: MascotTug): void {
  lastTugAt = performance.now();
  if (socket.connected) socket.volatile.emit('mascot:tug', tug);
}
function sendTug(_color: Color, tug: MascotTug): void {
  clearTimeout(tugTimer);
  const wait = TUG_INTERVAL_MS - (performance.now() - lastTugAt);
  if (tug.release || wait <= 0) {
    queuedTug = null;
    emitTug(tug);
    return;
  }
  // Too soon: the latest pull goes out when the interval is up, never lost.
  queuedTug = tug;
  tugTimer = setTimeout(() => {
    if (queuedTug) emitTug(queuedTug);
    queuedTug = null;
  }, wait);
}
socket.on('mascot', ({ playerId, ...tug }) => {
  if (playerId === state.session?.playerId) return;
  // Only a player's own pebble moves for them.
  const color = colorOf(state.room?.game ?? null, playerId);
  if (color) stage?.remoteTug(color, tug);
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
  keepSeat(room);
});

function keepSeat(room: RoomSnapshot): void {
  const me = state.session?.playerId;
  const playing = room.game?.status === 'playing';
  if (room.seats.some((seat) => seat.id === me)) {
    seatedIn = room.id;
  } else if (seatedIn === room.id && !playing && room.seats.length < 2 && !reseatTried) {
    // Released while this tab was away: sit down again, once per connection.
    reseatTried = true;
    send('seat:take');
  } else if (playing) {
    seatedIn = null;
  }
}

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
      // A player, or someone waiting at the table for a friend, stays connected.
      const playing = state.room?.game?.status === 'playing' && view.myColor !== null;
      if (playing || view.controls.seatLeave || !socket.connected) return;
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
  if (stage) stage.playLocal(from, to, promotion);
  else sfx.placeSound(first.piece);
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
      if ('roomId' in result) {
        sitOnEntry = result.roomId;
        navigate({ kind: 'room', roomId: result.roomId });
      }
    },
  );
});

dom.roomList.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-room]') : null;
  const roomId = target?.getAttribute('data-room');
  if (roomId) navigate({ kind: 'room', roomId });
});

dom.resume.addEventListener('click', () => {
  const roomId = dom.resume.dataset.room;
  if (roomId) navigate({ kind: 'room', roomId });
});

dom.backToLobby.addEventListener('click', () => {
  // Leaving a game in progress starts the disconnection countdown: ask first.
  // The question opens right under the button that was pressed.
  if (view.myColor !== null && state.room?.game?.status === 'playing') {
    setConfirming('leave');
    render();
    dom.leaveYes.focus();
    return;
  }
  navigate({ kind: 'lobby' });
});

/**
 * Hands the invitation link over: the share sheet on phones (straight into a
 * messenger), the clipboard elsewhere.
 */
async function shareInvite(): Promise<'shared' | 'copied' | 'failed' | 'cancelled'> {
  if (route.kind !== 'room') return 'failed';
  const url = roomUrl(route.roomId);
  if (coarsePointer.matches && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: state.room?.name ?? 'Chess', text: '체스 한 판 둬요', url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

const coarsePointer = window.matchMedia('(pointer: coarse)');
const COPY_LABEL = '초대 링크 복사';
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
function onInvite(button: HTMLButtonElement, label: HTMLElement, icon: Element | null): void {
  void shareInvite().then((outcome) => {
    if (outcome === 'cancelled') return;
    if (outcome === 'failed') {
      errorText = '링크를 복사하지 못했어요. 주소창의 주소를 보내 주세요.';
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => {
        errorText = null;
        render();
      }, 5000);
      render();
      return;
    }
    label.textContent = outcome === 'shared' ? '보냈어요' : '복사했어요';
    icon?.setAttribute('href', '#i-check');
    button.classList.add('done');
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      for (const [b, l, i] of [
        [dom.copyLink, dom.copyLinkLabel, dom.copyLinkIcon],
        [dom.inviteCopy, dom.inviteCopyLabel, dom.inviteCopyIcon],
      ] as const) {
        l.textContent = COPY_LABEL;
        i?.setAttribute('href', '#i-link');
        b.classList.remove('done');
      }
    }, 2200);
  });
}
dom.copyLink.addEventListener('click', () => {
  onInvite(dom.copyLink, dom.copyLinkLabel, dom.copyLinkIcon);
});
dom.inviteCopy.addEventListener('click', () => {
  onInvite(dom.inviteCopy, dom.inviteCopyLabel, dom.inviteCopyIcon);
});

function renderSound(): void {
  const on = sfx.soundEnabled();
  dom.sound.setAttribute('aria-pressed', String(on));
  dom.sound.title = on ? '효과음 끄기' : '효과음 켜기';
  dom.soundIcon?.setAttribute('href', on ? '#i-sound' : '#i-mute');
}
dom.sound.addEventListener('click', () => {
  sfx.setSoundEnabled(!sfx.soundEnabled());
  renderSound();
  if (sfx.soundEnabled()) sfx.placeSound('n', 0.2);
});
renderSound();

dom.seatTake.addEventListener('click', () => {
  send('seat:take');
});
dom.seatLeave.addEventListener('click', () => {
  seatedIn = null;
  send('seat:leave');
});
dom.drawAccept.addEventListener('click', () => {
  send('game:accept-draw');
});
dom.drawDecline.addEventListener('click', () => {
  send('game:decline-draw');
});

/**
 * Resigning and offering a draw take a second press on the confirm bar;
 * leaving a game, on the question under the back button.
 */
function setConfirming(next: typeof confirming): void {
  confirming = next;
  clearTimeout(confirmTimer);
  if (next) {
    confirmTimer = setTimeout(
      () => {
        setConfirming(null);
        render();
      },
      next === 'leave' ? CONFIRM_TIMEOUT_MS * 2 : CONFIRM_TIMEOUT_MS,
    );
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
  if (action === 'resign') dom.resign.focus({ preventScroll: true });
  if (action === 'draw') dom.drawOffer.focus({ preventScroll: true });
});
dom.confirm.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') dom.confirmNo.click();
});

dom.leaveYes.addEventListener('click', () => {
  setConfirming(null);
  navigate({ kind: 'lobby' });
});
dom.leaveNo.addEventListener('click', () => {
  setConfirming(null);
  render();
  dom.backToLobby.focus();
});
dom.leaveConfirm.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') dom.leaveNo.click();
});
// A press anywhere else means staying.
document.addEventListener('pointerdown', (event) => {
  if (confirming !== 'leave' || !(event.target instanceof Node)) return;
  if (dom.leaveConfirm.contains(event.target) || dom.backToLobby.contains(event.target)) return;
  setConfirming(null);
  render();
});

dom.flip.addEventListener('click', () => {
  sfx.flipSound(stage && !reducedMotion.matches ? 1.1 : 0.45);
  update({ flipped: !state.flipped });
});

/** The camera angles the view button steps through; a dragged angle goes back to the first. */
const VIEW_ORDER: readonly ViewPreset[] = ['default', 'above', 'low'];
const VIEW_NAME: Record<ViewPreset, string> = {
  default: '기본 시점',
  above: '위에서 보기',
  low: '낮게 보기',
};
function renderView(preset: ViewPreset | null): void {
  dom.viewLabel.textContent = preset ? VIEW_NAME[preset] : '내 시점';
}
dom.view.addEventListener('click', () => {
  if (!stage) return;
  const current = stage.viewPreset;
  const next = current ? VIEW_ORDER[(VIEW_ORDER.indexOf(current) + 1) % VIEW_ORDER.length] : null;
  stage.setView(next ?? 'default');
  sfx.flipSound(0.5);
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
  dom.nameDialogTitle.textContent = firstVisit ? '어떤 이름으로 둘까요?' : '이름 바꾸기';
  dom.nameOk.textContent = firstVisit ? '시작하기' : '바꾸기';
  dom.nameCancel.textContent = firstVisit ? '이름 없이 시작' : '취소';
  dom.nameInput.value = state.session?.name ?? savedName() ?? '';
  dom.nameDialog.returnValue = '';
  dom.nameDialog.showModal();
  dom.nameInput.select();
}

dom.rename.addEventListener('click', openNameDialog);
dom.nameCancel.addEventListener('click', () => {
  dom.nameDialog.close('cancel');
});
dom.nameDialog.addEventListener('close', () => {
  const name = dom.nameDialog.returnValue === 'ok' ? dom.nameInput.value.trim() : '';
  if (!state.session) {
    // First visit: like the original, ask for the name before joining.
    // Without a name the server assigns an anonymous one.
    if (name) saveName(name);
    socket.connect();
    return;
  }
  if (!name || name === state.session.name) return;
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
  dom.copyLink.hidden = !inRoom;
  if (stage) {
    if (inRoom) stage.mount(dom.scene, 'room', dom.board);
    else stage.mount(dom.lobbyScene, 'lobby', null);
  }
  const name = state.session?.name ?? '';
  dom.myName.textContent = name;
  dom.myInitial.textContent = firstLetter(name);
  dom.rename.hidden = !state.session;
  if (inRoom) renderRoom();
  else renderLobby();
}

const graphemes = new Intl.Segmenter();
const firstLetter = (name: string): string =>
  (graphemes.segment(name)[Symbol.iterator]().next().value?.segment ?? '').toUpperCase();

function renderLobby(): void {
  document.title = 'Chess';
  dom.lobbyStatus.textContent = errorText ?? (lobby ? '' : '방 목록을 불러오는 중…');
  dom.lobbyStatus.hidden = !dom.lobbyStatus.textContent;
  dom.lobbyStatus.classList.toggle('error', errorText !== null);
  dom.roomName.placeholder = state.session ? `${state.session.name}님의 방` : '방 이름';
  const rows = lobby ? lobbyRows(lobby, state.session?.playerId) : [];

  // A game (or a seat) this visitor walked away from comes first.
  const mine = rows.find((row) => row.mine && row.playing) ?? rows.find((row) => row.mine);
  dom.resume.hidden = !mine;
  if (mine) {
    dom.resume.dataset.room = mine.id;
    dom.resume.classList.toggle('playing', mine.playing);
    dom.resumeTitle.textContent = mine.playing ? '진행 중인 내 대국' : '내가 앉아 있는 방';
    dom.resumeName.textContent = mine.playing
      ? `${mine.name} · 1분 안에 돌아가지 않으면 기권패예요`
      : mine.name;
  }

  dom.lobbyEmpty.hidden = !lobby || rows.length > 0;
  dom.roomCount.textContent = rows.length ? `${String(rows.length)}개` : '';
  dom.roomList.replaceChildren(...rows.map(lobbyTable));
  stage?.sync(LOBBY_SCENE);
}

/** A room in the lobby: a small table seen from above, its name, who sits there. */
function lobbyTable(row: LobbyRow): HTMLElement {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `room-item${row.playing ? ' playing' : ''}${row.mine ? ' mine' : ''}`;
  button.dataset.room = row.id;

  const mini = document.createElement('span');
  mini.className = 'mini-table';
  mini.setAttribute('aria-hidden', 'true');
  const [far, near] = row.seats;
  mini.append(miniSeat(far), miniBoard(), miniSeat(near));

  const name = document.createElement('span');
  name.className = 'room-item-name';
  name.textContent = row.name;
  const status = document.createElement('span');
  status.className = 'room-item-status';
  status.textContent = row.status;
  const meta = document.createElement('span');
  meta.className = 'room-item-meta';
  meta.append(status);
  const seated = row.seats.filter((seat): seat is string => seat !== null);
  if (seated.length) {
    const players = document.createElement('span');
    players.className = 'room-item-players';
    players.textContent = row.playing ? seated.join(' 대 ') : seated.join(', ');
    meta.append(players);
  }
  if (row.mine) {
    const tag = document.createElement('span');
    tag.className = 'room-item-mine';
    tag.textContent = '내 자리';
    meta.append(tag);
  }
  const text = document.createElement('span');
  text.className = 'room-item-text';
  text.append(name, meta);

  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('class', 'icon room-item-go');
  arrow.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-arrow');
  arrow.append(use);

  button.append(mini, text, arrow);
  item.append(button);
  return item;
}

function miniSeat(name: string | null): HTMLElement {
  const seat = document.createElement('span');
  seat.className = name ? 'mini-seat taken' : 'mini-seat';
  return seat;
}

function miniBoard(): HTMLElement {
  const top = document.createElement('span');
  top.className = 'mini-board';
  return top;
}

const CONFIRM = {
  resign: { text: '기권하면 이 대국은 패배로 끝나요.', yes: '기권', no: '계속 두기' },
  draw: { text: '상대에게 무승부를 제안할까요?', yes: '제안하기', no: '취소' },
} as const;

function renderRoom(): void {
  const room = state.room;
  dom.roomTitle.textContent = room?.name ?? '';
  dom.roomMeta.textContent = room ? `${String(room.online)}명 접속 중` : '';
  const myTurn = view.myColor !== null && view.board.movable.size > 0;
  // The tab title tells a player in another tab that it is their move.
  document.title = room ? `${myTurn ? '● 내 차례 · ' : ''}${room.name} - Chess` : 'Chess';

  board.render(view.board);
  stage?.sync(sceneModel());
  // Moves played so far; lets automated tests wait for the server's answer.
  dom.board.dataset.ply = String(room?.game?.moves.length ?? 0);
  dom.board.dataset.status = room?.game?.status ?? 'none';

  renderSeat(dom.seatTop, view.seats.top);
  renderSeat(dom.seatBottom, view.seats.bottom);

  dom.status.textContent = errorText ?? (room ? view.status : '방에 들어가는 중…');
  dom.status.classList.toggle('error', errorText !== null);
  dom.status.classList.toggle('my-turn', errorText === null && myTurn);
  // One line per matter; rebuilt only when the text changes (it is a live region).
  const notesKey = view.notes.join('\n');
  if (dom.statusNote.dataset.key !== notesKey) {
    dom.statusNote.dataset.key = notesKey;
    dom.statusNote.replaceChildren(
      ...view.notes.map((line) => {
        const span = document.createElement('span');
        span.textContent = line;
        return span;
      }),
    );
  }
  dom.statusNote.hidden = view.notes.length === 0;

  renderMoves();
  renderCaptured(dom.capturedWhite, 'w', view.captured.w);
  renderCaptured(dom.capturedBlack, 'b', view.captured.b);
  dom.online.textContent = room ? `${String(room.online)}명` : '';

  const { controls } = view;
  dom.seatTake.hidden = !room || !controls.seatTake;
  dom.seatLeave.hidden = !controls.seatLeave;
  const drawVisible = controls.draw === 'offer' || controls.draw === 'offered';
  if (
    (confirming === 'draw' && controls.draw !== 'offer') ||
    ((confirming === 'resign' || confirming === 'leave') && !controls.resign)
  ) {
    setConfirming(null);
  }
  // Leaving asks under the back button; the rest asks here, in place of the controls.
  const asking = confirming === 'leave' ? null : confirming;
  dom.leaveConfirm.hidden = confirming !== 'leave';
  dom.backToLobby.setAttribute('aria-expanded', String(confirming === 'leave'));
  dom.drawOffer.hidden = !drawVisible || asking !== null;
  dom.drawOffer.disabled = controls.draw === 'offered';
  dom.drawOfferLabel.textContent = controls.draw === 'offered' ? '무승부 제안함' : '무승부 제안';
  dom.drawAccept.hidden = controls.draw !== 'respond' || asking !== null;
  dom.drawDecline.hidden = controls.draw !== 'respond' || asking !== null;
  dom.resign.hidden = !controls.resign || asking !== null;
  dom.viewTools.hidden = asking !== null;
  dom.controls.classList.toggle('responding', controls.draw === 'respond');
  dom.confirm.hidden = asking === null;
  if (asking) {
    const copy = CONFIRM[asking];
    dom.confirmText.textContent = copy.text;
    dom.confirmYes.textContent = copy.yes;
    dom.confirmNo.textContent = copy.no;
    dom.confirmYes.classList.toggle('danger', asking === 'resign');
    dom.confirmYes.classList.toggle('primary', asking === 'draw');
  }

  const result = view.result;
  dom.result.hidden = result === null;
  if (result) {
    dom.resultTitle.textContent = result.title;
    dom.resultReason.textContent = result.reason;
    dom.result.dataset.tone = result.tone;
    dom.result.dataset.reason = room?.game?.outcome?.reason ?? '';
  }

  // Before a game the table itself says what to do next, with the button for it.
  const invitation = view.invitation;
  dom.invite.hidden = invitation === null;
  if (invitation) {
    dom.invite.dataset.kind = invitation.kind;
    dom.inviteTitle.textContent = invitation.title;
    dom.inviteText.textContent = invitation.text;
    dom.inviteCopy.hidden = invitation.kind !== 'waiting';
  }
  // The join and leave buttons live on the band across the table (or on the
  // result plaque while it is shown), so there is only ever one of each.
  const played = colorOf(room?.game ?? null, state.session?.playerId) !== null;
  if (result && controls.seatTake) {
    place(dom.inviteSeat, null);
    place(dom.resultJoin, dom.seatTake);
    dom.seatTake.textContent = played ? '한 판 더' : '다음 판에 앉기';
  } else {
    place(dom.resultJoin, null);
    const seatButton = controls.seatTake ? dom.seatTake : controls.seatLeave ? dom.seatLeave : null;
    place(dom.inviteSeat, invitation ? seatButton : null);
    dom.seatTake.textContent = invitation?.kind === 'join' ? '앉아서 시작하기' : '자리에 앉기';
  }
  renderClock();
}

function renderSeat(seat: SeatElements, model: SeatView): void {
  const player = model.player;
  seat.root.dataset.color = model.color ?? '';
  seat.root.dataset.state = player ? (player.connected ? 'seated' : 'away') : 'empty';
  seat.root.classList.toggle('is-me', player?.me ?? false);
  seat.name.textContent = player ? player.text : '빈자리';
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
  const tags: string[] = [];
  if (player?.me) tags.push('나');
  if (model.color) tags.push(COLOR_NAME[model.color]);
  if (player && player.forfeitInMs !== null) {
    tags.push(`연결 끊김 ${String(Math.ceil(player.forfeitInMs / 1000))}초`);
  } else if (player && !player.connected) {
    tags.push('연결 끊김');
  }
  if (!model.color && player) tags.push('대기 중');
  seat.tag.textContent = tags.join(' · ');

  // The pieces this player has taken, and their material lead.
  const haul =
    model.color === 'w' ? dom.capturedBlack : model.color === 'b' ? dom.capturedWhite : null;
  place(seat.haul, haul);
  const lead = model.color ? view.material[model.color] : 0;
  seat.haul.dataset.lead = lead ? `+${String(lead)}` : '';
  seat.haul.title = lead ? `기물 점수 ${String(lead)}점 앞섬` : '';
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

/** Taken pieces, the same kind stacked together: ♟♟ ♞ ♜. */
function renderCaptured(row: HTMLElement, color: Color, pieces: readonly string[]): void {
  const key = pieces.join('');
  if (row.dataset.key === key) return;
  row.dataset.key = key;
  row.dataset.color = color;
  const groups: HTMLElement[] = [];
  for (const [index, type] of pieces.entries()) {
    if (type !== pieces[index - 1]) {
      const group = document.createElement('span');
      group.className = 'haul-group';
      groups.push(group);
    }
    const image = document.createElement('img');
    image.src = pieceImage({ color, type: type as 'p' });
    image.alt = PIECE_NAME[type as 'p'];
    groups.at(-1)?.append(image);
  }
  row.replaceChildren(...groups);
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

    // The player's own clock: a tick at 30 seconds, then every second of the last ten.
    if (running && view.myColor === color && left > 0) {
      const second = Math.ceil(left / 1000);
      const key = `${String(game?.id)}:${color}:${String(second)}`;
      const due = second === CLOCK_WARNING_MS / 1000 || second <= 10;
      if (due && left <= CLOCK_WARNING_MS && clockWarnedFor !== key) {
        clockWarnedFor = key;
        sfx.tickSound();
      }
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

/**
 * Sounds of what happens in the room. The 3D table voices the moves itself,
 * in time with what it shows; without it they play here.
 */
function playSounds(previous: RoomSnapshot | null, next: RoomSnapshot): void {
  // The first snapshot after entering a room is not an event to announce.
  if (!previous) return;
  const before = previous.game;
  const after = next.game;
  if (next.seats.length > previous.seats.length && !after) sfx.chimeSound();
  if (!after) return;
  if (after.drawOffer && after.drawOffer !== before?.drawOffer) sfx.chimeSound();
  if (after.id !== before?.id && after.status === 'playing') {
    // The clock is pressed and the bell rings once the pieces are home.
    sfx.startSound(stage ? 0.5 : 0.7);
    if (colorOf(after, state.session?.playerId)) sfx.buzz(40);
  }
  if (stage) return;
  if (after.id !== before?.id) {
    if (after.status === 'playing') sfx.setupSound(16, 0.6);
    return;
  }
  if (after.moves.length > before.moves.length) {
    const last = after.moves.at(-1);
    if (last) {
      const mover = last.san.charAt(0);
      const piece: PieceType = 'NBRQK'.includes(mover) ? (mover.toLowerCase() as PieceType) : 'p';
      if (last.san.endsWith('#')) sfx.mateSound();
      else if (last.captured) sfx.captureSound(3);
      else if (last.color !== colorOf(after, state.session?.playerId)) sfx.placeSound(piece);
      if (last.san.endsWith('+')) sfx.checkSound();
    }
  }
  if (after.status === 'finished' && before.status === 'playing' && view.result) {
    sfx.endSound(view.result.tone);
  }
}

render();
// Pick this tab's session (its own, or one a closed tab left behind) before connecting.
void claimSession().then(() => {
  if (savedName() === null) openNameDialog();
  else socket.connect();
});
