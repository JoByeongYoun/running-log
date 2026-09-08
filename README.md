# 우리들의 러닝일지

그룹 주간 목표 거리를 증거 사진 기반 기록과 관리자 승인으로 집계하고, 매주 순위·성공/실패를 자동 확정하는 모바일 우선 PWA.

- 스펙: `plan.md` · 구현 계획: `docs/superpowers/plans/2026-09-08-running-log-plan.md` · 배포: `docs/deploy.md`
- 스택: Next.js 16 (App Router, TypeScript strict), Tailwind 4, Supabase (Postgres·Auth·Storage), Vercel, PWA

## 구조

| 위치 | 역할 |
|---|---|
| `supabase/migrations/0001~0007` | 스키마·RLS·그룹/기록/주차/알림 함수. 모든 상태 변경은 `security definer` 함수 안에서 잠금·단일 트랜잭션으로 처리 |
| `src/lib/domain` | 주차·거리·순위 순수 로직 (`Asia/Seoul` 고정) |
| `src/actions` | Server Actions: 입력 검증(zod) → `rpc` |
| `src/app` | 화면 (`/`, `/admin`, `/records/[id]`, `/notifications`, `/profile`, `/join/[code]`, `/groups/new`, `/onboarding`, 인증) |
| `src/app/api/cron/weekly` | 주간 유지보수 엔드포인트 (`CRON_SECRET`) |
| `src/app/sw.js` | 서비스 워커 (정적 자산만 캐시, 개인화 응답 미캐시, 수동 업데이트) |
| `tests/unit`, `tests/integration`, `tests/e2e` | Vitest 단위·통합(로컬 Supabase), Playwright 핵심 흐름 |

핵심 규칙(스펙 2절)은 DB 함수가 강제한다: 회원당 활성 그룹 1개, 그룹당 관리자 1명, 오늘 날짜만 등록, 승인 거리만 합산, 월요일 12:00 유예 후 `expired`, 확정 결과 불변, 자동 요약 1회 claim.

## 로컬 개발

필요: Node 26, npm 11, Docker(Colima/Docker Desktop), Supabase CLI.

```bash
brew install supabase/tap/supabase colima docker && colima start
npm install
npm run db:start                # 로컬 Supabase (URL·키 출력)
cp .env.example .env.local      # 출력값으로 채움. SUPABASE_SECRET_KEY = Secret key(sb_secret_...)
npm run db:reset                # 마이그레이션 + seed(로컬 테스트 모드 플래그)
npm run db:types                # src/lib/db/types.ts 재생성 (마이그레이션 변경 시)
npm run dev
```

- 이메일 확인/재설정 메일은 Mailpit `http://127.0.0.1:54324` 에서 확인.
- 데모 데이터: `npx tsx scripts/seed-demo.ts` (관리자 `demo-admin@local.test` / `password-1234`).

## 검증

```bash
npm run verify            # typecheck + lint + unit + build
npm run test:integration  # 로컬 Supabase 필요 (RLS·집계·동시성·마감 시나리오, 시각 고정 사용)
npm run test:e2e          # Playwright: 가입→그룹→초대→기록→승인→대시보드
```

시각 고정: 로컬 seed가 `app.test_clock.test_mode=true`를 켜면 `set_fake_now()`가 `app.now()`를 바꾼다. 운영 DB에는 seed가 적용되지 않으므로 항상 실제 시각을 쓴다.

## 환경 변수

| 이름 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개 키 (`sb_publishable_...` 또는 anon key) |
| `SUPABASE_SECRET_KEY` | 서버 전용 비밀 키 (`sb_secret_...` 또는 service_role). 클라이언트에 절대 노출 금지 |
| `CRON_SECRET` | `/api/cron/weekly` Bearer 토큰 |
| `NEXT_PUBLIC_SITE_URL` | 이메일 링크·초대 링크 기준 URL |

배포 절차, Supabase Auth 설정, Cron 요금제 선택, 장애 시 수동 재실행은 `docs/deploy.md` 참고.
