# Chess

브라우저에서 두 사람이 1대1로 두는 체스 웹 애플리케이션입니다.
[`seuha516/chess-js`](https://github.com/seuha516/chess-js)를 출발점으로 삼아 전체를 다시 다듬은 프로젝트이며,
첫 커밋에 원본 소스가 그대로 보존되어 있습니다.

- 한 서버에 대국 테이블 하나: 두 명이 **참가**하면 색을 무작위로 정해 대국이 시작되고, 나머지 접속자는 관전합니다.
- 서버가 게임 상태를 소유합니다. 모든 수는 서버의 규칙 엔진이 검증하고, 시간·결과도 서버가 판정합니다.
- 규칙은 FIDE 체스 규정(2023년 1월 1일 시행판)과 FIDE 온라인 체스 규정을 기준으로 구현하고 검증했습니다.
- 시간 제도는 **15분 + 수마다 10초 추가**(피셔 방식, FIDE 세계 래피드 선수권과 동일). 무승부 제안/수락/거절, 기권, 채팅,
  관전, 새로고침·재접속 시 자리 유지.
- 클릭·키보드·드래그(터치 포함)로 수를 둘 수 있고, 휴대폰 화면에서도 사용할 수 있습니다.

## 빠른 시작

Node.js **22.18 이상**이 필요합니다(서버를 TypeScript 그대로 실행합니다. 개발은 Node 24에서 했습니다).

```bash
npm ci
npm run dev        # http://localhost:5173 — Vite 개발 서버 + 게임 서버(한 프로세스)
```

브라우저 창(또는 시크릿 창) 두 개로 접속해 각각 **참가**를 누르면 대국이 시작됩니다.
탭마다 별도의 플레이어로 취급됩니다.

배포용 빌드로 실행하려면:

```bash
npm run build      # 클라이언트를 dist/client로 빌드
npm start          # http://localhost:3000
```

인증서나 HTTPS 설정은 필요하지 않습니다. 운영 배포 환경(도메인, TLS, 리버스 프록시)은 이 프로젝트의 범위가 아닙니다.

### 환경 변수

`npm start`는 프로젝트 루트의 `.env`가 있으면 읽습니다(선택).

| 변수   | 기본값          | 설명                                                                    |
| ------ | --------------- | ----------------------------------------------------------------------- |
| `PORT` | `3000`          | 서버 포트                                                               |
| `HOST` | 모든 인터페이스 | 같은 네트워크의 다른 기기도 접속할 수 있습니다. `127.0.0.1`이면 이 PC만 |

## 스크립트

| 명령                   | 내용                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | 개발 서버(HMR)                                             |
| `npm run build`        | 클라이언트 프로덕션 빌드                                   |
| `npm start`            | 빌드된 클라이언트와 게임 서버 실행                         |
| `npm test`             | 단위·통합 테스트(Vitest)                                   |
| `npm run test:e2e`     | 브라우저 E2E 테스트(Playwright, 설치된 Google Chrome 사용) |
| `npm run typecheck`    | TypeScript 타입 검사(서버·클라이언트·E2E)                  |
| `npm run lint`         | ESLint                                                     |
| `npm run format:check` | Prettier 검사 (`npm run format`으로 정리)                  |

규칙 엔진의 차분 테스트를 더 깊게 돌리려면 `DIFFERENTIAL_GAMES=25 npx vitest run test/chess/differential.test.ts`
(시작 위치당 게임 수, 기본 4).

## 구조

```
src/
  shared/chess/    규칙 엔진 (DOM·네트워크 의존성 없음, 서버와 클라이언트가 공유)
  shared/protocol.ts  Socket.IO 이벤트·스냅샷 타입
  server/          GameRoom(대국 상태), Socket.IO/Express 연결, 입력 검증, 요청 제한
  client/          Vite로 빌드하는 브라우저 클라이언트 (프레임워크 없는 TypeScript)
public/            기물 이미지, 효과음 (원본 에셋)
test/              chess · server · client 단위/통합 테스트, e2e 브라우저 테스트
docs/              설계 문서
```

- [docs/architecture.md](docs/architecture.md): 서버 권한 구조, 프로토콜, 세션·재접속, 시간 처리, 보안
- [docs/rules.md](docs/rules.md): 적용한 규정과 조항, 원본 규칙 구현의 결함과 수정, 검증 방법, 알려진 한계

## 기술 스택

TypeScript 6 · Node.js(타입 스트리핑으로 직접 실행) · Express 5 · Socket.IO 4 · Vite 8 ·
Vitest 5 · Playwright · ESLint(typescript-eslint) · Prettier.
[chess.js](https://github.com/jhlywa/chess.js)는 규칙 엔진 교차 검증용 개발 의존성으로만 사용합니다.
