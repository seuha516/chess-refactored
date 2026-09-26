# Vercel 배포

운영 주소: <https://chess-refactored.vercel.app>

프론트엔드(정적 파일)와 게임 서버(Socket.IO)를 **하나의 Vercel 프로젝트**로 배포합니다. 게임 상태는 Vercel
Marketplace의 **Upstash Redis**에 둡니다. Vercel Hobby 플랜과 Upstash 무료 요금제 안에서 동작합니다.

## 구성

```
브라우저 ── https ──▶ Vercel CDN: 정적 파일 (.vercel/output/static)
        └─ wss ─────▶ Vercel 함수 /api/socket (도쿄 hnd1, Socket.IO)
                              │  상태·세션·접속 기록, 인스턴스 간 방송(pub/sub)
                              ▼
                        Upstash Redis (도쿄 hnd1, 무료 요금제)
```

- Vercel 함수는 인스턴스가 여러 개일 수 있고, WebSocket 연결은 함수의 최대 실행 시간(Hobby 5분)이 되면
  끊깁니다([Vercel 문서](https://vercel.com/docs/functions/websockets)). 그래서
  - 방·대국·세션·접속 기록은 Redis에 저장하고(`src/server/redis-store.ts`),
  - 다른 인스턴스에 붙은 사람에게도 방송되도록 Socket.IO Redis 어댑터를 쓰며,
  - 클라이언트는 끊기면 바로 다시 연결해 세션 토큰으로 같은 자리에 복귀합니다(3초 안에 복귀하면 안내 배너도
    뜨지 않습니다).
  - 시간 초과·연결 끊김 판정은 특정 인스턴스의 타이머에 의존하지 않습니다(읽을 때 판정 + 클라이언트의 `room:sync`).
- 빌드는 Vercel의 프레임워크 자동 감지 대신 [Build Output API](https://vercel.com/docs/build-output-api)를
  씁니다. `npm run vercel-build`가 `scripts/build-vercel.ts`로 `.vercel/output`을 직접 만듭니다:
  Vite 빌드 결과를 정적 파일로, `src/server/vercel.ts`를 esbuild로 번들한 함수를 `api/socket.func`로 넣고,
  보안 헤더(CSP 등)를 라우팅 설정에 넣습니다.
- 함수와 Redis는 모두 **도쿄(hnd1)** 에 있습니다. 한 번의 동작에 Redis 왕복이 여러 번 있어 같은 지역에 두는 것이
  중요하고, Upstash가 제공하는 지역 중 한국에서 가장 가깝습니다.

## 처음 설정할 때 (이미 완료됨)

1. Vercel 개인 팀에 프로젝트 `chess-refactored` 생성 — Framework: 없음(Other), Build Command:
   `npm run vercel-build`, Install Command: `npm ci`, Node.js 24.x, 함수 지역: Tokyo (hnd1).
2. GitHub 저장소 연결 → `main`에 push하면 운영(Production) 배포, 다른 브랜치는 미리보기(Preview) 배포.
3. Storage → Upstash for Redis(Free, Tokyo) 생성 후 프로젝트에 연결 → `REDIS_URL` 등의 환경 변수가 자동으로
   추가됩니다. 서버는 `REDIS_URL`(없으면 `KV_URL`)을 읽습니다.

환경 변수를 바꾸면 다시 배포해야 반영됩니다(Deployments → 최신 배포 → Redeploy).

## 비용과 한도

두 서비스 모두 **한도를 넘어도 요금이 청구되지 않고 제한만 걸립니다**(Vercel Hobby는 해당 기능이 최대 30일
일시 중지, Upstash 무료 요금제는 속도 제한). Hobby는 개인·비상업 용도로만 쓸 수 있습니다.

| 항목                           | 무료 한도(월) | 이 앱에서 쓰이는 방식                                                                                           |
| ------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------- |
| Vercel 함수 Provisioned Memory | 360 GB-시간   | 연결이 열려 있는 동안 함수 인스턴스가 살아 있음(인스턴스당 2GB → 약 180시간). 여러 연결은 한 인스턴스를 함께 씀 |
| Vercel 함수 Active CPU         | 4 CPU-시간    | 메시지 처리 시간만 계산(대기 시간 제외)                                                                         |
| Vercel 함수 호출               | 100만 회      | 연결(재연결 포함) 1회 = 1회                                                                                     |
| Upstash Redis 명령             | 50만 회       | 수 하나당 약 4~6회, 접속 기록 갱신이 연결당 15초마다 1회                                                        |

한도를 아끼기 위해 클라이언트는 **대국 중이 아닌 탭이 5분 이상 백그라운드에 있으면 연결을 닫고**, 다시 보일
때 연결합니다. 사용량은 Vercel 대시보드의 Usage 탭과 Storage → Upstash 화면에서 볼 수 있습니다.

## 배포된 사이트 확인

```bash
# 핵심 E2E 시나리오를 운영 주소에 대해 실행 (서버의 연결 수 제한 때문에 전체보다 일부만 권장)
E2E_BASE_URL=https://chess-refactored.vercel.app npx playwright test -g "checkmate|lobby lists rooms|reload the page"
```

## 주의할 점

- Vercel의 WebSocket 지원은 2026년 9월 기준 **베타**입니다.
- 연결은 최대 5분마다 끊기고 곧바로 다시 연결됩니다. 이때 진행 중인 요청 하나가 5초 제한에 걸려 "서버 응답이
  없습니다"가 잠깐 보일 수 있습니다. 게임 상태는 서버에 있으므로 다시 시도하면 됩니다.
- 새 배포 직후에는 기존 연결이 이전 배포에 남아 있다가, 끊긴 뒤 새 배포로 옮겨 갑니다. 상태는 Redis에 있으므로
  이어서 둘 수 있습니다. 다만 프로토콜을 바꾸는 배포는 진행 중인 대국에 영향을 줄 수 있습니다.
- 미리보기(Preview) 배포는 Vercel 로그인으로 보호되고 운영 주소는 공개입니다. 미리보기 배포도 같은 Redis를
  쓰지만, 키와 방송 채널에 환경 이름(`VERCEL_ENV`)을 붙여 운영 데이터와 섞이지 않습니다.
