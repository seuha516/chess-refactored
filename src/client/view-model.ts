// Pure derivation of everything the page shows from the latest server
// snapshot plus local UI state. No DOM access, so it is unit-tested directly.
import {
  findKing,
  initialPosition,
  isInCheck,
  legalMoves,
  opposite,
  parseFen,
  parseSquare,
  type Board,
  type Color,
  type Move,
  type PieceType,
  type Position,
  type Square,
} from '../shared/chess/index.ts';
import { flagTime } from '../shared/clock.ts';
import {
  DISCONNECT_FORFEIT_MS,
  type GameSnapshot,
  type LobbySnapshot,
  type PlayerInfo,
  type RoomSnapshot,
  type SessionInfo,
} from '../shared/protocol.ts';
import { COLOR_NAME, END_REASON } from './text.ts';

export interface BoardModel {
  readonly board: Board;
  /** Moves played so far. */
  readonly ply: number;
  /** Colour shown at the bottom. */
  readonly orientation: Color;
  readonly lastMove: { readonly from: Square; readonly to: Square } | null;
  /** King in check, highlighted in red. */
  readonly check: Square | null;
  readonly selected: Square | null;
  /** Legal destinations of the selected piece. */
  readonly targets: ReadonlySet<Square>;
  /** Squares whose piece the user may move now. */
  readonly movable: ReadonlySet<Square>;
}

export interface ClientState {
  readonly session: SessionInfo | null;
  readonly room: RoomSnapshot | null;
  readonly selected: Square | null;
  /** A move request is waiting for the server's answer. */
  readonly pending: boolean;
  /** Show the board from black's side (spectators can flip). */
  readonly flipped: boolean;
  /** Id of the finished game whose result banner was closed. */
  readonly dismissedResult: string | null;
}

export interface PlayerLabel {
  readonly text: string;
  readonly connected: boolean;
  readonly me: boolean;
}

export type DrawControl = 'hidden' | 'offer' | 'offered' | 'respond';

/** One edge of the table: who sits there and what can be done with the seat. */
export interface SeatView {
  readonly player: PlayerLabel | null;
  /** Piece colour while a game is played; null for a waiting seat. */
  readonly color: Color | null;
  /** The join or leave button belongs to this seat. */
  readonly action: 'take' | 'leave' | null;
}

export interface MoveRow {
  readonly number: number;
  readonly white: string;
  readonly black: string | null;
}

export interface ViewModel {
  readonly myColor: Color | null;
  readonly board: BoardModel;
  /** The far edge of the table and the near one (the viewer's side). */
  readonly seats: { readonly top: SeatView; readonly bottom: SeatView };
  readonly status: string;
  readonly moveRows: readonly MoveRow[];
  /** Pieces of each colour that have been captured, in the original display order. */
  readonly captured: Readonly<Record<Color, readonly PieceType[]>>;
  /** Material lead of each colour, in pawns (0 for the side that is level or behind). */
  readonly material: Readonly<Record<Color, number>>;
  readonly controls: {
    readonly seatTake: boolean;
    readonly seatLeave: boolean;
    readonly draw: DrawControl;
    readonly resign: boolean;
  };
  /** Both clocks while a game is played, as of the snapshot; `running` is ticking. */
  readonly clock: {
    readonly whiteMs: number;
    readonly blackMs: number;
    readonly running: Color | null;
  } | null;
  readonly result: {
    readonly title: string;
    readonly reason: string;
    readonly tone: 'win' | 'loss' | 'draw' | 'neutral';
  } | null;
  readonly legalMoves: readonly Move[];
  /**
   * Server time at which a time rule (flag fall, disconnection forfeit) is
   * due. When it passes, the client asks the server to apply it.
   */
  readonly syncAt: number | null;
}

const CAPTURE_ORDER: readonly PieceType[] = ['p', 'n', 'b', 'r', 'q'];

export function colorOf(game: GameSnapshot | null, playerId: string | undefined): Color | null {
  if (!game || !playerId) return null;
  if (game.white.id === playerId) return 'w';
  if (game.black.id === playerId) return 'b';
  return null;
}

const playerLabel = (player: PlayerInfo, me: string | undefined): PlayerLabel => ({
  text: player.name,
  connected: player.connected,
  me: player.id === me,
});

/** During a game each player sits on their colour's side of the board. */
function gameSeats(
  game: GameSnapshot,
  me: string | undefined,
  orientation: Color,
): ViewModel['seats'] {
  const seat = (color: Color): SeatView => ({
    player: playerLabel(color === 'w' ? game.white : game.black, me),
    color,
    action: null,
  });
  return { top: seat(opposite(orientation)), bottom: seat(orientation) };
}

/**
 * Before a game the viewer's own seat is the near edge. A viewer who is not
 * seated finds the free seat there, facing them, with the join button on it.
 */
function waitingSeats(
  seats: readonly PlayerInfo[],
  me: string | undefined,
  seatTake: boolean,
  flipped: boolean,
): ViewModel['seats'] {
  const mine = seats.find((seat) => seat.id === me);
  const others = seats.filter((seat) => seat !== mine);
  const seat = (player: PlayerInfo | undefined, action: SeatView['action']): SeatView => ({
    player: player ? playerLabel(player, me) : null,
    color: null,
    action,
  });
  const near = mine
    ? seat(mine, 'leave')
    : seatTake
      ? seat(undefined, 'take')
      : seat(others.shift(), null);
  const far = seat(others[0], null);
  return flipped ? { top: near, bottom: far } : { top: far, bottom: near };
}

/**
 * @param serverNow the current server time, estimated from the snapshot time
 *   and the local time elapsed since it arrived
 */
export function buildView(state: ClientState, serverNow: number = state.room?.at ?? 0): ViewModel {
  const me = state.session?.playerId;
  const room = state.room;
  const game = room?.game ?? null;
  const playing = game?.status === 'playing';
  const myColor = playing ? colorOf(game, me) : null;
  const position: Position = game ? parseFen(game.fen) : initialPosition();

  const interactive = playing && myColor === position.turn && !state.pending;
  const moves = interactive ? legalMoves(position) : [];
  const selected = state.selected;
  const targets = new Set(moves.filter((move) => move.from === selected).map((move) => move.to));
  const movable = new Set(moves.map((move) => move.from));
  const lastUci = game?.moves.at(-1)?.uci;
  const lastMove = lastUci ? parseUci(lastUci) : null;

  const seatedMe = room?.seats.some((seat) => seat.id === me) ?? false;
  const seatTake = !playing && !seatedMe && (room?.seats.length ?? 0) < 2;

  // Players see their own colour at the bottom, spectators white; "flip" inverts it.
  const baseOrientation: Color = colorOf(game, me) ?? 'w';
  const orientation = state.flipped ? opposite(baseOrientation) : baseOrientation;
  const lost = captured(game);
  const result = resultBanner(state, game, me);

  return {
    myColor,
    board: {
      board: position.board,
      ply: game?.moves.length ?? 0,
      orientation,
      lastMove,
      check: game && isInCheck(position) ? findKing(position.board, position.turn) : null,
      selected: selected !== null && movable.has(selected) ? selected : null,
      targets,
      movable,
    },
    seats: playing
      ? gameSeats(game, me, orientation)
      : waitingSeats(room?.seats ?? [], me, seatTake, state.flipped),
    status: statusText(state, game, myColor, position, seatedMe, serverNow, result),
    moveRows: moveRows(game),
    captured: lost,
    material: material(lost),
    controls: {
      seatTake,
      seatLeave: !playing && seatedMe,
      draw: drawControl(game, myColor),
      resign: myColor !== null,
    },
    clock: playing ? game.clock : null,
    result,
    legalMoves: moves,
    syncAt: playing && room ? syncTime(game, room.at) : null,
  };
}

/** The earliest pending time rule of a running game, in server time. */
function syncTime(game: GameSnapshot, snapshotAt: number): number | null {
  const times: number[] = [];
  const { running, whiteMs, blackMs } = game.clock;
  if (running) {
    const flag = flagTime({
      remainingMs: { w: whiteMs, b: blackMs },
      running,
      startedAt: snapshotAt,
    });
    if (flag !== null) times.push(flag);
  }
  for (const player of [game.white, game.black]) {
    if (player.disconnectedAt !== null) times.push(player.disconnectedAt + DISCONNECT_FORFEIT_MS);
  }
  return times.length ? Math.min(...times) : null;
}

function parseUci(uci: string): { from: Square; to: Square } | null {
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  return from === null || to === null ? null : { from, to };
}

function statusText(
  state: ClientState,
  game: GameSnapshot | null,
  myColor: Color | null,
  position: Position,
  seatedMe: boolean,
  serverNow: number,
  result: ViewModel['result'],
): string {
  if (!state.room) return '서버에 연결하는 중…';
  if (!game || game.status === 'finished') {
    const seats = state.room.seats.length;
    if (seatedMe) return `상대를 기다리는 중입니다. (${String(seats)}/2)`;
    // While the result is shown, the referee line leads with it.
    if (result)
      return `${result.reason} ${result.title}. 다시 두려면 참가하세요. (${String(seats)}/2)`;
    return `참가 버튼을 눌러 대국에 참가하세요. (${String(seats)}/2)`;
  }
  const mover = position.turn === 'w' ? game.white : game.black;
  const parts: string[] = [];
  if (myColor === position.turn) parts.push('당신의 차례입니다.');
  else parts.push(`${mover.name}(${COLOR_NAME[position.turn]})의 차례입니다.`);
  if (isInCheck(position)) parts.push('체크!');
  if (game.drawOffer && myColor && game.drawOffer !== myColor) {
    parts.push('상대가 무승부를 제안했습니다.');
  } else if (game.drawOffer) {
    parts.push(`${COLOR_NAME[game.drawOffer]}이 무승부를 제안했습니다.`);
  }
  for (const player of [game.white, game.black]) {
    if (player.disconnectedAt === null) continue;
    const left = Math.max(
      0,
      Math.ceil((player.disconnectedAt + DISCONNECT_FORFEIT_MS - serverNow) / 1000),
    );
    parts.push(
      `${player.name}님의 연결이 끊겼습니다. ${String(left)}초 안에 돌아오지 않으면 기권패로 처리됩니다.`,
    );
  }
  return parts.join(' ');
}

function moveRows(game: GameSnapshot | null): MoveRow[] {
  const rows: MoveRow[] = [];
  const moves = game?.moves ?? [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ number: i / 2 + 1, white: moves[i]?.san ?? '', black: moves[i + 1]?.san ?? null });
  }
  return rows;
}

/** A move row as text, e.g. "1. e4 e5". */
export const moveRowText = (row: MoveRow): string =>
  `${String(row.number)}. ${row.white}${row.black ? ` ${row.black}` : ''}`;

const PIECE_VALUE: Readonly<Record<PieceType, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function material(lost: Record<Color, PieceType[]>): Record<Color, number> {
  const total = (pieces: PieceType[]) => pieces.reduce((sum, type) => sum + PIECE_VALUE[type], 0);
  const whiteLead = total(lost.b) - total(lost.w);
  return { w: Math.max(0, whiteLead), b: Math.max(0, -whiteLead) };
}

function captured(game: GameSnapshot | null): Record<Color, PieceType[]> {
  const result: Record<Color, PieceType[]> = { w: [], b: [] };
  for (const move of game?.moves ?? []) {
    if (move.captured) result[opposite(move.color)].push(move.captured as PieceType);
  }
  for (const list of Object.values(result)) {
    list.sort((a, b) => CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b));
  }
  return result;
}

function drawControl(game: GameSnapshot | null, myColor: Color | null): DrawControl {
  if (!game || !myColor) return 'hidden';
  if (game.drawOffer === myColor) return 'offered';
  if (game.drawOffer === opposite(myColor)) return 'respond';
  return 'offer';
}

function resultBanner(
  state: ClientState,
  game: GameSnapshot | null,
  me: string | undefined,
): ViewModel['result'] {
  if (!game?.outcome || state.dismissedResult === game.id) return null;
  const { winner, reason } = game.outcome;
  const reasonText = END_REASON[reason];
  const participant = colorOf(game, me);
  if (winner === null) return { title: '무승부', reason: reasonText, tone: 'draw' };
  if (participant === null) {
    return { title: `${COLOR_NAME[winner]} 승리`, reason: reasonText, tone: 'neutral' };
  }
  return participant === winner
    ? { title: '승리', reason: reasonText, tone: 'win' }
    : { title: '패배', reason: reasonText, tone: 'loss' };
}

/**
 * "m:ss", with tenths below 10 seconds ("0:09.4"). Rounds up so the clock
 * reads zero only when the time has really run out.
 */
export function formatClock(ms: number): string {
  const tenths = Math.ceil(Math.max(0, ms) / 100);
  if (tenths < 100) return `0:0${String(Math.floor(tenths / 10))}.${String(tenths % 10)}`;
  const seconds = Math.ceil(tenths / 10);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

export interface LobbyRow {
  readonly id: string;
  readonly name: string;
  readonly playing: boolean;
  /** "대국 중" or "대기 중 (1/2)". */
  readonly status: string;
  /** Who sits at the far and the near edge of the table (white is near while playing). */
  readonly seats: readonly [string | null, string | null];
}

/** One table per room for the lobby. */
export function lobbyRows(lobby: LobbySnapshot): LobbyRow[] {
  return lobby.rooms.map((room) => {
    const [first = null, second = null] = room.players;
    const playing = room.status === 'playing';
    return {
      id: room.id,
      name: room.name,
      playing,
      status: playing ? '대국 중' : `대기 중 (${String(room.players.length)}/2)`,
      seats: [second, first],
    };
  });
}
