# 우리들의 러닝일지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹 주간 목표 거리를 사진 증거 기반 기록·관리자 승인으로 집계하고 주간 순위·성공/실패를 자동 확정하는 모바일 우선 PWA를 Next.js + Supabase + Vercel로 구축한다.

**Architecture:** 모든 상태 전이(그룹 생성·참여 승인·기록 제출·검토·주간 마감)는 PostgreSQL `SECURITY DEFINER` 함수 안에서 잠금과 단일 트랜잭션으로 처리하고, RLS는 조회 권한만 담당한다. Next.js App Router는 Server Components로 조회하고 Server Actions가 DB 함수를 호출한다. 주간 마감은 서버 시각 기준의 재실행 가능한 DB 함수 `run_week_maintenance()`이며, Vercel Cron 엔드포인트와 조회 시 복구 경로 양쪽에서 같은 함수를 호출한다.

**Tech Stack:** Next.js 16.3 (App Router, TypeScript strict), React 19.2, Tailwind CSS 4, @supabase/supabase-js 2.116 + @supabase/ssr 0.12, Supabase CLI(로컬 Docker), Zod 4, Vitest 5, Playwright 1.63, @serwist/next 9.5 (서비스 워커), html-to-image (요약 PNG), heic-to (HEIC 변환).

**Spec:** `plan.md` (우리들의 러닝일지 — 작업 기획서 v1.0, 2026-09-08). 이 계획의 모든 정책값은 spec 2절·7절·9절에서 그대로 가져온다.

## Global Constraints

- 주간 경계: `Asia/Seoul` 월요일 00:00 이상 ~ 다음 월요일 00:00 미만. 주차 키는 월요일 날짜 `YYYY-MM-DD`.
- 집계 유예: 월요일 12:00(KST) 미만까지 지난주 pending 검토 가능. 12:00 이상이면 pending → expired 후 확정.
- 거리: 소수 둘째 자리까지 입력, 내부 정수 미터 저장. 기록당 상한 500km(`500000` m), 주간 목표 상한 1,000km(`1000000` m). 소수 셋째 자리 이상은 오류.
- 기록 사진 1~5장, 원본 파일당 최대 10MB(`10485760` bytes). 프로필 사진 1장 필수, 최대 10MB.
- 닉네임: 앞뒤 공백 제거 후 2~20자, 중복 허용. 그룹명 2~30자. 벌칙 1~500자. 메모 최대 1,000자. 댓글 1~1,000자.
- 회원당 활성 멤버십 1개, 대기 참여 요청 1개. 그룹당 활성 관리자 정확히 1명.
- 공동 순위 1, 2, 2, 4 (standard competition ranking). 준비 주간(주 시작 후 참여) 멤버는 순위·성공/실패 제외.
- 자동 요약: 회원·그룹·주차당 최대 1회 자동 표시(원자적 claim).
- 시간은 UTC `timestamptz` 저장, 주차·운동 날짜 계산은 DB에서 `timezone('Asia/Seoul', now())`로만 판단. 브라우저 시각을 판정 근거로 쓰지 않는다.
- 사진은 비공개 버킷 + 짧은 만료(60초) 서명 URL. 서비스 역할 키는 서버 전용.
- 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`(서버 전용), `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`. `.env.example`에는 값 없는 이름만 둔다.
- 커밋: 각 태스크 끝에 커밋. 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Vercel Cron 제약(2026-09-08 공식 문서 확인): Hobby는 하루 1회·시간 단위 정밀도(±59분), Pro는 분 단위. 스펙의 5분 간격은 Pro가 필요하다. 개발자는 요금제를 임의로 바꾸지 않는다. 단계 5의 Task 25에서 사용자에게 선택을 보고한다.

## 사전 준비 (사용자 확인 필요)

이 머신에는 `supabase` CLI와 Docker가 설치되어 있지 않다(2026-09-08 확인). 단계 1 Task 2 전에 다음이 필요하다.

```bash
brew install supabase/tap/supabase   # Supabase CLI
# Docker Desktop 또는 OrbStack 설치 후 실행 상태 확인
docker info
```

Node 26.4, npm 11.17이 설치되어 있다. 패키지 매니저는 npm을 사용한다.

## File Structure

```
runningLog/
├── plan.md                              # 스펙
├── package.json, next.config.ts, tsconfig.json, tailwind (postcss.config.mjs)
├── vercel.json                          # cron 정의
├── .env.example
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 0001_schema.sql              # 테이블·enum·제약·인덱스
│   │   ├── 0002_rls.sql                 # 헬퍼 함수·RLS·storage 정책
│   │   ├── 0003_groups.sql              # 그룹·초대·참여·위임·탈퇴 함수
│   │   ├── 0004_records.sql             # 업로드·기록·검토·댓글 함수
│   │   ├── 0005_dashboard.sql           # 대시보드 조회 함수
│   │   ├── 0006_weeks.sql               # 주차 생성·마감·결과·유지보수 함수
│   │   └── 0007_notifications_summary.sql
│   └── seed.sql
├── src/
│   ├── app/
│   │   ├── layout.tsx, page.tsx, globals.css, manifest.ts, offline/page.tsx
│   │   ├── (auth)/login|signup|forgot-password|reset-password/page.tsx
│   │   ├── auth/callback/route.ts
│   │   ├── onboarding/page.tsx
│   │   ├── join/[code]/page.tsx
│   │   ├── groups/new/page.tsx
│   │   ├── records/[id]/page.tsx
│   │   ├── admin/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── notifications/page.tsx
│   │   ├── api/cron/weekly/route.ts
│   │   └── sw.ts                        # serwist 서비스 워커 소스
│   ├── proxy.ts                         # 세션 갱신 + 라우트 가드 (Next 16 명칭; middleware.ts 대체)
│   ├── lib/
│   │   ├── supabase/{server.ts,client.ts,admin.ts,proxy.ts}
│   │   ├── domain/{week.ts,distance.ts,rank.ts,constants.ts,validation.ts}
│   │   ├── auth/return-to.ts
│   │   ├── storage/signed-url.ts
│   │   ├── image/{process.ts}           # 브라우저 리사이즈·EXIF 제거·HEIC 변환
│   │   └── db/types.ts                  # supabase gen types 출력
│   ├── actions/                         # Server Actions (인증·입력 검사 → rpc)
│   │   ├── auth.ts, profile.ts, group.ts, join.ts, record.ts, review.ts, comment.ts, notification.ts, summary.ts
│   ├── components/
│   │   ├── ui/{Button,Input,Textarea,Modal,Toast,Spinner,EmptyState,ErrorState}.tsx
│   │   ├── layout/{AppHeader,BottomBar}.tsx
│   │   ├── dashboard/{WeekNav,MyProgress,WeekCalendar,RankList}.tsx
│   │   ├── record/{RecordForm,PhotoPicker,PhotoLightbox,RecordDetail,CommentList}.tsx
│   │   ├── admin/{JoinRequests,ReviewQueue,MemberList,GroupSettings}.tsx
│   │   ├── summary/{SummaryCard,SummaryAutoShow,SummaryExport}.tsx
│   │   └── pwa/{InstallPrompt,UpdateNotice}.tsx
│   └── test/
│       ├── setup.ts, supabase-test.ts   # 테스트용 사용자 생성·클라이언트 팩토리
│       └── time.ts                      # DB 시각 고정 헬퍼
├── tests/
│   ├── unit/{week,distance,rank,validation,return-to}.test.ts
│   ├── integration/{rls,groups,join,records,review,comments,dashboard,weeks,notifications,summary}.test.ts
│   └── e2e/core-flow.spec.ts
├── docs/superpowers/plans/2026-09-08-running-log-plan.md
└── README.md
```

**시각 고정 전략:** DB 함수는 모두 `app.now()`를 통해 현재 시각을 읽는다. `app.now()`는 세션 설정 `app.fake_now`가 있으면 그 값을, 없으면 `now()`를 돌려준다. 테스트는 `select set_config('app.fake_now', '2026-09-14T02:30:00Z', false)`로 경계 케이스(일요일 23:59, 월요일 00:00, 12:00)를 재현한다. 운영에서는 `app.fake_now`를 설정할 권한을 `authenticated` 역할에 주지 않는다(설정은 `service_role` 전용 함수 `app.set_fake_now`로만 가능하고, 이 함수는 마이그레이션에서 `current_setting('app.env', true) = 'test'`일 때만 동작한다).

---

## 단계 1 — 기반

### Task 1: 프로젝트 스캐폴드와 저장소 초기화

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.env.example`, `.gitignore`, `README.md`, `.nvmrc`

**Interfaces:**
- Produces: npm 스크립트 `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`

- [ ] **Step 1: git 초기화 및 Next.js 생성**

```bash
cd /Users/al03040368/projects/runningLog
git init -b main
npx create-next-app@16.3.4 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --yes
```
`plan.md`와 `docs/`가 이미 있어 create-next-app이 비어있지 않은 디렉터리를 거부하면, 임시 폴더에 생성 후 `rsync -a tmp/ ./`로 복사한다.

- [ ] **Step 2: tsconfig strict 확인 및 스크립트 추가**

`tsconfig.json`의 `"strict": true`를 확인하고 `package.json` scripts를 다음으로 맞춘다.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "db:start": "supabase start",
    "db:reset": "supabase db reset",
    "db:types": "supabase gen types typescript --local > src/lib/db/types.ts",
    "verify": "npm run typecheck && npm run lint && npm run test && npm run build"
  }
}
```

- [ ] **Step 3: .env.example, .nvmrc, README 뼈대**

`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
CRON_SECRET=
NEXT_PUBLIC_SITE_URL=
```
`.nvmrc`: `26`
`README.md`:
```markdown
# 우리들의 러닝일지

그룹 주간 목표 러닝 기록 관리 PWA. 스펙은 `plan.md`.

## 개발 환경
- Node 26, npm 11, Supabase CLI, Docker
- `cp .env.example .env.local` 후 `npm run db:start` 출력의 URL·키를 채운다.
- `npm run dev`
```
`.gitignore`에 `.env*.local`, `supabase/.temp`, `test-results/`, `playwright-report/`가 있는지 확인하고 없으면 추가한다.

- [ ] **Step 4: 빌드 확인**

Run: `npm run typecheck && npm run build`
Expected: 오류 없이 완료.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app with TypeScript and Tailwind

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: 로컬 Supabase 환경

**Files:**
- Create: `supabase/config.toml` (CLI 생성 후 수정), `supabase/seed.sql`(빈 파일), `src/lib/db/types.ts`(생성물)

**Interfaces:**
- Produces: 로컬 Supabase URL `http://127.0.0.1:54321`, 스토리지 버킷 `avatars`, `evidence`

- [ ] **Step 1: 초기화 및 시작**

```bash
supabase init
supabase start
```
출력의 `API URL`, `Publishable key`(또는 `anon key`), `Secret key`(또는 `service_role key`)를 `.env.local`에 넣는다. CLI 버전에 따라 키 이름이 다르면 README에 실제 이름을 적는다.

- [ ] **Step 2: config.toml 조정**

`supabase/config.toml`에서 다음을 설정한다.
```toml
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]
enable_confirmations = true   # [auth.email] 섹션

[storage]
file_size_limit = "10MiB"
```
로컬 이메일 확인은 Inbucket/Mailpit(`http://127.0.0.1:54324`)에서 본다. README에 기록한다.

- [ ] **Step 3: 재시작 확인**

Run: `supabase stop && supabase start && supabase status`
Expected: 모든 서비스 RUNNING.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml supabase/seed.sql README.md
git commit -m "chore: add local Supabase configuration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: 도메인 순수 로직 (주차·거리·순위) + Vitest

**Files:**
- Create: `vitest.config.ts`, `src/test/setup.ts`, `src/lib/domain/constants.ts`, `src/lib/domain/week.ts`, `src/lib/domain/distance.ts`, `src/lib/domain/rank.ts`
- Test: `tests/unit/week.test.ts`, `tests/unit/distance.test.ts`, `tests/unit/rank.test.ts`

**Interfaces:**
- Produces:
  - `MAX_RECORD_METERS = 500_000`, `MAX_TARGET_METERS = 1_000_000`, `MAX_PHOTOS = 5`, `MAX_FILE_BYTES = 10_485_760`, `NICKNAME_MIN = 2`, `NICKNAME_MAX = 20`
  - `weekStartOf(instant: Date): string` → KST 월요일 `YYYY-MM-DD`
  - `kstDateOf(instant: Date): string` → KST 날짜 `YYYY-MM-DD`
  - `weekRange(weekStart: string): { start: string; end: string }` (월~일 날짜)
  - `addWeeks(weekStart: string, n: number): string`
  - `parseDistanceToMeters(input: string): { ok: true; meters: number } | { ok: false; error: 'invalid' | 'too_many_decimals' | 'out_of_range' }`
  - `formatMeters(meters: number): string` → `"12.34"`
  - `assignRanks<T extends { totalMeters: number }>(rows: T[]): (T & { rank: number })[]`

- [ ] **Step 1: Vitest 설치·설정**

```bash
npm i -D vitest@5 @vitest/coverage-v8 dotenv
```
`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
```
`src/test/setup.ts`:
```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/unit/week.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { weekStartOf, kstDateOf, weekRange, addWeeks } from '@/lib/domain/week';

describe('weekStartOf', () => {
  it('Sunday 23:59 KST belongs to the previous week', () => {
    // 2026-09-13 23:59 KST == 2026-09-13T14:59:00Z
    expect(weekStartOf(new Date('2026-09-13T14:59:00Z'))).toBe('2026-09-07');
  });
  it('Monday 00:00 KST starts a new week', () => {
    // 2026-09-14 00:00 KST == 2026-09-13T15:00:00Z
    expect(weekStartOf(new Date('2026-09-13T15:00:00Z'))).toBe('2026-09-14');
  });
  it('kstDateOf uses Seoul date', () => {
    expect(kstDateOf(new Date('2026-09-13T15:00:00Z'))).toBe('2026-09-14');
    expect(kstDateOf(new Date('2026-09-13T14:59:59Z'))).toBe('2026-09-13');
  });
  it('weekRange returns Monday..Sunday', () => {
    expect(weekRange('2026-09-07')).toEqual({ start: '2026-09-07', end: '2026-09-13' });
  });
  it('addWeeks moves by 7 days', () => {
    expect(addWeeks('2026-09-07', 1)).toBe('2026-09-14');
    expect(addWeeks('2026-09-07', -1)).toBe('2026-08-31');
  });
});
```
`tests/unit/distance.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseDistanceToMeters, formatMeters } from '@/lib/domain/distance';

describe('parseDistanceToMeters', () => {
  it('parses two decimals to integer meters', () => {
    expect(parseDistanceToMeters('12.34')).toEqual({ ok: true, meters: 12340 });
    expect(parseDistanceToMeters('5')).toEqual({ ok: true, meters: 5000 });
    expect(parseDistanceToMeters(' 0.1 ')).toEqual({ ok: true, meters: 100 });
  });
  it('rejects three decimals instead of rounding', () => {
    expect(parseDistanceToMeters('12.345')).toEqual({ ok: false, error: 'too_many_decimals' });
  });
  it('rejects zero, negative, non-numeric, and over 500km', () => {
    expect(parseDistanceToMeters('0')).toEqual({ ok: false, error: 'out_of_range' });
    expect(parseDistanceToMeters('-1')).toEqual({ ok: false, error: 'invalid' });
    expect(parseDistanceToMeters('abc')).toEqual({ ok: false, error: 'invalid' });
    expect(parseDistanceToMeters('500.01')).toEqual({ ok: false, error: 'out_of_range' });
    expect(parseDistanceToMeters('500')).toEqual({ ok: true, meters: 500000 });
  });
  it('formats meters as km with two decimals', () => {
    expect(formatMeters(12340)).toBe('12.34');
    expect(formatMeters(5000)).toBe('5.00');
  });
});
```
`tests/unit/rank.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { assignRanks } from '@/lib/domain/rank';

describe('assignRanks', () => {
  it('uses 1,2,2,4 competition ranking on totalMeters desc', () => {
    const rows = [
      { id: 'a', totalMeters: 10000 },
      { id: 'b', totalMeters: 20000 },
      { id: 'c', totalMeters: 10000 },
      { id: 'd', totalMeters: 0 },
    ];
    const ranked = assignRanks(rows).map((r) => [r.id, r.rank]);
    expect(ranked).toEqual([['b', 1], ['a', 2], ['c', 2], ['d', 4]]);
  });
  it('returns empty for empty input', () => {
    expect(assignRanks([])).toEqual([]);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm run test:unit`
Expected: FAIL — 모듈을 찾을 수 없음.

- [ ] **Step 4: 구현**

`src/lib/domain/constants.ts`:
```ts
export const MAX_RECORD_METERS = 500_000;
export const MAX_TARGET_METERS = 1_000_000;
export const MAX_PHOTOS = 5;
export const MIN_PHOTOS = 1;
export const MAX_FILE_BYTES = 10_485_760;
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;
export const GROUP_NAME_MIN = 2;
export const GROUP_NAME_MAX = 30;
export const PENALTY_MIN = 1;
export const PENALTY_MAX = 500;
export const MEMO_MAX = 1000;
export const COMMENT_MAX = 1000;
export const SIGNED_URL_TTL_SECONDS = 60;
export const TZ = 'Asia/Seoul';
```
`src/lib/domain/week.ts`:
```ts
import { TZ } from './constants';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function kstDateOf(instant: Date): string {
  return fmt.format(instant); // en-CA gives YYYY-MM-DD
}

function toUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  const d = toUtcDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtcDate(d);
}

export function weekStartOf(instant: Date): string {
  const ymd = kstDateOf(instant);
  const dow = toUtcDate(ymd).getUTCDay(); // 0=Sun
  const back = (dow + 6) % 7; // Mon=0
  return addDays(ymd, -back);
}

export function weekRange(weekStart: string): { start: string; end: string } {
  return { start: weekStart, end: addDays(weekStart, 6) };
}

export function addWeeks(weekStart: string, n: number): string {
  return addDays(weekStart, 7 * n);
}
```
`src/lib/domain/distance.ts`:
```ts
import { MAX_RECORD_METERS } from './constants';

export type ParsedDistance =
  | { ok: true; meters: number }
  | { ok: false; error: 'invalid' | 'too_many_decimals' | 'out_of_range' };

export function parseDistanceToMeters(input: string, max = MAX_RECORD_METERS): ParsedDistance {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: 'invalid' };
  const [whole, frac = ''] = s.split('.');
  if (frac.length > 2) return { ok: false, error: 'too_many_decimals' };
  const meters = Number(whole) * 1000 + Number(frac.padEnd(3, '0'));
  if (meters <= 0 || meters > max) return { ok: false, error: 'out_of_range' };
  return { ok: true, meters };
}

export function formatMeters(meters: number): string {
  const km = Math.floor(meters / 1000);
  const rest = Math.round((meters % 1000) / 10);
  return `${km}.${String(rest).padStart(2, '0')}`;
}
```
`src/lib/domain/rank.ts`:
```ts
export function assignRanks<T extends { totalMeters: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.totalMeters - a.totalMeters);
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((row, i) => {
    if (prev === null || row.totalMeters !== prev) rank = i + 1;
    prev = row.totalMeters;
    return { ...row, rank };
  });
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm run test:unit`
Expected: PASS (13 tests).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/test src/lib/domain tests/unit package.json package-lock.json
git commit -m "feat: add week, distance, and rank domain logic with unit tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: 스키마 마이그레이션 (0001_schema.sql)

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `src/test/supabase-test.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Produces (테이블, 스펙 9절 그대로): `profiles(id uuid pk→auth.users, nickname text, avatar_path text, onboarding_completed_at timestamptz, created_at, updated_at)`, `groups(id, name, archived_at, created_at, updated_at)`, `group_invites(id, group_id, code_hash text unique, created_at)`, `group_settings(id, group_id, effective_week_start date, target_meters int, penalty text, created_at; unique(group_id, effective_week_start))`, `memberships(id, group_id, user_id, role membership_role, joined_at, left_at)`, `join_requests(id, group_id, user_id, status join_status, reviewed_by, reviewed_at, created_at)`, `group_weeks(id, group_id, week_start date, target_meters, penalty, state week_state, group_name_snapshot, group_total_meters, finalized_at, created_at; unique(group_id, week_start))`, `week_members(week_id, user_id, eligible bool, joined_this_week bool, left_during_week bool; pk(week_id,user_id))`, `running_records(id, group_id, user_id, week_id, activity_date date, distance_meters int check 1..500000, memo text, status record_status, version int default 1, submission_key text, created_at, updated_at; unique(user_id, submission_key))`, `record_photos(id, record_id, storage_path, order_index; unique(record_id, order_index))`, `pending_uploads(id, user_id, group_id, storage_path, byte_size, content_type, ready bool, expires_at, created_at)`, `record_reviews(id, record_id, actor_id, from_status, to_status, reason, created_at)`, `comments(id, record_id, user_id, body, created_at, deleted_at, deleted_by)`, `weekly_results(week_id, user_id, total_meters, rank int null, outcome result_outcome, eligible bool, nickname_snapshot, pk(week_id,user_id))`, `weekly_summary_views(week_id, user_id, claimed_at, pk(week_id,user_id))`, `notifications(id, user_id, group_id, event_key text, type text, target_id uuid, read_at, created_at; unique(user_id, event_key))`
- Enums: `membership_role('admin','member')`, `join_status('pending','approved','rejected','cancelled')`, `week_state('open','closing','finalized')`, `record_status('pending','approved','rejected','expired')`, `result_outcome('success','fail','not_evaluated')`
- Partial unique indexes: `memberships (user_id) where left_at is null`, `memberships (group_id) where left_at is null and role='admin'`, `join_requests (user_id) where status='pending'`
- 함수: `app.now()`, `app.set_fake_now(timestamptz)`, `app.kst_today()`, `app.week_start_of(timestamptz)`, `app.week_close_deadline(date)`(= week_start+7일 12:00 KST를 UTC로)
- Storage 버킷: `avatars`, `evidence` (public=false, file_size_limit 10485760, allowed_mime_types jpeg/png/webp)
- `src/test/supabase-test.ts`: `adminClient()`, `createTestUser(label) → { id, email, client }` (admin.auth.admin.createUser로 생성, 이메일 확인 완료, password 로그인한 supabase-js 클라이언트 반환), `setFakeNow(iso)`, `resetFakeNow()`, `truncateAll()`

- [ ] **Step 1: 테스트 작성** — `tests/integration/schema.test.ts`: (a) 같은 사용자의 두 번째 활성 멤버십 insert가 unique 위반, (b) 그룹에 두 번째 활성 admin insert가 unique 위반, (c) `distance_meters=500001` CHECK 위반, (d) `app.week_start_of('2026-09-13T14:59Z')='2026-09-07'`, `app.week_start_of('2026-09-13T15:00Z')='2026-09-14'`, (e) `app.week_close_deadline('2026-09-07')='2026-09-14T03:00:00Z'`, (f) `set_fake_now` 후 `app.now()` 반환값 일치.
- [ ] **Step 2: 실패 확인** — `npm run test:integration` → 테이블 없음 오류.
- [ ] **Step 3: 마이그레이션 작성** — 위 인터페이스 그대로 SQL 작성. `updated_at` 트리거 `app.touch_updated_at()`. `auth.users` insert 트리거로 `profiles` 행 자동 생성(nickname null). `app.now()`:
```sql
create schema if not exists app;
create or replace function app.now() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('app.fake_now', true), '')::timestamptz, now());
$$;
create or replace function app.set_fake_now(p timestamptz) returns void language plpgsql security definer as $$
begin
  if current_setting('app.env', true) is distinct from 'test' then raise exception 'fake_now disabled'; end if;
  perform set_config('app.fake_now', coalesce(p::text, ''), false);
end $$;
revoke all on function app.set_fake_now from public, anon, authenticated;
```
`supabase/config.toml`의 `[db]`가 아니라 마이그레이션 끝에 `alter database postgres set app.env = 'test';`를 **로컬 전용 seed.sql**에 둔다(운영에는 적용하지 않음).
- [ ] **Step 4: 적용·생성** — `supabase db reset && npm run db:types` 후 테스트 PASS.
- [ ] **Step 5: Commit** — `feat(db): add core schema, enums, constraints, and time helpers`

### Task 5: RLS와 스토리지 정책 (0002_rls.sql)

**Files:**
- Create: `supabase/migrations/0002_rls.sql`
- Test: `tests/integration/rls.test.ts`

**Interfaces:**
- Produces: `app.current_group_id() → uuid` (호출자의 활성 멤버십 그룹), `app.is_active_member(group_id) → bool`, `app.is_group_admin(group_id) → bool`, `app.can_view_profile(profile_id) → bool` (본인, 같은 활성 그룹, 또는 내가 관리자인 그룹의 pending join_request 신청자)
- 정책: `profiles` select via `can_view_profile`, update 본인만(nickname, avatar_path, onboarding_completed_at). `groups/group_weeks/week_members/weekly_results/running_records/record_photos/comments/record_reviews` select `is_active_member(group_id)`. `join_requests` select 본인 또는 해당 그룹 관리자. `notifications` select/update(read_at) 본인. `weekly_summary_views` select 본인. **insert/update/delete는 모두 정책 없음(= 거부)** — 변경은 DB 함수만 수행. `pending_uploads` select 본인.
- Storage: `avatars` 객체 경로 `{user_id}/{uuid}.{ext}`; insert/update/delete 본인 폴더만, select `can_view_profile(split_part(name,'/',1)::uuid)`. `evidence` 경로 `{group_id}/{user_id}/{upload_id}.{ext}`; insert 본인 폴더이며 `is_active_member(group)`; select `is_active_member(group)`; delete 본인 폴더 + 아직 record_photos에 연결되지 않은 객체.

- [ ] **Step 1: 테스트** — 두 그룹 A, B와 사용자 a1(admin A), a2(member A), b1(admin B), outsider 생성(직접 admin 클라이언트로 insert). 검증: a2가 a1 프로필 조회 가능, outsider는 불가; b1은 A의 running_records 0건; a2가 running_records insert 시도 → 오류; outsider가 `evidence/A/..` 업로드 → 오류; a2 업로드 → 성공, b1 다운로드 → 오류.
- [ ] **Step 2: 실패 확인 → Step 3: 정책 작성 → Step 4: `supabase db reset` 후 PASS → Step 5: Commit** `feat(db): add RLS and storage policies`

### Task 6: Supabase 클라이언트와 라우트 가드

**Files:**
- Create: `src/lib/supabase/server.ts`, `client.ts`, `admin.ts`, `proxy.ts`, `src/proxy.ts`, `src/lib/auth/return-to.ts`
- Test: `tests/unit/return-to.test.ts`

**Interfaces:**
- `createServerSupabase()` (cookies 기반, RSC/Server Action), `createBrowserSupabase()`, `createAdminSupabase()` (SUPABASE_SECRET_KEY, `server-only`), `updateSession(request) → NextResponse`
- `safeReturnTo(raw: string | null): string` — `/`로 시작하고 `//`·`\`·프로토콜이 없는 내부 경로만 허용, 아니면 `/`
- 가드 규칙(`src/proxy.ts`): 비로그인 + 보호 경로 → `/login?returnTo=<path>`; 로그인 + 프로필 미완료(`onboarding_completed_at is null`) + `/onboarding`·`/auth`·`/login` 이외 → `/onboarding?returnTo=`; 로그인 + `/login|/signup` → `/`. 공개 경로: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/*`, `/offline`, `/manifest.webmanifest`, `/icons/*`, `/api/cron/*`. `/join/[code]`는 비로그인 허용(코드 안내만).

- [ ] Step 1 테스트: `safeReturnTo('/join/abc')='/join/abc'`, `'//evil.com'→'/'`, `'https://x'→'/'`, `null→'/'`, `'/a\\b'→'/'`.
- [ ] Step 2 실패 확인 → Step 3 구현(`npm i @supabase/supabase-js@2 @supabase/ssr@0.12 server-only`) → Step 4 PASS + `npm run typecheck` → Step 5 Commit `feat: add Supabase clients and session guard proxy`

### Task 7: 인증 화면과 액션

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `signup/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `src/app/auth/callback/route.ts`, `src/actions/auth.ts`, `src/lib/domain/validation.ts`(zod 스키마), `src/components/ui/{Button,Input,Textarea,Modal,Toast,Spinner,EmptyState,ErrorState}.tsx`, `src/components/layout/AppHeader.tsx`
- Test: `tests/unit/validation.test.ts`

**Interfaces:**
- actions: `signUp(formData)`, `signIn(formData)`, `signOut()`, `requestPasswordReset(formData)`, `updatePassword(formData)`; 각 액션은 `{ error?: string }` 반환. `emailRedirectTo = NEXT_PUBLIC_SITE_URL + '/auth/callback?returnTo='`.
- `/auth/callback`: `exchangeCodeForSession` 후 `safeReturnTo`로 리디렉션. 비밀번호 재설정 타입은 `/reset-password`.
- zod: `emailSchema`, `passwordSchema(min 8)`, `nicknameSchema(trim 2~20)`, `groupNameSchema(2~30)`, `penaltySchema(1~500)`, `memoSchema(≤1000)`, `commentSchema(1~1000)`, `distanceInputSchema`(parseDistanceToMeters 위임)

- [ ] Step 1 테스트: nickname `' ab '`→`'ab'` 통과, `'a'` 실패, 21자 실패; penalty 501자 실패.
- [ ] Step 2 실패 확인 → Step 3 구현(`npm i zod@4`) → Step 4 PASS, 브라우저 수동: 가입→Mailpit 링크→로그인→로그아웃 → Step 5 Commit `feat: add email auth pages and actions`

### Task 8: 온보딩(닉네임·프로필 사진)과 이미지 처리

**Files:**
- Create: `src/app/onboarding/page.tsx`, `src/actions/profile.ts`, `src/lib/image/process.ts`, `src/lib/storage/signed-url.ts`, `src/components/record/PhotoPicker.tsx`(단일/다중 모드), `src/app/profile/page.tsx`(닉네임·사진 수정·로그아웃)
- Test: `tests/integration/profile.test.ts`

**Interfaces:**
- `processImageFile(file: File, opts: { maxEdge: number; quality: number }) → Promise<{ blob: Blob; width; height }>`: HEIC/HEIF는 `heic-to`로 JPEG 변환 → `createImageBitmap` → canvas 리사이즈(maxEdge 2000, 증거는 숫자 가독성 위해 2000, 아바타 512) → `toBlob('image/jpeg', quality)`. canvas 재인코딩으로 EXIF 제거. 실제 형식은 매직 바이트로 판별(`sniffImageType(arrayBuffer) → 'jpeg'|'png'|'webp'|'heic'|null`).
- `completeOnboarding({ nickname, avatarPath })` → profiles 업데이트 + `onboarding_completed_at=now()`. 서버에서 `avatarPath`가 `${userId}/`로 시작하고 storage 객체가 존재하며 ≤10MB인지 admin 클라이언트로 확인.
- `signedUrl(bucket, path, ttl=60)`(서버 전용, 권한 확인은 RLS가 아닌 호출 측이 이미 조회 가능한 경로만 넘김)

- [ ] Step 1 테스트: 사용자 생성 → `completeOnboarding` rpc 대신 profiles update를 authenticated 클라이언트로 수행하면 nickname 규칙은 서버 액션이 담당하므로 통합 테스트는 (a) 다른 사용자 프로필 update 0 rows, (b) 본인 update 성공, (c) 다른 사용자 폴더에 avatars 업로드 실패.
- [ ] Step 2~5: 실패 확인 → 구현(`npm i heic-to`) → PASS + 수동 온보딩 → Commit `feat: add onboarding with avatar upload and client image processing`

## 단계 2 — 그룹

### Task 9: 그룹 생성·초대 함수 (0003_groups.sql 1/3)

**Files:** Create `supabase/migrations/0003_groups.sql`; Test `tests/integration/groups.test.ts`

**Interfaces:**
- `create_group(p_name text, p_target_meters int, p_penalty text) returns table(group_id uuid, invite_code text)`: 검증(프로필 완료, 활성 멤버십 없음 — `pg_advisory_xact_lock(hashtext(auth.uid()::text))` 후 재검사, pending join_request 없음, 길이·범위) → groups insert → memberships(admin) → group_settings(effective_week_start = 이번 주) → group_weeks(이번 주, state open, 스냅샷 target/penalty) → week_members(생성자 eligible=false, joined_this_week=true) → 초대 코드 `encode(gen_random_bytes(9),'base64')`를 URL-safe로 변환한 12자, `code_hash = encode(digest(code,'sha256'),'hex')` 저장, 평문은 반환만. 이후 재조회는 `regenerate_invite_code(group_id)`(관리자)로 새 코드 발급.
- `lookup_invite(p_code text) returns table(group_id, name, target_meters, penalty, archived bool)`: `security definer`, anon 허용. 실패 시 빈 결과.
- 요청 제한: `app.rate_limit(key text, max int, window interval)` — `app.rate_limits(key, window_start, count)` 테이블로 구현. `lookup_invite`는 IP 대신 `auth.uid()`가 있으면 uid, 없으면 `current_setting('request.headers')::json->>'x-forwarded-for'` 키로 분당 20회.

- [ ] Step 1 테스트: (a) create_group 후 memberships admin 1행, group_weeks 1행(state open, target 저장), week_members eligible=false; (b) 같은 사용자 재호출 → `already_in_group` 오류; (c) lookup_invite(code)로 이름·목표·벌칙 반환, 잘못된 코드 → 0행; (d) 그룹명 1자 → 오류.
- [ ] Step 2~5: 실패 확인 → SQL 작성 → `supabase db reset` PASS → Commit `feat(db): add group creation and invite lookup`

### Task 10: 참여 요청·승인·거절·취소 (0003_groups.sql 2/3)

**Interfaces:**
- `request_join(p_code text) returns uuid`: 프로필 완료, 활성 멤버십 없음, pending 요청 없음(있으면 `pending_request_exists`), 그룹 미보관 → join_requests insert → 관리자 알림 `notify(admin, group, 'join_request:'||id, 'join_request', id)`.
- `cancel_join_request(p_request_id)`: 본인 pending → cancelled.
- `review_join_request(p_request_id uuid, p_approve bool)`: 관리자 검증 → `pg_advisory_xact_lock(hashtext(requester::text))` → 승인 시 요청자의 활성 멤버십 재검사(있으면 `already_in_group`) → memberships insert(member, joined_at=app.now()) → 현재 open 주차 week_members upsert(eligible=false, joined_this_week=true) → status approved/rejected, reviewed_by/at → 요청자 알림 `'join_result:'||id`.
- `app.notify(p_user, p_group, p_event_key, p_type, p_target)`: `on conflict (user_id, event_key) do nothing`.

- [ ] Step 1 테스트: (a) 요청→승인→memberships 1행, week_members joined_this_week=true, 알림 1건; (b) 요청자가 승인 직전 다른 그룹을 만든 상태에서 승인 → `already_in_group`, 요청은 pending 유지; (c) 동시성: 두 그룹 관리자가 같은 사용자 요청을 동시에 승인(`Promise.all`) → 활성 멤버십 정확히 1개; (d) 거절 후 재요청 가능; (e) 비관리자 승인 → `forbidden`.
- [ ] Step 2~5 → Commit `feat(db): add join request lifecycle with single-membership guarantee`

### Task 11: 관리자 위임·탈퇴·보관·설정 예약 (0003_groups.sql 3/3)

**Interfaces:**
- `transfer_admin(p_group_id, p_to_user_id)`: 관리자 검증 → `select ... for update` 두 멤버십 → 같은 UPDATE 문 하나로 role 교체(`update memberships set role = case when user_id=p_to then 'admin' else 'member' end where ...`) — 부분 유니크 인덱스는 문 단위 검사이므로 한 문장으로 처리.
- `leave_group()`: 활성 멤버십 조회 for update → 관리자이고 다른 활성 멤버가 있으면 `transfer_required` → left_at=app.now() → 현재 open/closing 주차 week_members.left_during_week=true(eligible은 유지) → 마지막 멤버였으면 groups.archived_at=app.now().
- `rename_group(p_group_id, p_name)`.
- `schedule_group_settings(p_group_id, p_target_meters, p_penalty)`: 관리자 → `insert ... on conflict (group_id, effective_week_start) do update` with effective_week_start = 다음 주 월요일.
- `get_scheduled_settings(p_group_id)` 조회는 RLS select로 대체(group_settings select 정책: 활성 멤버).

- [ ] Step 1 테스트: (a) 위임 후 admin 정확히 1명; (b) 관리자가 멤버 있는 상태로 leave → `transfer_required`; (c) 멤버 leave 후 left_at 설정·week_members left_during_week=true·eligible 불변; (d) 마지막 관리자 leave → archived_at 설정, 이후 request_join → `group_archived`; (e) 설정 예약 두 번 → 다음 주 행 1개, 마지막 값.
- [ ] Step 2~5 → Commit `feat(db): add admin transfer, leave, archive, and settings scheduling`

### Task 12: 그룹 UI (메인 미참여 상태·생성·초대·관리자 참여 요청·설정·탈퇴)

**Files:** `src/app/page.tsx`(상태 분기: 미참여/요청 중/거절/참여 → 단계 4 전까지는 참여 시 임시 placeholder), `src/app/groups/new/page.tsx`, `src/app/join/[code]/page.tsx`, `src/app/admin/page.tsx`(탭: 참여 요청·기록 검토(단계 3)·멤버·그룹 설정), `src/components/admin/{JoinRequests,MemberList,GroupSettings}.tsx`, `src/actions/{group,join}.ts`, `src/app/profile/page.tsx`에 탈퇴 모달 추가

**Interfaces:** actions `createGroup`, `requestJoin(code)`, `cancelJoinRequest(id)`, `reviewJoinRequest(id, approve)`, `transferAdmin(userId)`, `leaveGroup()`, `renameGroup(name)`, `scheduleSettings(target, penalty)`, `regenerateInvite()`. 모두 zod 검증 → `supabase.rpc` → `revalidatePath('/')`. 초대 링크 `${SITE_URL}/join/${code}`, 복사 버튼. `/join/[code]` 비로그인 시 `로그인/가입` 버튼에 `returnTo=/join/[code]`.

- [ ] 구현 → 수동 검증: 사용자 2명 브라우저 프로필로 가입→그룹 생성→초대 링크로 두 번째 사용자 요청→승인→멤버 목록 확인 → `npm run verify` → Commit `feat: add group creation, invite, join review, and settings UI`

## 단계 3 — 기록

### Task 13: 업로드 슬롯·기록 제출 함수 (0004_records.sql 1/3)

**Files:** `supabase/migrations/0004_records.sql`, `src/actions/record.ts`; Test `tests/integration/records.test.ts`

**Interfaces:**
- `create_upload_slot(p_content_type text, p_byte_size int) returns table(upload_id uuid, storage_path text)`: 활성 멤버, 허용 MIME(jpeg/png/webp), size ≤ 10485760 → pending_uploads insert(expires_at = now+1h, path `evidence/{group}/{user}/{id}.jpg`). 클라이언트는 이 경로로 storage 직접 업로드.
- `submit_record(p_submission_key text, p_distance_meters int, p_memo text, p_upload_ids uuid[]) returns uuid`: `pg_advisory_xact_lock(hashtext(auth.uid()::text||p_submission_key))` → 기존 (user, submission_key) 있으면 그 id 반환(멱등) → 활성 멤버, 그룹 미보관 → `activity_date = app.kst_today()`, 주차 `app.week_start_of(app.now())` → `ensure_group_week`(단계 5에서 정의; 이 단계에서는 group_weeks 조회로 대체하고 없으면 `week_not_open`) → 주차 state='open' 검증 → 사진 1~5, 각 upload 소유·ready·미만료 확인, storage.objects에 실제 존재·size 확인 → running_records insert(pending) → record_photos insert(order) → pending_uploads delete → record_reviews(null→pending) → 관리자 알림 `'record_submitted:'||id`.
- `mark_upload_ready(p_upload_id)`: storage.objects 존재 확인 후 ready=true, byte_size 갱신.
- 서버 액션 `submitRecord`: zod(distance 문자열 → parseDistanceToMeters, memo, uploadIds 1~5, submissionKey uuid) → rpc.

- [ ] Step 1 테스트: (a) 슬롯 2개 생성→storage 업로드(테스트 fixture 작은 JPEG 바이트)→ready→submit → 기록 pending, 사진 2개, pending_uploads 0건; (b) 같은 submission_key로 재호출 → 같은 id, 기록 1건; (c) 업로드 없이 submit → `photos_required`; (d) 다른 사용자의 upload_id → `upload_not_owned`; (e) ready=false → `upload_not_ready`; (f) 6장 → `too_many_photos`; (g) fake_now를 일요일 23:59 KST로 두면 activity_date=일요일·주차=지난 월요일, 월요일 00:00 → 새 주차.
- [ ] Step 2~5 → Commit `feat(db): add upload slots and idempotent record submission`

### Task 14: 기록 수정·삭제·재제출·검토 (0004_records.sql 2/3)

**Interfaces:**
- `update_record(p_record_id, p_distance_meters, p_memo, p_upload_ids uuid[] /* 유지할 기존 photo path는 별도 */, p_keep_photo_ids uuid[], p_expected_version int)`: 작성자, status in (pending, rejected), `activity_date = app.kst_today()`, 주차 open → 사진 총 1~5 → 제거된 사진 storage 삭제 목록 반환(서버 액션이 admin 클라이언트로 삭제) → status=pending, version+1 → review 이력 `(rejected→pending)` 또는 `(pending→pending)`.
- `delete_record(p_record_id)`: 동일 조건, 행 삭제 + 사진 경로 반환.
- `review_record(p_record_id, p_action text /* approve|reject|unapprove */, p_reason text, p_expected_version int)`: 관리자 → `select ... for update` 기록과 group_weeks 행 → `version <> expected` → `stale_version`; approve: status pending, 주차 open 또는 (closing and app.now() < deadline) → approved; reject: pending → rejected(reason 필수); unapprove: approved, 주차 미확정 → pending(reason 필수) → record_reviews insert → 작성자 알림 `'record_review:'||id||':'||new_version` → 주차가 closing이고 그룹의 pending이 0이면 `finalize_week(week_id)`(단계 5; 이 단계에서는 존재하면 호출하도록 `perform` 을 `to_regprocedure` 검사로 감싼다 — 단계 5에서 실제 함수 추가 시 이 검사를 제거).
- 승인 마감 이후(closing이고 now ≥ deadline)는 `review_closed`.

- [ ] Step 1 테스트: (a) 승인 → approved, review 이력, 알림; (b) 작성자가 수정한 뒤 옛 version으로 승인 → `stale_version`; (c) 관리자 자기 기록 승인 성공; (d) 일반 멤버 승인 → `forbidden`; (e) 반려 사유 없음 → `reason_required`; (f) 승인 취소 → pending, 합계 반영은 조회 함수 테스트에서; (g) 어제 기록(fake_now 다음날) 수정 → `edit_window_closed`; (h) closing 주차 월요일 11:59 승인 OK, 12:00 → `review_closed`.
- [ ] Step 2~5 → Commit `feat(db): add record edit/delete and admin review with version check`

### Task 15: 댓글 (0004_records.sql 3/3)

**Interfaces:** `add_comment(p_record_id, p_body) returns uuid` (활성 멤버, 1~1000자, rate limit 분당 30), `delete_comment(p_comment_id)` (본인 또는 관리자 → deleted_at, deleted_by; body는 `''`로 비움). comments select 정책은 이미 활성 멤버; UI는 deleted_at 행을 `삭제된 댓글`로 표시하지 않고 제외.

- [ ] Step 1 테스트: (a) 작성·조회 순서 오래된 순; (b) 타인 댓글 삭제 → `forbidden`, 관리자 삭제 성공, body 빈 문자열; (c) 1001자 → 오류; (d) 탈퇴 후 comments select 0건.
- [ ] Step 2~5 → Commit `feat(db): add comments`

### Task 16: 기록 UI (등록 폼·상세·라이트박스·댓글·관리자 검토)

**Files:** `src/components/record/{RecordForm,PhotoPicker,PhotoLightbox,RecordDetail,CommentList}.tsx`, `src/app/records/[id]/page.tsx`, `src/components/admin/ReviewQueue.tsx`, `src/actions/{record,review,comment}.ts`, `src/app/page.tsx`에 오늘의 기록 영역 삽입

**Interfaces:**
- `RecordForm` (client): 상태 `photos: { localId, file, previewUrl, uploadId?, status: 'processing'|'uploading'|'ready'|'error', error? }[]`, `distance`, `memo`, `submissionKey = crypto.randomUUID()`(마운트 시 생성, 성공 후 재생성). 흐름: 파일 선택 → `processImageFile` → 서버 액션 `createUploadSlot(contentType, size)` → 브라우저 `supabase.storage.from('evidence').uploadToSignedUrl` 또는 `upload(path)` → `markUploadReady(uploadId)` → ready. 실패 파일만 `재시도` 버튼. 순서 변경 ↑↓ 버튼, 삭제. 모든 ready일 때만 제출 활성화. 제출 응답이 `date_changed`(서버 오늘 ≠ 폼이 연 날짜)이면 안내 후 재확인. 성공 시 `router.refresh()`.
- `/records/[id]`: 서버에서 기록 + 사진 서명 URL(60초) + 댓글 + 상태 안내(반려 사유·승인 취소 사유·기한 만료). `?week=`와 `from=/` 쿼리를 받아 뒤로가기 링크 구성. 직접 진입 시 `/`.
- `ReviewQueue`: pending 오래된 순, 사진 썸네일·확대, 승인/반려(사유 입력 모달), version을 hidden으로 전달.

- [ ] 구현 → 수동 검증(모바일 뷰포트: 사진 3장 등록, 반려→수정→재제출→승인) → `npm run verify` → Commit `feat: add record submission, detail, comments, and review UI`

## 단계 4 — 대시보드

### Task 17: 대시보드 조회 함수 (0005_dashboard.sql)

**Files:** `supabase/migrations/0005_dashboard.sql`; Test `tests/integration/dashboard.test.ts`

**Interfaces:**
- `get_week_dashboard(p_group_id uuid, p_week_start date) returns jsonb`: 활성 멤버 검증 → 주차 행(없고 p_week_start가 현재 주면 `ensure_group_week` 호출 — 단계 5 전에는 group_weeks 조회) → 반환:
```json
{ "week": { "id", "weekStart", "state", "targetMeters", "penalty", "finalizedAt", "groupName" },
  "me": { "approvedMeters", "pendingMeters", "remainingMeters", "eligible" },
  "members": [ { "userId", "nickname", "avatarPath", "eligible", "joinedThisWeek", "leftDuringWeek",
                 "days": [ { "date", "approvedMeters", "pendingMeters", "recordIds": [] } ]  // 7개, 월~일
               , "approvedMeters", "rank", "outcome" } ],
  "pendingCount", "provisional": true|false }
```
  - 확정 주차(state finalized)는 `weekly_results` 스냅샷(nickname_snapshot, rank, outcome, total)을 사용하고, 미확정 주차는 실시간 approved 합계로 `rank`를 SQL `rank() over (order by approved desc)`로 계산(eligible=true만 순위 대상, 나머지 null). `outcome`: 미확정이면 `provisional_success|provisional_fail|pending_review(개인 pending 있음)|not_evaluated`.
  - 그룹 생성 전 주차 요청 → `week_not_found`.
- `get_available_weeks(p_group_id) returns date[]` (생성 주부터 현재 주까지).

- [ ] Step 1 테스트: 3명(2 eligible, 1 joined_this_week) 기록 세팅 → (a) 승인 합계만 approvedMeters, pending 별도; (b) rank 1,2,2,4 케이스(4명 eligible); (c) 준비 주간 멤버 rank null; (d) 다른 그룹 멤버 호출 → `forbidden`; (e) days 배열 길이 7, 날짜 월~일.
- [ ] Step 2~5 → Commit `feat(db): add weekly dashboard query`

### Task 18: 대시보드 UI

**Files:** `src/app/page.tsx`(참여 상태 본문), `src/components/dashboard/{WeekNav,MyProgress,WeekCalendar,RankList}.tsx`, `src/components/layout/AppHeader.tsx`(알림·프로필·관리자 버튼과 대기 건수 배지)

**Interfaces:** `?week=YYYY-MM-DD`(월요일 아님 → 그 주 월요일로 정규화 리디렉션, 미래 → 이번 주). WeekNav: 이전/범위/다음/이번 주(다음 주 버튼은 현재 주에서 비활성). MyProgress: 승인/목표 막대(100% 상한, 초과분 텍스트), 남은 거리, 대기 거리 문구. WeekCalendar: 멤버 행 × 월~일 열, 셀에 승인 합계와 `+대기` 표기, 셀 탭 → 해당 날짜 기록 목록(같은 날 여러 건이면 바텀시트에서 선택) → `/records/[id]?week=&from=/`. 탈퇴·준비 주간 배지. 상단 `오늘 기록 올리기` → 지난주 조회 중이면 `?week=이번주#today`로 이동 후 토스트 `오늘 기록은 이번 주에 등록됩니다`. 스크롤 복원: `sessionStorage['scroll:/?week=..']`에 저장, 복귀 시 복원.

- [ ] 구현 → 수동 검증 → `npm run verify` → Commit `feat: add weekly dashboard with calendar, progress, and ranking`

## 단계 5 — 주간 집계

### Task 19: 주차 생성·평가 대상 스냅샷 (0006_weeks.sql 1/3)

**Files:** `supabase/migrations/0006_weeks.sql`; Test `tests/integration/weeks.test.ts`

**Interfaces:**
- `ensure_group_week(p_group_id uuid, p_week_start date) returns uuid` (`security definer`, 내부용): `pg_advisory_xact_lock(hashtext(p_group_id::text||p_week_start::text))` → 존재하면 id 반환 → 아니면 유효 설정 = `group_settings where effective_week_start <= p_week_start order by desc limit 1` → group_weeks insert(open) → week_members: `memberships where joined_at < week_start_utc and (left_at is null or left_at >= week_start_utc)` → eligible=true; `joined_at >= week_start_utc and left_at is null` → eligible=false, joined_this_week=true. 그룹 생성 주차보다 앞선 week_start → `before_group_created`.
- Task 13·17의 임시 group_weeks 조회를 이 함수 호출로 교체.
- `week_start_utc = (p_week_start::text || ' 00:00 Asia/Seoul')::timestamptz`.

- [ ] Step 1 테스트: (a) fake_now를 수요일로 두고 멤버 B 참여 → 다음 주 월요일 ensure → B eligible=true; (b) 예약 실행이 늦어 수요일에 처음 ensure해도 월요일 시점 기준으로 A eligible, 화요일 참여 C joined_this_week; (c) 월요일 이전 탈퇴자 미포함, 화요일 탈퇴자 eligible=true; (d) 예약 설정이 있으면 새 주차 target/penalty 반영; (e) 동시 호출 2회 → 행 1개.
- [ ] Step 2~5 → Commit `feat(db): add week creation with eligibility snapshot`

### Task 20: 주간 마감·확정 (0006_weeks.sql 2/3)

**Interfaces:**
- `finalize_week(p_week_id uuid)`: `select ... for update` group_weeks, state ∈ (open, closing) → pending 남아 있으면 (now ≥ deadline이면 모두 expired + review 이력 + 작성자 알림 `'record_expired:'||id`, 아니면 `pending_remaining` 예외) → 합계: eligible 여부 무관 approved 합계 → weekly_results: 모든 week_members에 대해 total, `eligible`, rank(eligible만 `rank() over`), outcome(eligible: total ≥ target → success/fail; 아니면 not_evaluated), nickname_snapshot → group_weeks: state finalized, finalized_at, group_name_snapshot, group_total_meters → 참여자 전원(week_members) 알림 `'week_final:'||week_id`.
- `close_week_if_due(p_week_id)`: state open이고 now ≥ 주 종료(다음 월요일 00:00 KST) → pending 0이면 finalize, 있으면 state closing + 관리자 알림 `'review_reminder:'||week_id||':00'`. state closing이고 now ≥ 11:00이면 알림 `':11'`, now ≥ deadline이면 finalize.
- `run_week_maintenance() returns jsonb` (`{ "createdWeeks": n, "closed": n, "finalized": n, "weekIds": [] }`): 보관 여부 무관 모든 그룹의 open/closing 주차에 `close_week_if_due`; 미보관 그룹은 현재 주 `ensure_group_week`. 그룹당 `pg_advisory_xact_lock`으로 중복 실행 방지. 로그는 `app.maintenance_runs(id, started_at, finished_at, result jsonb, error text)`.
- Task 14 `review_record`의 임시 `to_regprocedure` 검사를 제거하고 직접 `finalize_week` 호출.

- [ ] Step 1 테스트(각 시나리오 fake_now 사용): (a) 일요일 기록 pending 상태로 월요일 00:30 maintenance → closing, 관리자 알림 ':00' 1건, 재실행해도 1건; (b) 11:30 실행 → ':11' 알림 1건; (c) 11:59 승인 → pending 0 → 즉시 finalized, 일요일 기록 지난주에 반영; (d) 12:00 실행 → pending expired, finalized, 결과에 0km 평가 대상자 fail 포함; (e) 확정 후 review_record → `week_finalized`; (f) 확정 후 그룹명·닉네임 변경해도 스냅샷 불변; (g) 평가 대상 0명 주차도 확정되고 결과 outcome 전부 not_evaluated; (h) 순위 1,2,2,4; (i) 두 번 finalize 호출 → 두 번째 `already_finalized`; (j) 보관 그룹의 open 주차도 마감됨.
- [ ] Step 2~5 → Commit `feat(db): add week closing, expiry, finalization, and maintenance`

### Task 21: 알림 UI와 읽음 처리

**Files:** `src/app/notifications/page.tsx`, `src/actions/notification.ts`, `AppHeader` 미읽음 배지; `supabase/migrations/0007_notifications_summary.sql` 1/2: `mark_notifications_read(p_ids uuid[])`, `get_notifications(limit, before)`(타입별 링크 대상 조회: join_request→/admin, join_result→/, record_*→/records/[id] (탈퇴로 조회 불가 시 링크 없음), review_reminder→/admin, week_final→/?week=).

- [ ] 통합 테스트 `notifications.test.ts`: (a) 같은 event_key 두 번 → 1건; (b) 타인 알림 update 0 rows; (c) 탈퇴 후 record 알림의 target 조회가 RLS로 막혀 링크 null.
- [ ] 구현 → Commit `feat: add in-app notifications`

### Task 22: Cron 엔드포인트와 조회 시 복구

**Files:** `src/app/api/cron/weekly/route.ts`, `vercel.json`, `src/lib/supabase/admin.ts` 사용

**Interfaces:** `GET /api/cron/weekly`: `Authorization: Bearer ${CRON_SECRET}` 검증(불일치 401) → admin 클라이언트 `rpc('run_week_maintenance')` → 결과 JSON 응답, `console.log` 에 `{ startedAt, finishedAt, result }`만 기록. `vercel.json`: `{"crons":[{"path":"/api/cron/weekly","schedule":"*/5 * * * *"}]}`. **요금제 확인 결과(Global Constraints 참고):** Hobby에서는 이 스케줄이 배포 실패한다. 배포 시 사용자가 (1) Pro 업그레이드, (2) Hobby 유지 + Supabase `pg_cron`으로 `select run_week_maintenance()` 5분 주기 실행(추가 마이그레이션 `0008_pg_cron.sql`, 클라우드에서만 활성화), (3) Hobby 유지 + 하루 1회 cron 중 택일. 기본 제안은 (2). 어느 경우든 대시보드 조회(`get_week_dashboard`)가 현재 주 `ensure_group_week`와 지난 주 `close_week_if_due`를 호출하므로 화면 전환·마감 판정은 예약 지연과 무관하다.

- [ ] 테스트: Vitest에서 route handler를 직접 import해 401/200 확인. → Commit `feat: add weekly maintenance cron endpoint`

### Task 23: 주간 요약 카드·자동 표시·PNG 저장 (0007 2/2)

**Files:** `supabase/migrations/0007_notifications_summary.sql` 2/2, `src/components/summary/{SummaryCard,SummaryAutoShow,SummaryExport}.tsx`, `src/actions/summary.ts`, `src/app/page.tsx`에 마운트

**Interfaces:**
- `get_week_summary(p_group_id, p_week_start) returns jsonb`: 그룹명(확정이면 스냅샷), 기간, provisional 여부, 목표, 벌칙, 내 결과, 멤버 목록(닉네임·거리·순위·outcome·준비주간), 성공자/실패자, 그룹 합계, 성공 인원/평가 대상 수(0명이면 `evaluatedCount=0` → UI `평가 대상 없음`).
- `claim_summary_auto_show() returns jsonb|null`: 직전 종료 주차(현재 주 − 1주)에 대해 호출자가 week_members에 있고 현재 활성 멤버이며 weekly_summary_views 없음 → `insert ... on conflict do nothing returning` → 삽입됐을 때만 요약 반환, 아니면 null. 반환에 `provisional` 포함. 잠정 표시 후 확정 시 재팝업 없음은 이 claim 1회 규칙으로 자동 충족.
- `SummaryAutoShow`(client): 마운트, `visibilitychange`(visible), 그리고 KST 날짜 변경 감지(1분 간격으로 `kstDateOf(new Date())` 비교) 시 `claimSummaryAutoShow()` 호출 → 결과 있으면 모달로 `SummaryCard` 표시.
- `SummaryExport`: `html-to-image`의 `toPng`로 카드 DOM을 PNG(2x)로 변환 → `<a download>`가 iOS Safari에서 막히면 새 탭에서 이미지 열기 안내. 멤버 12명 단위 페이지, 페이지마다 헤더 반복, 페이지별 PNG.
- 과거 주차 대시보드에 `주간 요약 보기` 버튼.

- [ ] 통합 테스트 `summary.test.ts`: (a) claim 첫 호출 반환, 두 번째 null; (b) 동시 2회 호출 → 1회만 반환; (c) 주중 참여자(week_members 있음) 대상, 미참여자 null; (d) 탈퇴자 null; (e) 여러 주 미접속 → 직전 주만.
- [ ] 구현 → 수동: 카드 렌더·PNG 저장 → Commit `feat: add weekly summary card with one-time auto show and PNG export`

## 단계 6 — PWA 및 배포 검증

### Task 24: 매니페스트·아이콘·서비스 워커·오프라인·설치 안내

**Files:** `src/app/manifest.ts`, `public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png`(sharp 스크립트 `scripts/gen-icons.ts`로 SVG에서 생성), `src/app/sw.ts`, `next.config.ts`(serwist), `src/app/offline/page.tsx`, `src/components/pwa/{InstallPrompt,UpdateNotice}.tsx`, `src/app/layout.tsx`(apple-touch-icon, theme-color, viewport-fit=cover)

**Interfaces:** manifest: name `우리들의 러닝일지`, short_name `러닝일지`, id/start_url/scope `/`, display standalone, lang ko-KR, theme_color/background_color `#0f172a`/`#ffffff`(globals.css와 일치). SW(serwist): precache 빌드 정적 자산만; 런타임 캐시는 `/_next/static`, `/icons`, 폰트만 CacheFirst; 그 외(`/`, `/api`, `/records`, supabase 도메인, `_rsc` 파라미터) NetworkOnly; navigation 실패 시 `/offline` fallback; `skipWaiting=false`, 새 SW 대기 시 `UpdateNotice`가 `새 버전이 있습니다` 배너와 `새로고침` 버튼 표시(작성 중 자동 새로고침 없음). InstallPrompt: `beforeinstallprompt` 캡처 시 설치 버튼; iOS Safari(`navigator.standalone===false` && iOS UA)는 공유→홈 화면에 추가 안내; `display-mode: standalone`이면 숨김; 닫으면 `localStorage['install-dismissed']=1`.

- [ ] 검증: `npm run build && npm start` → Chrome Lighthouse PWA 설치 가능, 오프라인 전환 시 `/offline` 표시, 로그인 응답이 캐시 스토리지에 없음(DevTools Application). → Commit `feat: add PWA manifest, service worker, offline page, and install prompt`

### Task 25: E2E 핵심 흐름 (Playwright)

**Files:** `playwright.config.ts`, `tests/e2e/core-flow.spec.ts`, `tests/e2e/fixtures/photo.jpg`, `src/test/e2e-helpers.ts`(admin API로 사용자 생성·이메일 확인 처리)

**시나리오:** 사용자 A 가입(admin API로 confirm)→온보딩→그룹 생성→초대 코드 복사; 사용자 B 로그인→`/join/[code]`→요청; A 승인; B 기록 등록(사진 1장, 5.00km); A 검토 승인; 대시보드에 B 승인 5.00 표시, 진행률 갱신. 모바일 뷰포트(iPhone 14 프리셋).

- [ ] 구현 → `npm run test:e2e` PASS → Commit `test: add Playwright core flow`

### Task 26: README·배포 준비·최종 검증

**Files:** `README.md`, `docs/deploy.md`, `supabase/seed.sql`(데모 그룹·회원 3명·기록, 로컬 전용), `.github/workflows/ci.yml`(typecheck·lint·unit·build; integration은 supabase CLI 서비스 컨테이너로)

**README 내용(스펙 12절):** 로컬 실행, 마이그레이션 적용(`supabase link --project-ref` → `supabase db push`), Vercel 프로젝트 생성·환경 변수(Preview/Production 분리, Preview는 개발 Supabase), Supabase Auth Site URL·Redirect URLs(`https://<domain>/auth/callback`, `https://*-<team>.vercel.app/auth/callback`), 이메일 템플릿(확인·재설정) 확인, Cron 요금제 선택(Task 22의 3안), 예약 작업 검증(`curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/weekly`), 장애 시 수동 재실행(같은 curl 또는 SQL `select run_week_maintenance()`), 로그 확인(`app.maintenance_runs`).

**사용자에게 필요한 값 목록(최종 보고에 포함):** 클라우드 Supabase 개발·운영 프로젝트 URL/키 2세트, Vercel 계정·팀·프로젝트, 운영 도메인, CRON_SECRET 생성값, Vercel 요금제 결정.

- [ ] `npm run verify` 및 `npm run test:integration` 전체 PASS, 실제 모바일 검증 항목(설치 흐름·카메라 촬영·HEIC)은 사용자 기기 필요로 미완료로 보고.
- [ ] Commit `docs: add deployment guide, seed data, and CI`

## 스펙 대조 (자체 검토)

| 스펙 절 | 태스크 |
|---|---|
| 1 필수 범위 | 7(인증), 8(프로필), 9~12(그룹), 13~16(기록·댓글), 17~18(대시보드), 19~23(집계·알림·요약), 24(PWA) |
| 2 정책표 | 3(거리·주차 상수), 4(제약·시각), 13(오늘만·사진 수), 14(자기 승인), 19(준비 주간·설정 예약), 20(유예·만료·확정 불가), 23(자동 요약 1회) |
| 3 생명주기 | 6(returnTo), 7~8, 9~12 |
| 4 화면·탐색 | 12, 16, 18 |
| 5 기록 | 8(이미지 처리), 13~16 |
| 6 관리자·알림 | 12, 16, 21 |
| 7 집계·요약 | 17, 19, 20, 23 |
| 8 기술 구조 | 1, 6, 22 |
| 9 데이터 모델 | 4 |
| 10 권한 | 5, 8, 13 |
| 11 PWA | 24 |
| 12 배포·예약 | 22, 26 |
| 13 산출물 | 26 |
| 14 인수 테스트 | 각 태스크 테스트 + 25 |
