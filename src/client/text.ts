import type { Color, EndReason, PieceType } from '../shared/chess/index.ts';
import type { ErrorCode } from '../shared/protocol.ts';

export const COLOR_NAME: Record<Color, string> = { w: '백', b: '흑' };

export const PIECE_NAME: Record<PieceType, string> = {
  p: '폰',
  n: '나이트',
  b: '비숍',
  r: '룩',
  q: '퀸',
  k: '킹',
};

/** How a game ended, under the result title (승리, 패배, 무승부). */
export const END_REASON: Record<EndReason, string> = {
  checkmate: '체크메이트',
  stalemate: '스테일메이트',
  'dead-position': '메이트할 기물 부족',
  'threefold-repetition': '3회 동형 반복',
  'fifty-move-rule': '50수 규칙',
  resignation: '기권',
  agreement: '합의',
  timeout: '시간 초과',
  'timeout-vs-insufficient-material': '시간 초과, 메이트할 기물 부족',
  disconnection: '연결 끊김',
  'disconnection-vs-insufficient-material': '연결 끊김, 메이트할 기물 부족',
};

export const ERROR_TEXT: Record<ErrorCode | 'timeout' | 'disconnected', string> = {
  'invalid-payload': '요청을 처리하지 못했어요.',
  'rate-limited': '조금 천천히 해 주세요.',
  'no-room': '방을 찾지 못했어요. 이미 닫힌 방일 수 있어요.',
  'not-in-room': '방에 들어간 뒤에 할 수 있어요.',
  'room-limit': '열 수 있는 방이 다 찼어요. 목록에서 골라 주세요.',
  'server-error': '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.',
  'not-a-player': '대국 중인 사람만 할 수 있어요.',
  'not-your-turn': '상대 차례예요.',
  'no-game': '진행 중인 대국이 없어요.',
  'game-in-progress': '이미 대국이 시작됐어요.',
  'illegal-move': '둘 수 없는 수예요.',
  'stale-move': '그사이 판이 바뀌었어요. 다시 둬 주세요.',
  'already-seated': '이미 앉아 있어요.',
  'seats-full': '자리가 다 찼어요.',
  'not-seated': '앉아 있지 않아요.',
  'no-draw-offer': '받은 무승부 제안이 없어요.',
  'draw-offer-pending': '이미 무승부를 제안했어요.',
  'draw-offer-limit': '한 수 둔 뒤에 다시 제안할 수 있어요.',
  timeout: '서버가 답하지 않아요. 잠시 뒤에 다시 해 주세요.',
  disconnected: '서버와 연결이 끊겨 있어요.',
};
