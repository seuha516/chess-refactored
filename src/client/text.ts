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

/** "…에 의해" phrases from the original result screen. */
export const END_REASON: Record<EndReason, string> = {
  checkmate: '체크메이트에 의해',
  stalemate: '스테일메이트에 의해',
  'dead-position': '기물 부족에 의해',
  'threefold-repetition': '3회 동형 반복에 의해',
  'fifty-move-rule': '50수 규칙에 의해',
  resignation: '기권에 의해',
  agreement: '무승부 합의에 의해',
  timeout: '시간 초과에 의해',
  'timeout-vs-insufficient-material': '시간 초과 및 기물 부족에 의해',
  disconnection: '연결 끊김(기권)에 의해',
  'disconnection-vs-insufficient-material': '연결 끊김 및 기물 부족에 의해',
};

export const ERROR_TEXT: Record<ErrorCode | 'timeout' | 'disconnected', string> = {
  'invalid-payload': '잘못된 요청입니다.',
  'rate-limited': '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  'no-room': '방을 찾을 수 없습니다. 이미 닫혔을 수 있습니다.',
  'not-in-room': '먼저 방에 들어가 주세요.',
  'room-limit': '방이 너무 많습니다. 기존 방을 이용해주세요.',
  'server-error': '서버에 문제가 생겼습니다. 잠시 후 다시 시도해주세요.',
  'not-a-player': '대국 중인 플레이어만 할 수 있습니다.',
  'not-your-turn': '상대의 차례입니다.',
  'no-game': '진행 중인 대국이 없습니다.',
  'game-in-progress': '대국이 진행 중입니다.',
  'illegal-move': '둘 수 없는 수입니다.',
  'stale-move': '이미 상황이 바뀌었습니다. 다시 시도해주세요.',
  'already-seated': '이미 참가했습니다.',
  'seats-full': '자리가 모두 찼습니다.',
  'not-seated': '참가 중이 아닙니다.',
  'no-draw-offer': '받은 무승부 제안이 없습니다.',
  'draw-offer-pending': '이미 무승부를 제안했습니다.',
  'draw-offer-limit': '수를 둔 뒤에 다시 제안할 수 있습니다.',
  timeout: '서버 응답이 없습니다.',
  disconnected: '서버와 연결되어 있지 않습니다.',
};
