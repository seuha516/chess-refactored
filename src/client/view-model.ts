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
import type { GameSnapshot, PlayerInfo, RoomSnapshot, SessionInfo } from '../shared/protocol.ts';
import { COLOR_NAME, END_REASON } from './text.ts';

export interface BoardModel {
  readonly board: Board;
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
  readonly dismissedResult: number | null;
}

export interface PlayerLabel {
  readonly text: string;
  readonly connected: boolean;
  readonly me: boolean;
}

export type DrawControl = 'hidden' | 'offer' | 'offered' | 'respond';

export interface ViewModel {
  readonly myColor: Color | null;
  readonly board: BoardModel;
  readonly players: readonly [PlayerLabel | null, PlayerLabel | null];
  readonly status: string;
  readonly moveRows: readonly string[];
  /** Pieces of each colour that have been captured, in the original display order. */
  readonly captured: Readonly<Record<Color, readonly PieceType[]>>;
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
}

const CAPTURE_ORDER: readonly PieceType[] = ['p', 'n', 'b', 'r', 'q'];

export function colorOf(game: GameSnapshot | null, playerId: string | undefined): Color | null {
  if (!game || !playerId) return null;
  if (game.white.id === playerId) return 'w';
  if (game.black.id === playerId) return 'b';
  return null;
}

const playerLabel = (player: PlayerInfo, me: string | undefined, suffix = ''): PlayerLabel => ({
  text: `${player.name}${suffix}`,
  connected: player.connected,
  me: player.id === me,
});

export function buildView(state: ClientState): ViewModel {
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
  const players: [PlayerLabel | null, PlayerLabel | null] = playing
    ? [playerLabel(game.white, me, '(백)'), playerLabel(game.black, me, '(흑)')]
    : [
        room?.seats[0] ? playerLabel(room.seats[0], me) : null,
        room?.seats[1] ? playerLabel(room.seats[1], me) : null,
      ];

  // Players see their own colour at the bottom, spectators white; "flip" inverts it.
  const baseOrientation: Color = colorOf(game, me) ?? 'w';

  return {
    myColor,
    board: {
      board: position.board,
      orientation: state.flipped ? opposite(baseOrientation) : baseOrientation,
      lastMove,
      check: game && isInCheck(position) ? findKing(position.board, position.turn) : null,
      selected: selected !== null && movable.has(selected) ? selected : null,
      targets,
      movable,
    },
    players,
    status: statusText(state, game, myColor, position, seatedMe),
    moveRows: moveRows(game),
    captured: captured(game),
    controls: {
      seatTake: !playing && !seatedMe && (room?.seats.length ?? 0) < 2,
      seatLeave: !playing && seatedMe,
      draw: drawControl(game, myColor),
      resign: myColor !== null,
    },
    clock: playing ? game.clock : null,
    result: resultBanner(state, game, me),
    legalMoves: moves,
  };
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
): string {
  if (!state.room) return '서버에 연결하는 중…';
  if (!game || game.status === 'finished') {
    const seats = state.room.seats.length;
    if (seatedMe) return `상대를 기다리는 중입니다. (${String(seats)}/2)`;
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
  if (!mover.connected) parts.push(`${mover.name}님의 연결이 끊겼습니다(시간은 계속 흐릅니다).`);
  return parts.join(' ');
}

function moveRows(game: GameSnapshot | null): string[] {
  const rows: string[] = [];
  const moves = game?.moves ?? [];
  for (let i = 0; i < moves.length; i += 2) {
    const white = moves[i]?.san ?? '';
    const black = moves[i + 1]?.san;
    rows.push(`${String(i / 2 + 1)}. ${white}${black ? ` ${black}` : ''}`);
  }
  return rows;
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
