# 러너 유형(뱃지)·벌금 계산 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 멤버를 열정/자유/부상 세 유형으로 나눠 유형별로 주간 성공·실패와 벌금 금액을 자동 계산하고, 방장만 바꿀 수 있는 스티커 뱃지로 표시한다. 기존 휴식 기능은 부상 유형으로 흡수한다.

**Architecture:** 모든 상태 변경과 판정은 Postgres `security definer` 함수 안에서 한다(기존 패턴). 판정 규칙은 SQL `app.evaluate` 한 곳에 두고 마감(`finalize_week`)과 대시보드 잠정 결과가 같이 쓴다. 같은 규칙을 TS `src/lib/domain/penalty.ts`에 복제해 화면 계산과 교차 테스트에 쓴다. 유형은 `memberships.runner_type`에 두고 주차마다 `week_members.runner_type`로 스냅샷한다. UI는 `RunnerBadge` SVG 하나를 `Avatar`에 얹어 모든 화면이 공유한다.

**Tech Stack:** Next.js 16 App Router(TypeScript strict), Tailwind 4, Supabase(Postgres/plpgsql, RLS), Vitest(단위·통합, 로컬 Supabase), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-runner-types-design.md`

## Global Constraints

- 유형 코드는 `passion` / `free` / `injured`, 한글 라벨은 `열정러너` / `자유러너` / `부상러너`.
- 신규 멤버 기본 유형 `passion`. 유형 변경은 진행 중 `open` 주에 즉시 반영, `closing`/`finalized` 주의 스냅샷은 건드리지 않는다.
- 벌금: 미달분 `ceil((goal - total) / 1000) × penalty_per_km_won`. 승인 합계 0m이면 `zero_km_penalty_won`으로 **대체**. 목표 달성·부상은 0원.
- 순위는 `eligible and runner_type = 'passion'`인 멤버끼리만. 자유·부상·이번 주 가입자는 `rank = null`.
- 기본값: `free_min_meters 5000`, `penalty_per_km_won 10000`, `zero_km_penalty_won 100000`. 금액 범위 0 ~ 10,000,000, 거리 범위 1 ~ 1,000,000m.
- `penalty` 텍스트는 nullable 선택 메모(1~500자 또는 null).
- 확정 결과(`weekly_results`)는 불변. 기존 확정 행의 `penalty_won`은 0.
- 모든 서버 액션은 zod 검증 후 `rpc` 호출, 에러는 `messageForError`.
- 마이그레이션 변경 후 `npm run db:reset && npm run db:types`로 `src/lib/db/types.ts` 재생성, 마지막에 `docs/all-migrations.sql` 재생성.
- 이 저장소는 `main`에 직접 푸시하지 않는다. 브랜치 `feat/runner-types`에서 작업하고 PR로 올린다.
- 커밋 메시지는 한국어 `type: 요약` 형식, 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **0.1km 미달 같은 경계값**: 14.9km는 1km 미달로 10,000원이어야 한다(올림). → Task 1 단위 테스트, Task 3 SQL 교차 테스트.
2. **자유러너 0m**: km당 계산(5km × 10,000 = 50,000)이 아니라 고정 100,000원이어야 한다. → Task 1, Task 3.
3. **마감 직전 유형 변경**: `closing` 주에 유형을 바꿔도 그 주 스냅샷·결과는 바뀌지 않아야 한다. → Task 3 통합 테스트.
4. **기존 create_group 호출 호환**: 새 인자에 기본값이 있어 기존 테스트·데모 시드가 그대로 동작해야 한다. → Task 2에서 기존 통합 테스트 전체 실행.
5. **옛 휴식 알림 행**: `rest_*` 알림이 남아 있어도 알림 목록이 깨지지 않고 고정 문구로 보여야 한다. → Task 3 통합 테스트(옛 알림 행을 직접 insert), Task 4 단위 테스트.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/domain/runner-type.ts` (신규) | `RunnerType` 타입, 라벨·설명 상수, 유형 목록 |
| `src/lib/domain/penalty.ts` (신규) | `evaluate()` 순수 판정·벌금 계산, `formatWon()` |
| `supabase/migrations/0015_runner_types.sql` (신규) | 스키마·데이터 이전·휴식 제거·`app.evaluate`·함수 재정의 |
| `src/lib/db/types.ts` (재생성) | Supabase 타입 |
| `src/actions/member.ts` (신규) | `setMemberRunnerType` 서버 액션 |
| `src/actions/group.ts` (수정) | 설정 숫자 3개·선택 메모 |
| `src/actions/rest.ts` (삭제) | |
| `src/lib/domain/validation.ts` (수정) | `penaltyNoteSchema`, `wonSchema` |
| `src/lib/errors.ts`, `src/lib/notification-text.ts` (수정) | 문구 |
| `src/lib/group-state.ts`, `src/lib/dashboard/shell.ts`, `src/lib/dashboard/types.ts` (수정) | JSON 타입 |
| `src/components/ui/RunnerBadge.tsx` (신규) | SVG 스티커 뱃지 |
| `src/components/ui/Avatar.tsx` (수정) | `badge` prop |
| `src/components/ui/RestChip.tsx` (삭제) | |
| `src/components/dashboard/WeekTrack.tsx`, `MemberModal.tsx` (수정) | 뱃지·목표·벌금 표시 |
| `src/components/admin/MemberList.tsx`, `GroupSettings.tsx` (수정), `RestRequests.tsx` (삭제) | 유형 변경·설정 폼 |
| `src/app/admin/page.tsx`, `src/app/(tabs)/group/page.tsx`, `src/app/groups/new/NewGroupForm.tsx`, `src/app/join/[code]/page.tsx`, `src/components/group/NoGroupHome.tsx`, `src/app/profile/page.tsx` (수정), `src/app/profile/RestSection.tsx` (삭제), `src/app/profile/MyRunnerType.tsx` (신규) | 화면 |
| `src/components/summary/SummaryCard.tsx` (수정) | 벌금 합계 |
| `tests/unit/penalty.test.ts` (신규), `tests/unit/notification-text.test.ts` (수정) | 단위 |
| `tests/integration/runner-types.test.ts` (신규), `tests/integration/rest.test.ts` (삭제) | 통합 |
| `tests/e2e/core-flow.spec.ts` (수정) | e2e |
| `README.md`, `docs/all-migrations.sql` (수정) | 문서 |

---

### Task 1: 도메인 순수 로직 — 유형 상수와 벌금 계산

**Files:**
- Create: `src/lib/domain/runner-type.ts`
- Create: `src/lib/domain/penalty.ts`
- Test: `tests/unit/penalty.test.ts`

**Interfaces:**
- Produces:
  - `type RunnerType = 'passion' | 'free' | 'injured'`
  - `RUNNER_TYPES: readonly RunnerType[]`, `RUNNER_TYPE_LABEL: Record<RunnerType, string>`, `RUNNER_TYPE_SHORT: Record<RunnerType, string>` (뱃지 글자 `열정`/`자유`/`부상`), `RUNNER_TYPE_DESC: Record<RunnerType, string>`
  - `type EvalSettings = { targetMeters: number; freeMinMeters: number; penaltyPerKmWon: number; zeroKmPenaltyWon: number }`
  - `type Evaluation = { outcome: 'success' | 'fail' | 'not_evaluated'; penaltyWon: number; ranked: boolean; goalMeters: number | null }`
  - `evaluate(type: RunnerType, totalMeters: number, s: EvalSettings): Evaluation`
  - `goalFor(type: RunnerType, s: Pick<EvalSettings, 'targetMeters' | 'freeMinMeters'>): number | null`
  - `formatWon(won: number): string` → `'30,000원'`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/penalty.test.ts
import { describe, it, expect } from 'vitest';
import { evaluate, goalFor, formatWon } from '@/lib/domain/penalty';
import { RUNNER_TYPE_LABEL, RUNNER_TYPES } from '@/lib/domain/runner-type';

const S = { targetMeters: 15000, freeMinMeters: 5000, penaltyPerKmWon: 10000, zeroKmPenaltyWon: 100000 };

describe('evaluate', () => {
  it('passion: success at or above target, no penalty, ranked', () => {
    expect(evaluate('passion', 15000, S)).toEqual({ outcome: 'success', penaltyWon: 0, ranked: true, goalMeters: 15000 });
    expect(evaluate('passion', 20000, S)).toMatchObject({ outcome: 'success', penaltyWon: 0 });
  });
  it('passion: shortfall rounds up per started km', () => {
    expect(evaluate('passion', 12300, S)).toMatchObject({ outcome: 'fail', penaltyWon: 30000 });
    expect(evaluate('passion', 14900, S)).toMatchObject({ outcome: 'fail', penaltyWon: 10000 });
    expect(evaluate('passion', 14000, S)).toMatchObject({ outcome: 'fail', penaltyWon: 10000 });
    expect(evaluate('passion', 13999, S)).toMatchObject({ outcome: 'fail', penaltyWon: 20000 });
  });
  it('0m replaces per-km with the flat zero-km penalty for passion and free', () => {
    expect(evaluate('passion', 0, S)).toMatchObject({ outcome: 'fail', penaltyWon: 100000 });
    expect(evaluate('free', 0, S)).toMatchObject({ outcome: 'fail', penaltyWon: 100000 });
  });
  it('free: weekly total vs free minimum, never ranked', () => {
    expect(evaluate('free', 5000, S)).toEqual({ outcome: 'success', penaltyWon: 0, ranked: false, goalMeters: 5000 });
    expect(evaluate('free', 2500, S)).toMatchObject({ outcome: 'fail', penaltyWon: 30000, ranked: false });
  });
  it('injured: not evaluated, zero penalty, no goal', () => {
    expect(evaluate('injured', 0, S)).toEqual({ outcome: 'not_evaluated', penaltyWon: 0, ranked: false, goalMeters: null });
    expect(evaluate('injured', 99000, S)).toMatchObject({ outcome: 'not_evaluated', penaltyWon: 0 });
  });
  it('zero per-km rate yields zero penalty but still fails', () => {
    expect(evaluate('passion', 1000, { ...S, penaltyPerKmWon: 0 })).toMatchObject({ outcome: 'fail', penaltyWon: 0 });
  });
});

describe('goalFor / formatWon / labels', () => {
  it('goalFor', () => {
    expect(goalFor('passion', S)).toBe(15000);
    expect(goalFor('free', S)).toBe(5000);
    expect(goalFor('injured', S)).toBeNull();
  });
  it('formatWon', () => {
    expect(formatWon(0)).toBe('0원');
    expect(formatWon(30000)).toBe('30,000원');
    expect(formatWon(1234567)).toBe('1,234,567원');
  });
  it('labels cover every type', () => {
    expect(RUNNER_TYPES).toEqual(['passion', 'free', 'injured']);
    expect(RUNNER_TYPE_LABEL).toEqual({ passion: '열정러너', free: '자유러너', injured: '부상러너' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/penalty.test.ts`
Expected: FAIL — `Cannot find module '@/lib/domain/penalty'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/domain/runner-type.ts
/** 러너 유형. 방장만 바꿀 수 있고 주간 평가 규칙을 결정한다. */
export type RunnerType = 'passion' | 'free' | 'injured';

export const RUNNER_TYPES: readonly RunnerType[] = ['passion', 'free', 'injured'];

export const RUNNER_TYPE_LABEL: Record<RunnerType, string> = { passion: '열정러너', free: '자유러너', injured: '부상러너' };
/** 뱃지 안에 들어가는 두 글자 */
export const RUNNER_TYPE_SHORT: Record<RunnerType, string> = { passion: '열정', free: '자유', injured: '부상' };
export const RUNNER_TYPE_DESC: Record<RunnerType, string> = {
  passion: '주간 목표 거리를 채우고 순위 내기에 참여합니다. 미달 1km마다 벌금.',
  free: '순위 내기 없이 주간 최소 거리만 채웁니다. 미달 1km마다 벌금.',
  injured: '평가·순위·벌금에서 제외됩니다. 기록 등록은 할 수 있습니다.',
};

export function isRunnerType(v: unknown): v is RunnerType {
  return typeof v === 'string' && (RUNNER_TYPES as readonly string[]).includes(v);
}
```

```ts
// src/lib/domain/penalty.ts
import type { RunnerType } from './runner-type';

export type EvalSettings = { targetMeters: number; freeMinMeters: number; penaltyPerKmWon: number; zeroKmPenaltyWon: number };
export type Evaluation = { outcome: 'success' | 'fail' | 'not_evaluated'; penaltyWon: number; ranked: boolean; goalMeters: number | null };

/** 유형별 목표 거리(m). 부상은 목표 없음. */
export function goalFor(type: RunnerType, s: Pick<EvalSettings, 'targetMeters' | 'freeMinMeters'>): number | null {
  if (type === 'injured') return null;
  return type === 'free' ? s.freeMinMeters : s.targetMeters;
}

/**
 * 주간 판정·벌금. DB의 app.evaluate 와 반드시 같은 결과를 내야 한다 (통합 테스트가 교차 검증).
 * - 목표 이상: 성공, 0원
 * - 0m: 고정 0km 벌금 (km당 계산을 대체)
 * - 그 외: 미달분을 1km 단위로 올림 × km당 벌금
 */
export function evaluate(type: RunnerType, totalMeters: number, s: EvalSettings): Evaluation {
  const goalMeters = goalFor(type, s);
  const ranked = type === 'passion';
  if (goalMeters === null) return { outcome: 'not_evaluated', penaltyWon: 0, ranked, goalMeters };
  if (totalMeters >= goalMeters) return { outcome: 'success', penaltyWon: 0, ranked, goalMeters };
  if (totalMeters <= 0) return { outcome: 'fail', penaltyWon: s.zeroKmPenaltyWon, ranked, goalMeters };
  const shortKm = Math.ceil((goalMeters - totalMeters) / 1000);
  return { outcome: 'fail', penaltyWon: shortKm * s.penaltyPerKmWon, ranked, goalMeters };
}

export function formatWon(won: number): string {
  return `${Math.round(won).toLocaleString('ko-KR')}원`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/penalty.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/runner-type.ts src/lib/domain/penalty.ts tests/unit/penalty.test.ts
git commit -m "feat: 러너 유형 상수와 벌금 계산 도메인 로직

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 마이그레이션 1부 — 스키마, 데이터 이전, 휴식 제거, `app.evaluate`

**Files:**
- Create: `supabase/migrations/0015_runner_types.sql`
- Regenerate: `src/lib/db/types.ts`
- Delete: `tests/integration/rest.test.ts`
- Test: `tests/integration/runner-types.test.ts` (이 태스크에서는 `app.evaluate` 부분만)

**Interfaces:**
- Produces (DB): enum `public.runner_type`; 컬럼 `memberships.runner_type`, `week_members.runner_type`, `group_settings.{free_min_meters, penalty_per_km_won, zero_km_penalty_won}`, `group_weeks.{free_min_meters, penalty_per_km_won, zero_km_penalty_won}`, `weekly_results.penalty_won`; 함수 `app.evaluate(p_type runner_type, p_total int, p_target int, p_free_min int, p_per_km int, p_zero_won int) returns table(outcome result_outcome, penalty_won int, ranked boolean)`; 테스트 전용 래퍼 `public.test_evaluate(...)` (같은 인자, `authenticated`/`service_role`에 grant).
- Consumes: 없음.

사전 조건: `colima start && npm run db:start` 로 로컬 Supabase 가 떠 있어야 한다.

- [ ] **Step 1: Write the failing test (evaluate 교차 검증)**

```ts
// tests/integration/runner-types.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, expectRpcError, type TestUser } from '@/test/supabase-test';
import { uploadEvidence, submit } from '@/test/records-helpers';
import { evaluate } from '@/lib/domain/penalty';
import type { RunnerType } from '@/lib/domain/runner-type';

const S = { targetMeters: 15000, freeMinMeters: 5000, penaltyPerKmWon: 10000, zeroKmPenaltyWon: 100000 };

async function newMember(label: string): Promise<TestUser> {
  const u = await createTestUser(label);
  await completeProfile(u, label);
  return u;
}

describe('app.evaluate matches the TS evaluate()', () => {
  const admin = adminClient();
  beforeAll(async () => { await resetAll(); });

  it('agrees on a table of inputs', async () => {
    const cases: Array<[RunnerType, number]> = [
      ['passion', 0], ['passion', 1], ['passion', 12300], ['passion', 14000], ['passion', 14999], ['passion', 15000], ['passion', 30000],
      ['free', 0], ['free', 2500], ['free', 4999], ['free', 5000], ['free', 15000],
      ['injured', 0], ['injured', 15000],
    ];
    for (const [type, total] of cases) {
      const { data, error } = await admin.rpc('test_evaluate', {
        p_type: type, p_total: total, p_target: S.targetMeters, p_free_min: S.freeMinMeters, p_per_km: S.penaltyPerKmWon, p_zero_won: S.zeroKmPenaltyWon,
      });
      expect(error, `${type}/${total}`).toBeNull();
      const row = (data as Array<{ outcome: string; penalty_won: number; ranked: boolean }>)[0];
      const ts = evaluate(type, total, S);
      expect({ outcome: row.outcome, penaltyWon: row.penalty_won, ranked: row.ranked }, `${type}/${total}`)
        .toEqual({ outcome: ts.outcome, penaltyWon: ts.penaltyWon, ranked: ts.ranked });
    }
  });
});
```

- [ ] **Step 2: Delete the old rest test and run the new one to see it fail**

```bash
git rm tests/integration/rest.test.ts
npx vitest run tests/integration/runner-types.test.ts
```
Expected: FAIL — `test_evaluate` 함수 없음 (PostgREST 404 / "Could not find the function").

- [ ] **Step 3: Write migration part 1**

```sql
-- supabase/migrations/0015_runner_types.sql : 러너 유형(열정/자유/부상)과 벌금 계산. 휴식 기능은 부상 유형으로 흡수.
--
-- 규칙
--  * memberships.runner_type 이 현재 유형, week_members.runner_type 은 주차 스냅샷. 유형 변경은 open 주에 즉시 반영.
--  * eligible = 주 시작 전 가입 and runner_type <> 'injured'. 순위는 eligible and passion 끼리만.
--  * 판정·벌금은 app.evaluate 한 곳에서. finalize_week 와 get_week_dashboard 가 같이 쓴다.
--  * 0m 는 km당 계산 대신 zero_km_penalty_won 고정액.

-- ---------------------------------------------------------------------------
-- 1. 타입·컬럼
-- ---------------------------------------------------------------------------
create type public.runner_type as enum ('passion', 'free', 'injured');

alter table public.memberships add column runner_type public.runner_type not null default 'passion';
alter table public.week_members add column runner_type public.runner_type not null default 'passion';

alter table public.group_settings
  add column free_min_meters     integer not null default 5000   check (free_min_meters between 1 and 1000000),
  add column penalty_per_km_won  integer not null default 10000  check (penalty_per_km_won between 0 and 10000000),
  add column zero_km_penalty_won integer not null default 100000 check (zero_km_penalty_won between 0 and 10000000);
alter table public.group_settings alter column penalty drop not null;
alter table public.group_settings drop constraint if exists group_settings_penalty_check;
alter table public.group_settings add constraint group_settings_penalty_check
  check (penalty is null or char_length(penalty) between 1 and 500);

alter table public.group_weeks
  add column free_min_meters     integer not null default 5000,
  add column penalty_per_km_won  integer not null default 10000,
  add column zero_km_penalty_won integer not null default 100000;
alter table public.group_weeks alter column penalty drop not null;

alter table public.weekly_results add column penalty_won integer not null default 0;

-- ---------------------------------------------------------------------------
-- 2. 휴식 → 부상 이전, 휴식 기능 제거
-- ---------------------------------------------------------------------------
update public.memberships set runner_type = 'injured' where rest_started_at is not null and left_at is null;
update public.week_members set runner_type = 'injured' where resting;

drop function if exists public.request_rest(text);
drop function if exists public.cancel_rest_request(uuid);
drop function if exists public.end_my_rest();
drop function if exists public.review_rest_request(uuid, boolean);
drop function if exists public.set_member_rest(uuid, uuid, boolean);
drop function if exists app.set_rest(uuid, uuid, boolean);
drop table if exists public.rest_requests;
alter table public.memberships drop column rest_started_at;
alter table public.week_members drop column resting;

-- ---------------------------------------------------------------------------
-- 3. 판정·벌금 단일 출처
-- ---------------------------------------------------------------------------
create or replace function app.evaluate(
  p_type public.runner_type, p_total int, p_target int, p_free_min int, p_per_km int, p_zero_won int
) returns table (outcome public.result_outcome, penalty_won int, ranked boolean)
language sql immutable as $$
  with g as (select case when p_type = 'free' then p_free_min else p_target end as goal)
  select
    case when p_type = 'injured' then 'not_evaluated'::public.result_outcome
         when p_total >= g.goal then 'success'::public.result_outcome
         else 'fail'::public.result_outcome end,
    case when p_type = 'injured' or p_total >= g.goal then 0
         when p_total <= 0 then p_zero_won
         else (ceil((g.goal - p_total) / 1000.0)::int) * p_per_km end,
    (p_type = 'passion')
  from g;
$$;

-- 테스트에서 TS 구현과 교차 검증하기 위한 공개 래퍼
create or replace function public.test_evaluate(
  p_type public.runner_type, p_total int, p_target int, p_free_min int, p_per_km int, p_zero_won int
) returns table (outcome public.result_outcome, penalty_won int, ranked boolean)
language sql stable security definer set search_path = public, app as $$
  select * from app.evaluate(p_type, p_total, p_target, p_free_min, p_per_km, p_zero_won);
$$;
grant execute on function public.test_evaluate(public.runner_type, int, int, int, int, int) to authenticated, service_role;
```

- [ ] **Step 4: Reset DB, regenerate types, run the test**

```bash
npm run db:reset && npm run db:types
npx vitest run tests/integration/runner-types.test.ts
```
Expected: `db reset` 성공, 테스트 PASS (1 test).

- [ ] **Step 5: Run the whole integration suite to confirm nothing else broke yet**

Run: `npm run test:integration`
Expected: `rest.test.ts`는 삭제됐으므로 없음. 나머지는 PASS 해야 한다. (`get_week_dashboard` 등은 아직 옛 정의지만 `resting` 컬럼을 참조하므로 **실패할 수 있다**. 실패하는 파일 이름을 기록해 두고 Task 3 끝에서 다시 돌린다. 실패가 `column wm.resting does not exist` 류이면 예상된 것이다.)

- [ ] **Step 6: Typecheck will fail (expected) — commit the migration anyway as WIP of the DB layer**

Run: `npm run typecheck`
Expected: `rest_requests`, `rest_started_at`, `set_member_rest` 참조 때문에 FAIL. Task 4~8에서 고친다.

```bash
git add supabase/migrations/0015_runner_types.sql src/lib/db/types.ts tests/integration/runner-types.test.ts
git commit -m "feat(db): 러너 유형 스키마·휴식 데이터 이전·app.evaluate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 마이그레이션 2부 — 함수 재정의와 통합 테스트

**Files:**
- Modify: `supabase/migrations/0015_runner_types.sql` (이어서 추가)
- Regenerate: `src/lib/db/types.ts`
- Test: `tests/integration/runner-types.test.ts` (추가)

**Interfaces:**
- Produces (DB, PostgREST로 호출):
  - `public.create_group(p_name text, p_target_meters int, p_penalty text default null, p_free_min_meters int default 5000, p_penalty_per_km_won int default 10000, p_zero_km_penalty_won int default 100000) returns table(group_id uuid, invite_code text)`
  - `public.schedule_group_settings(p_group_id uuid, p_target_meters int, p_penalty text default null, p_free_min_meters int default 5000, p_penalty_per_km_won int default 10000, p_zero_km_penalty_won int default 100000) returns date`
  - `public.set_member_runner_type(p_group_id uuid, p_user_id uuid, p_type public.runner_type) returns void` — 오류 코드 `forbidden`, `not_member`, `same_runner_type`
  - `public.lookup_invite(p_code text) returns table(group_id, name, target_meters, penalty, archived, free_min_meters, penalty_per_km_won, zero_km_penalty_won)`
  - `public.get_my_group_state()` → `membership.runnerType`, `pendingRequest.{freeMinMeters, penaltyPerKmWon, zeroKmPenaltyWon}`; `resting`/`restStartedAt`/`pendingRestRequest` 제거
  - `public.get_week_dashboard()` → `week.{freeMinMeters, penaltyPerKmWon, zeroKmPenaltyWon, penalty(null 가능)}`, 멤버 `{runnerType, goalMeters, penaltyWon}` 추가 / `resting`,`restingNow` 제거, `me.{runnerType, goalMeters, penaltyWon}`
  - `public.get_week_summary()` → `penaltyTotalWon` 추가
  - 알림 종류 `runner_type_changed` (meta `{type, groupName, nickname}`, link `/profile`); 옛 `rest_*` 종류는 meta `{legacy: true}`

- [ ] **Step 1: Write the failing tests**

`tests/integration/runner-types.test.ts`에 아래를 **추가**한다 (기존 import·`S`·`newMember` 재사용).

```ts
async function setupGroup(tag: string, opts: Partial<{ target: number; freeMin: number; perKm: number; zero: number }> = {}) {
  const owner = await newMember('own-' + tag);
  const g = (await owner.client.rpc('create_group', {
    p_name: '유형' + tag, p_target_meters: opts.target ?? 15000, p_penalty: null,
    p_free_min_meters: opts.freeMin ?? 5000, p_penalty_per_km_won: opts.perKm ?? 10000, p_zero_km_penalty_won: opts.zero ?? 100000,
  })).data![0];
  const join = async (label: string) => {
    const u = await newMember(label + '-' + tag);
    const req = await u.client.rpc('request_join', { p_code: g.invite_code });
    await owner.client.rpc('review_join_request', { p_request_id: req.data, p_approve: true });
    return u;
  };
  return { owner, join, groupId: g.group_id as string, inviteCode: g.invite_code as string };
}

async function approveAll(owner: TestUser, groupId: string) {
  const admin = adminClient();
  const { data } = await admin.from('running_records').select('id, version').eq('group_id', groupId).eq('status', 'pending');
  for (const r of data ?? []) {
    const res = await owner.client.rpc('review_record', { p_record_id: r.id, p_action: 'approve', p_reason: null, p_expected_version: r.version });
    expect(res.error).toBeNull();
  }
}

describe('runner types: settings, snapshot, evaluation, finalize', () => {
  const admin = adminClient();
  beforeAll(async () => { await resetAll(); });

  it('create_group stores the numeric rules and defaults; old 3-arg call still works', async () => {
    await setFakeNow('2026-09-02T03:00:00Z');
    const { groupId, inviteCode } = await setupGroup('a', { target: 20000, freeMin: 6000, perKm: 5000, zero: 50000 });
    const s = (await admin.from('group_settings').select('*').eq('group_id', groupId).single()).data!;
    expect(s).toMatchObject({ target_meters: 20000, free_min_meters: 6000, penalty_per_km_won: 5000, zero_km_penalty_won: 50000, penalty: null });
    const w = (await admin.from('group_weeks').select('*').eq('group_id', groupId).single()).data!;
    expect(w).toMatchObject({ target_meters: 20000, free_min_meters: 6000, penalty_per_km_won: 5000, zero_km_penalty_won: 50000 });
    const inv = (await admin.rpc('lookup_invite', { p_code: inviteCode })).data![0];
    expect(inv).toMatchObject({ target_meters: 20000, free_min_meters: 6000, penalty_per_km_won: 5000, zero_km_penalty_won: 50000, penalty: null });

    const legacyOwner = await newMember('legacy');
    const legacy = await legacyOwner.client.rpc('create_group', { p_name: '옛호출', p_target_meters: 10000, p_penalty: '커피' });
    expect(legacy.error).toBeNull();
    const ls = (await admin.from('group_settings').select('*').eq('group_id', legacy.data![0].group_id).single()).data!;
    expect(ls).toMatchObject({ penalty: '커피', free_min_meters: 5000, penalty_per_km_won: 10000, zero_km_penalty_won: 100000 });
    const blank = await (await newMember('blank')).client.rpc('create_group', { p_name: '빈메모', p_target_meters: 10000, p_penalty: '   ' });
    expect(blank.error).toBeNull();
    expect((await admin.from('group_settings').select('penalty').eq('group_id', blank.data![0].group_id).single()).data!.penalty).toBeNull();
  });

  it('schedule_group_settings takes the numbers; invalid won is rejected', async () => {
    await setFakeNow('2026-09-02T03:00:00Z');
    const { owner, groupId } = await setupGroup('b');
    const ok = await owner.client.rpc('schedule_group_settings', { p_group_id: groupId, p_target_meters: 12000, p_penalty: '정산은 일요일', p_free_min_meters: 4000, p_penalty_per_km_won: 20000, p_zero_km_penalty_won: 150000 });
    expect(ok.error).toBeNull();
    expect(ok.data).toBe('2026-09-07');
    const next = (await admin.from('group_settings').select('*').eq('group_id', groupId).eq('effective_week_start', '2026-09-07').single()).data!;
    expect(next).toMatchObject({ target_meters: 12000, penalty: '정산은 일요일', free_min_meters: 4000, penalty_per_km_won: 20000, zero_km_penalty_won: 150000 });
    expectRpcError(await owner.client.rpc('schedule_group_settings', { p_group_id: groupId, p_target_meters: 12000, p_penalty_per_km_won: -1 }), 'invalid_input');
    expectRpcError(await owner.client.rpc('schedule_group_settings', { p_group_id: groupId, p_target_meters: 12000, p_free_min_meters: 0 }), 'invalid_input');
  });

  it('new members default to passion; admin changes type with immediate open-week effect; member notified', async () => {
    await setFakeNow('2026-09-02T03:00:00Z'); // prep week 08-31
    const { owner, join, groupId } = await setupGroup('c');
    const m = await join('mem');
    expect((await admin.from('memberships').select('runner_type').eq('user_id', m.id).single()).data!.runner_type).toBe('passion');

    await setFakeNow('2026-09-09T03:00:00Z'); // week 09-07, both eligible
    const before = (await m.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' })).data as {
      me: { eligible: boolean; runnerType: string; goalMeters: number | null; penaltyWon: number };
      members: Array<{ userId: string; runnerType: string; eligible: boolean; rank: number | null; outcome: string; goalMeters: number | null; penaltyWon: number }>;
      week: { freeMinMeters: number; penaltyPerKmWon: number; zeroKmPenaltyWon: number; penalty: string | null };
    };
    expect(before.me).toMatchObject({ eligible: true, runnerType: 'passion', goalMeters: 15000, penaltyWon: 100000 });
    expect(before.week).toMatchObject({ freeMinMeters: 5000, penaltyPerKmWon: 10000, zeroKmPenaltyWon: 100000, penalty: null });

    expectRpcError(await m.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: owner.id, p_type: 'free' }), 'forbidden');
    expectRpcError(await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: m.id, p_type: 'passion' }), 'same_runner_type');
    const stranger = await newMember('str-c');
    expectRpcError(await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: stranger.id, p_type: 'free' }), 'not_member');

    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: m.id, p_type: 'free' })).error).toBeNull();
    const asFree = (await m.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' })).data as typeof before;
    expect(asFree.me).toMatchObject({ eligible: true, runnerType: 'free', goalMeters: 5000, penaltyWon: 100000 });
    const row = asFree.members.find((x) => x.userId === m.id)!;
    expect(row).toMatchObject({ runnerType: 'free', eligible: true, rank: null, outcome: 'provisional_fail' });
    const ownerRow = asFree.members.find((x) => x.userId === owner.id)!;
    expect(ownerRow).toMatchObject({ runnerType: 'passion', rank: 1 });

    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: m.id, p_type: 'injured' })).error).toBeNull();
    const asInjured = (await m.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' })).data as typeof before;
    expect(asInjured.me).toMatchObject({ eligible: false, runnerType: 'injured', goalMeters: null, penaltyWon: 0 });
    expect(asInjured.members.find((x) => x.userId === m.id)).toMatchObject({ eligible: false, rank: null, outcome: 'not_evaluated' });

    const state = (await m.client.rpc('get_my_group_state')).data as { membership: { runnerType: string } };
    expect(state.membership.runnerType).toBe('injured');

    const feed = (await m.client.rpc('get_notifications')).data as Array<{ type: string; meta: Record<string, unknown>; link: string | null }>;
    const changes = feed.filter((n) => n.type === 'runner_type_changed');
    expect(changes).toHaveLength(2);
    expect(changes[0].meta).toMatchObject({ type: 'injured', groupName: '유형c', nickname: 'mem-c' });
    expect(changes[0].link).toBe('/profile');
    // 관리자 본인 변경은 알림 없음
    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: owner.id, p_type: 'free' })).error).toBeNull();
    expect((await admin.from('notifications').select('id').eq('user_id', owner.id).eq('type', 'runner_type_changed')).data).toHaveLength(0);

    // 다음 주 스냅샷도 현재 유형을 따른다
    await setFakeNow('2026-09-16T03:00:00Z');
    const next = (await m.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-14' })).data as typeof before;
    expect(next.me).toMatchObject({ eligible: false, runnerType: 'injured' });
    expect(next.members.find((x) => x.userId === owner.id)).toMatchObject({ runnerType: 'free', rank: null });
  });

  it('finalize: per-type outcome, penalty_won, ranks only among passion; closing-week change does not alter snapshot', async () => {
    await setFakeNow('2026-09-02T03:00:00Z');
    const { owner, join, groupId } = await setupGroup('d');
    const p1 = await join('p1'); const p2 = await join('p2'); const fr = await join('fr'); const inj = await join('inj');
    await setFakeNow('2026-09-03T03:00:00Z');
    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: fr.id, p_type: 'free' })).error).toBeNull();
    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: inj.id, p_type: 'injured' })).error).toBeNull();

    await setFakeNow('2026-09-09T03:00:00Z'); // week 09-07 open
    await submit(p1, 20000, await uploadEvidence(p1, 1));   // passion success
    await submit(p2, 12300, await uploadEvidence(p2, 1));   // passion fail: 2.7km short → 30,000
    await submit(fr, 2500, await uploadEvidence(fr, 1));    // free fail: 2.5km short → 30,000
    await submit(inj, 9000, await uploadEvidence(inj, 1));  // injured: not evaluated
    // owner: passion 0m → 100,000
    await approveAll(owner, groupId);

    await setFakeNow('2026-09-14T15:30:00Z'); // Tue 00:30 KST → closing
    await admin.rpc('run_week_maintenance');
    const weekId = (await admin.from('group_weeks').select('id, state').eq('group_id', groupId).eq('week_start', '2026-09-07').single()).data!;
    expect(weekId.state).toBe('closing');
    // closing 주에 유형을 바꿔도 스냅샷은 그대로
    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: p2.id, p_type: 'injured' })).error).toBeNull();
    expect((await admin.from('week_members').select('runner_type, eligible').eq('week_id', weekId.id).eq('user_id', p2.id).single()).data).toMatchObject({ runner_type: 'passion', eligible: true });

    await setFakeNow('2026-09-15T03:30:00Z'); // Tue 12:30 KST → finalize
    await admin.rpc('run_week_maintenance');
    expect((await admin.from('group_weeks').select('state').eq('id', weekId.id).single()).data!.state).toBe('finalized');
    const rows = (await admin.from('weekly_results').select('user_id, outcome, penalty_won, rank, eligible').eq('week_id', weekId.id)).data!;
    const by = Object.fromEntries(rows.map((r) => [r.user_id, r]));
    expect(by[p1.id]).toMatchObject({ outcome: 'success', penalty_won: 0, rank: 1, eligible: true });
    expect(by[p2.id]).toMatchObject({ outcome: 'fail', penalty_won: 30000, rank: 2, eligible: true });
    expect(by[owner.id]).toMatchObject({ outcome: 'fail', penalty_won: 100000, rank: 3, eligible: true });
    expect(by[fr.id]).toMatchObject({ outcome: 'fail', penalty_won: 30000, rank: null, eligible: true });
    expect(by[inj.id]).toMatchObject({ outcome: 'not_evaluated', penalty_won: 0, rank: null, eligible: false });

    const dash = (await owner.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' })).data as { members: Array<{ userId: string; penaltyWon: number; outcome: string; rank: number | null }> };
    const d = Object.fromEntries(dash.members.map((m) => [m.userId, m]));
    expect(d[p2.id]).toMatchObject({ penaltyWon: 30000, outcome: 'fail', rank: 2 });
    expect(d[fr.id]).toMatchObject({ penaltyWon: 30000, outcome: 'fail', rank: null });
    expect(dash.members.map((m) => m.userId).slice(0, 3)).toEqual([p1.id, p2.id, owner.id]); // 열정 순위순이 먼저

    const summary = (await owner.client.rpc('get_week_summary', { p_group_id: groupId, p_week_start: '2026-09-07' })).data as { penaltyTotalWon: number; successCount: number; evaluatedCount: number };
    expect(summary).toMatchObject({ penaltyTotalWon: 160000, successCount: 1, evaluatedCount: 4 });
  });

  it('legacy rest notifications still render through notification_view', async () => {
    await setFakeNow('2026-09-02T03:00:00Z');
    const { owner, groupId } = await setupGroup('e');
    const ins = await admin.from('notifications').insert({ user_id: owner.id, group_id: groupId, event_key: 'rest_result:legacy-1', type: 'rest_result', target_id: owner.id });
    expect(ins.error).toBeNull();
    const feed = (await owner.client.rpc('get_notifications')).data as Array<{ type: string; meta: Record<string, unknown>; link: string | null }>;
    const n = feed.find((x) => x.type === 'rest_result')!;
    expect(n.meta).toEqual({ legacy: true });
    expect(n.link).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run tests/integration/runner-types.test.ts`
Expected: 첫 describe PASS, 두 번째 describe FAIL (`set_member_runner_type` 없음, `create_group` 인자 불일치 등).

- [ ] **Step 3: Append the function redefinitions to the migration**

`supabase/migrations/0015_runner_types.sql` 끝에 추가:

```sql
-- ---------------------------------------------------------------------------
-- 4. 주 생성 스냅샷: 유형 복사, 부상은 평가 제외
-- ---------------------------------------------------------------------------
create or replace function app.ensure_group_week(p_group_id uuid, p_week_start date) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_id uuid;
  v_created timestamptz;
  s record;
  v_ws timestamptz := app.week_start_utc(p_week_start);
begin
  select id into v_id from public.group_weeks where group_id = p_group_id and week_start = p_week_start;
  if v_id is not null then return v_id; end if;

  perform pg_advisory_xact_lock(hashtext('week:' || p_group_id::text || ':' || p_week_start::text));
  select id into v_id from public.group_weeks where group_id = p_group_id and week_start = p_week_start;
  if v_id is not null then return v_id; end if;

  select created_at into v_created from public.groups where id = p_group_id;
  if v_created is null then perform app.fail('not_found'); end if;
  if app.week_start_of(v_created) > p_week_start then perform app.fail('before_group_created'); end if;

  select target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won into s from public.group_settings
  where group_id = p_group_id and effective_week_start <= p_week_start
  order by effective_week_start desc limit 1;
  if s.target_meters is null then
    select target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won into s from public.group_settings
    where group_id = p_group_id order by effective_week_start asc limit 1;
  end if;

  insert into public.group_weeks (group_id, week_start, target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won, state)
  values (p_group_id, p_week_start, s.target_meters, s.penalty, s.free_min_meters, s.penalty_per_km_won, s.zero_km_penalty_won, 'open')
  returning id into v_id;

  insert into public.week_members (week_id, user_id, eligible, joined_this_week, left_during_week, runner_type)
  select v_id, m.user_id,
         (m.joined_at < v_ws and m.runner_type <> 'injured'),
         (m.joined_at >= v_ws),
         (m.left_at is not null),
         m.runner_type
  from public.memberships m
  where m.group_id = p_group_id
    and m.joined_at < app.week_end_utc(p_week_start)
    and (m.left_at is null or m.left_at >= v_ws)
  on conflict (week_id, user_id) do nothing;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 5. 유형 변경 (관리자 전용). open 주에 즉시 반영, 본인에게 알림.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_runner_type(p_group_id uuid, p_user_id uuid, p_type public.runner_type) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  m public.memberships%rowtype;
  v_now timestamptz := app.now();
  v_week date := app.week_start_of(v_now);
  v_ws timestamptz := app.week_start_utc(v_week);
  w public.group_weeks%rowtype;
begin
  if not app.is_group_admin(p_group_id) then perform app.fail('forbidden'); end if;
  select * into m from public.memberships where group_id = p_group_id and user_id = p_user_id and left_at is null for update;
  if m.id is null then perform app.fail('not_member'); end if;
  if m.runner_type = p_type then perform app.fail('same_runner_type'); end if;

  update public.memberships set runner_type = p_type where id = m.id;

  perform app.ensure_group_week(p_group_id, v_week);
  select * into w from public.group_weeks where group_id = p_group_id and week_start = v_week;
  if w.state = 'open' then
    update public.week_members
       set runner_type = p_type,
           eligible = (p_type <> 'injured') and (m.joined_at < v_ws)
     where week_id = w.id and user_id = p_user_id;
  end if;

  if p_user_id <> uid then
    perform app.notify(p_user_id, p_group_id,
      'runner_type_changed:' || m.id::text || ':' || p_type::text || ':' || extract(epoch from v_now)::bigint::text,
      'runner_type_changed', m.id);
  end if;
end $$;
grant execute on function public.set_member_runner_type(uuid, uuid, public.runner_type) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. 그룹 생성·설정 예약·초대 조회: 숫자 3개 추가, 메모는 선택
-- ---------------------------------------------------------------------------
drop function if exists public.create_group(text, int, text);
create or replace function public.create_group(
  p_name text, p_target_meters int, p_penalty text default null,
  p_free_min_meters int default 5000, p_penalty_per_km_won int default 10000, p_zero_km_penalty_won int default 100000
) returns table (group_id uuid, invite_code text)
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_profile();
  v_name text := btrim(p_name);
  v_penalty text := nullif(btrim(coalesce(p_penalty, '')), '');
  v_gid uuid;
  v_code text := app.new_invite_code();
  v_week date := app.week_start_of(app.now());
begin
  if v_name is null or char_length(v_name) not between 2 and 30 then perform app.fail('invalid_input'); end if;
  if v_penalty is not null and char_length(v_penalty) > 500 then perform app.fail('invalid_input'); end if;
  if p_target_meters is null or p_target_meters not between 1 and 1000000 then perform app.fail('invalid_input'); end if;
  if p_free_min_meters is null or p_free_min_meters not between 1 and 1000000 then perform app.fail('invalid_input'); end if;
  if p_penalty_per_km_won is null or p_penalty_per_km_won not between 0 and 10000000 then perform app.fail('invalid_input'); end if;
  if p_zero_km_penalty_won is null or p_zero_km_penalty_won not between 0 and 10000000 then perform app.fail('invalid_input'); end if;

  perform pg_advisory_xact_lock(hashtext('user:' || uid::text));
  if exists (select 1 from public.memberships m where m.user_id = uid and m.left_at is null) then perform app.fail('already_in_group'); end if;
  if exists (select 1 from public.join_requests j where j.user_id = uid and j.status = 'pending') then perform app.fail('pending_request_exists'); end if;

  insert into public.groups (name, created_at) values (v_name, app.now()) returning id into v_gid;
  insert into public.group_settings (group_id, effective_week_start, target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won)
  values (v_gid, v_week, p_target_meters, v_penalty, p_free_min_meters, p_penalty_per_km_won, p_zero_km_penalty_won);
  insert into public.memberships (group_id, user_id, role, joined_at) values (v_gid, uid, 'admin', app.now());
  insert into public.group_invites (group_id, code_hash) values (v_gid, app.hash_code(v_code));
  perform app.ensure_group_week(v_gid, v_week);

  group_id := v_gid; invite_code := v_code;
  return next;
end $$;
grant execute on function public.create_group(text, int, text, int, int, int) to authenticated;

drop function if exists public.schedule_group_settings(uuid, int, text);
create or replace function public.schedule_group_settings(
  p_group_id uuid, p_target_meters int, p_penalty text default null,
  p_free_min_meters int default 5000, p_penalty_per_km_won int default 10000, p_zero_km_penalty_won int default 100000
) returns date
language plpgsql security definer set search_path = public, app as $$
declare
  v_next date := app.week_start_of(app.now()) + 7;
  v_penalty text := nullif(btrim(coalesce(p_penalty, '')), '');
begin
  perform app.require_user();
  if not app.is_group_admin(p_group_id) then perform app.fail('forbidden'); end if;
  if p_target_meters is null or p_target_meters not between 1 and 1000000 then perform app.fail('invalid_input'); end if;
  if p_free_min_meters is null or p_free_min_meters not between 1 and 1000000 then perform app.fail('invalid_input'); end if;
  if p_penalty_per_km_won is null or p_penalty_per_km_won not between 0 and 10000000 then perform app.fail('invalid_input'); end if;
  if p_zero_km_penalty_won is null or p_zero_km_penalty_won not between 0 and 10000000 then perform app.fail('invalid_input'); end if;
  if v_penalty is not null and char_length(v_penalty) > 500 then perform app.fail('invalid_input'); end if;
  insert into public.group_settings (group_id, effective_week_start, target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won)
  values (p_group_id, v_next, p_target_meters, v_penalty, p_free_min_meters, p_penalty_per_km_won, p_zero_km_penalty_won)
  on conflict (group_id, effective_week_start) do update
    set target_meters = excluded.target_meters, penalty = excluded.penalty,
        free_min_meters = excluded.free_min_meters, penalty_per_km_won = excluded.penalty_per_km_won, zero_km_penalty_won = excluded.zero_km_penalty_won;
  return v_next;
end $$;
grant execute on function public.schedule_group_settings(uuid, int, text, int, int, int) to authenticated;

drop function if exists public.lookup_invite(text);
create or replace function public.lookup_invite(p_code text)
returns table (group_id uuid, name text, target_meters int, penalty text, archived boolean, free_min_meters int, penalty_per_km_won int, zero_km_penalty_won int)
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.rate_limit('invite:' || coalesce(auth.uid()::text, app.request_ip()), 20, interval '1 minute');
  return query
    select g.id, g.name, s.target_meters, s.penalty, (g.archived_at is not null), s.free_min_meters, s.penalty_per_km_won, s.zero_km_penalty_won
    from public.group_invites i
    join public.groups g on g.id = i.group_id
    join lateral (
      select gs.target_meters, gs.penalty, gs.free_min_meters, gs.penalty_per_km_won, gs.zero_km_penalty_won from public.group_settings gs
      where gs.group_id = g.id and gs.effective_week_start <= app.week_start_of(app.now())
      order by gs.effective_week_start desc limit 1
    ) s on true
    where i.code_hash = app.hash_code(p_code);
end $$;
grant execute on function public.lookup_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. 내 상태
-- ---------------------------------------------------------------------------
create or replace function public.get_my_group_state() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare uid uuid := auth.uid(); res jsonb;
begin
  if uid is null then return null; end if;
  select jsonb_build_object(
    'membership', (select jsonb_build_object('groupId', m.group_id, 'role', m.role, 'groupName', g.name, 'archived', g.archived_at is not null,
                                             'notice', g.notice, 'noticeUpdatedAt', g.notice_updated_at, 'runnerType', m.runner_type)
                   from public.memberships m join public.groups g on g.id = m.group_id where m.user_id = uid and m.left_at is null),
    'pendingRequest', (select jsonb_build_object('id', j.id, 'groupId', j.group_id, 'groupName', g.name, 'targetMeters', s.target_meters, 'penalty', s.penalty,
                                                 'freeMinMeters', s.free_min_meters, 'penaltyPerKmWon', s.penalty_per_km_won, 'zeroKmPenaltyWon', s.zero_km_penalty_won)
                       from public.join_requests j join public.groups g on g.id = j.group_id
                       join lateral (select gs.target_meters, gs.penalty, gs.free_min_meters, gs.penalty_per_km_won, gs.zero_km_penalty_won
                                     from public.group_settings gs where gs.group_id = g.id order by gs.effective_week_start desc limit 1) s on true
                       where j.user_id = uid and j.status = 'pending'),
    'lastRejected', (select jsonb_build_object('groupName', g.name, 'reviewedAt', j.reviewed_at)
                     from public.join_requests j join public.groups g on g.id = j.group_id
                     where j.user_id = uid and j.status = 'rejected' order by j.reviewed_at desc limit 1)
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- 8. 마감: app.evaluate 로 결과·벌금, 순위는 eligible 열정끼리
-- ---------------------------------------------------------------------------
create or replace function app.finalize_week(p_week_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  w public.group_weeks%rowtype;
  v_pending int;
  v_now timestamptz := app.now();
  v_group_name text;
  v_total int;
  rec record;
begin
  select * into w from public.group_weeks where id = p_week_id for update;
  if w.id is null then perform app.fail('not_found'); end if;
  if w.state = 'finalized' then perform app.fail('already_finalized'); end if;

  select count(*) into v_pending from public.running_records where week_id = w.id and status = 'pending';
  if v_pending > 0 then
    if v_now < app.week_close_deadline(w.week_start) then perform app.fail('pending_remaining'); end if;
    for rec in select id, user_id, group_id from public.running_records where week_id = w.id and status = 'pending' loop
      update public.running_records set status = 'expired', updated_at = v_now where id = rec.id;
      insert into public.record_reviews (record_id, actor_id, from_status, to_status, reason, created_at)
      values (rec.id, null, 'pending', 'expired', '검토 기한 만료', v_now);
      perform app.notify(rec.user_id, rec.group_id, 'record_expired:' || rec.id::text, 'record_expired', rec.id);
    end loop;
  end if;

  select name into v_group_name from public.groups where id = w.group_id;

  insert into public.weekly_results (week_id, user_id, total_meters, rank, outcome, eligible, nickname_snapshot, penalty_won)
  select w.id, t.user_id, t.total,
         case when t.eligible and t.ranked then rank() over (partition by (t.eligible and t.ranked) order by t.total desc) end,
         case when not t.eligible then 'not_evaluated'::public.result_outcome else t.outcome end,
         t.eligible,
         coalesce(p.nickname, '(이름 없음)'),
         case when t.eligible then t.penalty_won else 0 end
  from (
    select wm.user_id, wm.eligible, e.outcome, e.penalty_won, e.ranked, x.total
    from public.week_members wm
    cross join lateral (
      select coalesce((select sum(r.distance_meters) from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'approved'), 0)::int as total
    ) x
    cross join lateral app.evaluate(wm.runner_type, x.total, w.target_meters, w.free_min_meters, w.penalty_per_km_won, w.zero_km_penalty_won) e
    where wm.week_id = w.id
  ) t
  join public.profiles p on p.id = t.user_id
  on conflict (week_id, user_id) do nothing;

  select coalesce(sum(distance_meters), 0)::int into v_total from public.running_records where week_id = w.id and status = 'approved';

  update public.group_weeks
     set state = 'finalized', finalized_at = v_now, group_name_snapshot = v_group_name, group_total_meters = v_total
   where id = w.id;

  perform app.notify(wm.user_id, w.group_id, 'week_final:' || w.id::text, 'week_final', w.id)
  from public.week_members wm where wm.week_id = w.id;
end $$;

-- ---------------------------------------------------------------------------
-- 9. 대시보드: runnerType / goalMeters / penaltyWon, 정렬 열정→자유→부상→탈퇴
-- ---------------------------------------------------------------------------
create or replace function public.get_week_dashboard(p_group_id uuid, p_week_start date) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  uid uuid := app.require_user();
  w public.group_weeks%rowtype;
  v_current date := app.week_start_of(app.now());
  v_created date;
  v_days date[];
  members jsonb;
  me jsonb;
  v_pending int;
  v_name text;
begin
  if not app.is_active_member(p_group_id) then perform app.fail('forbidden'); end if;
  if extract(isodow from p_week_start) <> 1 then perform app.fail('invalid_input'); end if;
  if p_week_start > v_current then perform app.fail('invalid_input'); end if;
  select app.week_start_of(created_at) into v_created from public.groups where id = p_group_id;
  if p_week_start < v_created then perform app.fail('before_group_created'); end if;

  perform app.reconcile_group(p_group_id);
  select * into w from public.group_weeks where group_id = p_group_id and week_start = p_week_start;
  if w.id is null then
    perform app.ensure_group_week(p_group_id, p_week_start);
    perform app.close_week_if_due((select id from public.group_weeks where group_id = p_group_id and week_start = p_week_start));
    select * into w from public.group_weeks where group_id = p_group_id and week_start = p_week_start;
  end if;

  select array_agg(d::date order by d) into v_days from generate_series(p_week_start, p_week_start + 6, interval '1 day') d;
  select count(*) into v_pending from public.running_records where week_id = w.id and status = 'pending';
  select case when w.state = 'finalized' then w.group_name_snapshot else name end into v_name from public.groups where id = p_group_id;

  with base as (
    select wm.user_id, wm.eligible, wm.joined_this_week, wm.left_during_week, wm.runner_type,
           coalesce(wr.nickname_snapshot, p.nickname, '(이름 없음)') as nickname,
           p.avatar_path,
           (select coalesce(sum(r.distance_meters), 0)::int from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'approved') as approved,
           (select coalesce(sum(r.distance_meters), 0)::int from public.running_records r where r.week_id = w.id and r.user_id = wm.user_id and r.status = 'pending') as pending,
           wr.rank as final_rank, wr.outcome as final_outcome, wr.total_meters as final_total, wr.penalty_won as final_penalty,
           exists (select 1 from public.memberships m where m.group_id = p_group_id and m.user_id = wm.user_id and m.left_at is null) as active_now,
           case when wm.runner_type = 'injured' then null when wm.runner_type = 'free' then w.free_min_meters else w.target_meters end as goal_meters
    from public.week_members wm
    join public.profiles p on p.id = wm.user_id
    left join public.weekly_results wr on wr.week_id = w.id and wr.user_id = wm.user_id
    where wm.week_id = w.id
  ), evaluated as (
    select b.*, e.outcome as eval_outcome, e.penalty_won as eval_penalty, e.ranked
    from base b
    cross join lateral app.evaluate(b.runner_type, b.approved, w.target_meters, w.free_min_meters, w.penalty_per_km_won, w.zero_km_penalty_won) e
  ), ranked as (
    select b.*,
           case when w.state = 'finalized' then b.final_rank
                when b.eligible and b.ranked then rank() over (partition by (b.eligible and b.ranked) order by b.approved desc) end as rank_now,
           case when w.state = 'finalized' then b.final_outcome::text
                when not b.eligible then 'not_evaluated'
                when b.pending > 0 then 'pending_review'
                when b.eval_outcome = 'success' then 'provisional_success'
                else 'provisional_fail' end as outcome_now,
           case when w.state = 'finalized' then coalesce(b.final_penalty, 0)
                when not b.eligible then 0
                else b.eval_penalty end as penalty_now,
           case when b.left_during_week or not b.active_now then 3
                when b.eligible and b.runner_type = 'passion' then 0
                when b.eligible and b.runner_type = 'free' then 1
                else 2 end as sort_group
    from evaluated b
  )
  select jsonb_agg(jsonb_build_object(
    'userId', r.user_id, 'nickname', r.nickname, 'avatarPath', r.avatar_path,
    'eligible', r.eligible, 'joinedThisWeek', r.joined_this_week, 'leftDuringWeek', r.left_during_week, 'activeNow', r.active_now,
    'runnerType', r.runner_type, 'goalMeters', r.goal_meters, 'penaltyWon', r.penalty_now,
    'approvedMeters', case when w.state = 'finalized' then coalesce(r.final_total, r.approved) else r.approved end,
    'pendingMeters', r.pending, 'rank', r.rank_now, 'outcome', r.outcome_now,
    'days', (
      select jsonb_agg(jsonb_build_object(
        'date', d,
        'approvedMeters', coalesce((select sum(distance_meters) from public.running_records x where x.week_id = w.id and x.user_id = r.user_id and x.activity_date = d and x.status = 'approved'), 0),
        'pendingMeters', coalesce((select sum(distance_meters) from public.running_records x where x.week_id = w.id and x.user_id = r.user_id and x.activity_date = d and x.status = 'pending'), 0),
        'records', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'meters', x.distance_meters) order by x.created_at)
                             from public.running_records x where x.week_id = w.id and x.user_id = r.user_id and x.activity_date = d), '[]'::jsonb)
      ) order by d) from unnest(v_days) d
    )
  ) order by r.sort_group, (r.rank_now is null), r.rank_now, r.approved desc, r.nickname) into members from ranked r;

  select jsonb_build_object(
    'approvedMeters', coalesce((select sum(distance_meters) from public.running_records x where x.week_id = w.id and x.user_id = uid and x.status = 'approved'), 0),
    'pendingMeters', coalesce((select sum(distance_meters) from public.running_records x where x.week_id = w.id and x.user_id = uid and x.status = 'pending'), 0),
    'eligible', coalesce((select eligible from public.week_members where week_id = w.id and user_id = uid), false),
    'inWeek', exists (select 1 from public.week_members where week_id = w.id and user_id = uid),
    'runnerType', coalesce((select runner_type::text from public.week_members where week_id = w.id and user_id = uid), 'passion'),
    'goalMeters', (select m ->> 'goalMeters' from jsonb_array_elements(coalesce(members, '[]'::jsonb)) m where m ->> 'userId' = uid::text)::int,
    'penaltyWon', coalesce((select (m ->> 'penaltyWon')::int from jsonb_array_elements(coalesce(members, '[]'::jsonb)) m where m ->> 'userId' = uid::text), 0)
  ) into me;

  return jsonb_build_object(
    'week', jsonb_build_object('id', w.id, 'weekStart', w.week_start, 'state', w.state, 'targetMeters', w.target_meters, 'penalty', w.penalty,
                               'freeMinMeters', w.free_min_meters, 'penaltyPerKmWon', w.penalty_per_km_won, 'zeroKmPenaltyWon', w.zero_km_penalty_won,
                               'finalizedAt', w.finalized_at, 'groupName', v_name, 'groupTotalMeters', w.group_total_meters, 'isCurrent', w.week_start = v_current),
    'me', me,
    'members', coalesce(members, '[]'::jsonb),
    'pendingCount', v_pending,
    'provisional', w.state <> 'finalized',
    'today', app.kst_today()
  );
end $$;

-- ---------------------------------------------------------------------------
-- 10. 주간 요약: 벌금 합계
-- ---------------------------------------------------------------------------
create or replace function public.get_week_summary(p_group_id uuid, p_week_start date) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d jsonb; members jsonb; v_success int; v_eval int; v_total bigint; v_penalty bigint;
begin
  d := public.get_week_dashboard(p_group_id, p_week_start);
  members := d -> 'members';
  select count(*) filter (where (m ->> 'outcome') in ('success', 'provisional_success')),
         count(*) filter (where (m ->> 'eligible')::boolean),
         coalesce(sum((m ->> 'approvedMeters')::int), 0),
         coalesce(sum((m ->> 'penaltyWon')::int), 0)
    into v_success, v_eval, v_total, v_penalty
  from jsonb_array_elements(members) m;
  return d || jsonb_build_object(
    'successCount', v_success,
    'evaluatedCount', v_eval,
    'groupTotalMeters', coalesce((d -> 'week' ->> 'groupTotalMeters')::int, v_total::int),
    'penaltyTotalWon', v_penalty::int,
    'myUserId', auth.uid()
  );
end $$;

-- ---------------------------------------------------------------------------
-- 11. 알림 뷰: runner_type_changed 추가, 옛 rest_* 는 legacy 로
-- ---------------------------------------------------------------------------
create or replace function app.notification_view(n public.notifications, p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id', n.id, 'type', n.type, 'targetId', n.target_id, 'groupId', n.group_id, 'readAt', n.read_at, 'createdAt', n.created_at,
    'link', case n.type
      when 'join_request' then case when app.is_group_admin(n.group_id, p_uid) then '/admin?tab=requests' end
      when 'join_result' then '/'
      when 'runner_type_changed' then '/profile'
      when 'record_submitted' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'record_review' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'record_expired' then case when app.can_view_record(n.target_id, p_uid) then '/records/' || n.target_id::text end
      when 'review_reminder' then case when app.is_group_admin(n.group_id, p_uid) then '/admin?tab=reviews' end
      when 'week_final' then case when app.can_view_week(n.target_id, p_uid) then '/?week=' || (select week_start::text from public.group_weeks where id = n.target_id) end
    end,
    'meta', case n.type
      when 'join_request' then (select jsonb_build_object('nickname', p.nickname, 'groupName', g.name) from public.join_requests j join public.profiles p on p.id = j.user_id join public.groups g on g.id = j.group_id where j.id = n.target_id)
      when 'join_result' then (select jsonb_build_object('status', j.status, 'groupName', g.name) from public.join_requests j join public.groups g on g.id = j.group_id where j.id = n.target_id)
      when 'runner_type_changed' then (select jsonb_build_object('type', split_part(n.event_key, ':', 3), 'groupName', g.name, 'nickname', p.nickname)
                                       from public.memberships m join public.profiles p on p.id = m.user_id join public.groups g on g.id = m.group_id where m.id = n.target_id)
      when 'rest_request' then jsonb_build_object('legacy', true)
      when 'rest_result' then jsonb_build_object('legacy', true)
      when 'rest_changed' then jsonb_build_object('legacy', true)
      when 'record_submitted' then (select jsonb_build_object('nickname', p.nickname, 'meters', r.distance_meters) from public.running_records r join public.profiles p on p.id = r.user_id where r.id = n.target_id)
      when 'record_review' then (select jsonb_build_object('status', split_part(n.event_key, ':', 4), 'reason', rv.reason, 'meters', r.distance_meters)
                                 from public.running_records r left join lateral (select reason from public.record_reviews x where x.record_id = r.id and x.to_status::text = split_part(n.event_key, ':', 4) order by created_at desc limit 1) rv on true
                                 where r.id = n.target_id)
      when 'record_expired' then (select jsonb_build_object('meters', r.distance_meters, 'date', r.activity_date) from public.running_records r where r.id = n.target_id)
      when 'review_reminder' then jsonb_build_object('phase', split_part(n.event_key, ':', 3))
      when 'week_final' then (select jsonb_build_object('weekStart', w.week_start, 'groupName', w.group_name_snapshot) from public.group_weeks w where w.id = n.target_id)
      else '{}'::jsonb end
  );
$$;
```

주의: `grant execute ... public.create_group(text, int, text) ...`(0003)은 drop으로 사라졌으므로 위에서 새 시그니처에 다시 grant 했다. `review_join_request`는 `week_members` insert 시 `runner_type` 기본값 `passion`을 쓰므로 수정 불필요(신규 가입자는 항상 열정).

- [ ] **Step 4: Reset DB, regenerate types, run the integration suite**

```bash
npm run db:reset && npm run db:types
npx vitest run tests/integration/runner-types.test.ts
npm run test:integration
```
Expected: `runner-types.test.ts` 6 tests PASS. 전체 통합 PASS. 실패하면 메시지 그대로 읽고 SQL을 고친다(흔한 원인: `rank()` 윈도우 안의 `partition by` 표현식 괄호, `jsonb_array_elements` 를 빈 `members`에 돌릴 때 null → `coalesce(members,'[]')` 사용 확인).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_runner_types.sql src/lib/db/types.ts tests/integration/runner-types.test.ts
git commit -m "feat(db): 유형별 판정·벌금 마감, 유형 변경 함수, 대시보드·설정·알림 재정의

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 서버 액션·검증·문구·상태 타입

**Files:**
- Create: `src/actions/member.ts`
- Modify: `src/actions/group.ts`, `src/lib/domain/validation.ts`, `src/lib/domain/constants.ts`, `src/lib/errors.ts`, `src/lib/notification-text.ts`, `src/lib/group-state.ts`, `src/lib/dashboard/shell.ts`, `src/lib/dashboard/types.ts`
- Delete: `src/actions/rest.ts`
- Test: `tests/unit/notification-text.test.ts`, `tests/unit/validation.test.ts`

**Interfaces:**
- Consumes: Task 1의 `RunnerType`, `isRunnerType`, `RUNNER_TYPE_LABEL`; Task 3의 RPC 시그니처.
- Produces:
  - `setMemberRunnerType(groupId: string, userId: string, type: RunnerType): Promise<{ error?: string }>`
  - `createGroup`/`scheduleSettings`가 FormData 필드 `name, target, freeMin, perKmWon, zeroWon, penalty(선택)`를 읽음
  - `wonSchema` (문자열 → 0~10,000,000 정수), `penaltyNoteSchema` (빈 문자열 → null)
  - `GroupState.membership.runnerType: RunnerType`, `pendingRequest.{freeMinMeters, penaltyPerKmWon, zeroKmPenaltyWon, penalty: string | null}`
  - `MemberRow`에 `runnerType: RunnerType; goalMeters: number | null; penaltyWon: number` (`resting`, `restingNow` 삭제), `WeekDashboard.week`에 `freeMinMeters, penaltyPerKmWon, zeroKmPenaltyWon, penalty: string | null`, `me`에 `runnerType, goalMeters, penaltyWon` (`resting` 삭제), `WeekSummary.penaltyTotalWon`

- [ ] **Step 1: Update the unit tests (failing)**

`tests/unit/notification-text.test.ts`에서 `rest_request`/`rest_result`/`rest_changed` 관련 6개 `expect` 줄을 지우고 아래를 그 자리에 넣는다:

```ts
    expect(notificationText(view('runner_type_changed', { type: 'free', groupName: '새벽런' }))).toBe('방장이 회원님을 자유러너로 변경했습니다.');
    expect(notificationText(view('runner_type_changed', { type: 'injured' }))).toBe('방장이 회원님을 부상러너로 변경했습니다.');
    expect(notificationText(view('rest_result', { legacy: true }))).toBe('휴식 관련 알림 (종료된 기능)');
    expect(notificationText(view('rest_changed', { legacy: true }))).toBe('휴식 관련 알림 (종료된 기능)');
```

`tests/unit/validation.test.ts` 끝에 추가:

```ts
import { wonSchema, penaltyNoteSchema } from '@/lib/domain/validation';

describe('wonSchema / penaltyNoteSchema', () => {
  it('parses won with thousands separators and rejects out of range', () => {
    expect(wonSchema.parse('10,000')).toBe(10000);
    expect(wonSchema.parse('0')).toBe(0);
    expect(wonSchema.safeParse('-1').success).toBe(false);
    expect(wonSchema.safeParse('10000001').success).toBe(false);
    expect(wonSchema.safeParse('abc').success).toBe(false);
    expect(wonSchema.safeParse('1.5').success).toBe(false);
  });
  it('penalty note: blank → null, trims, max 500', () => {
    expect(penaltyNoteSchema.parse('')).toBeNull();
    expect(penaltyNoteSchema.parse('  ')).toBeNull();
    expect(penaltyNoteSchema.parse(' 커피 ')).toBe('커피');
    expect(penaltyNoteSchema.safeParse('x'.repeat(501)).success).toBe(false);
  });
});
```

(파일 상단에 이미 `describe, it, expect` import가 있으면 중복 import 하지 않는다.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/notification-text.test.ts tests/unit/validation.test.ts`
Expected: FAIL (`wonSchema` export 없음, 문구 불일치).

- [ ] **Step 3: Implement**

`src/lib/domain/constants.ts` 끝에 추가:

```ts
export const MAX_WON = 10_000_000;
export const DEFAULT_FREE_MIN_METERS = 5_000;
export const DEFAULT_PENALTY_PER_KM_WON = 10_000;
export const DEFAULT_ZERO_KM_PENALTY_WON = 100_000;
```

`src/lib/domain/validation.ts`: `PENALTY_MIN` import를 제거하고 `MAX_WON`을 import에 추가. `penaltySchema`를 아래 두 개로 **교체**:

```ts
/** 선택 메모. 빈 문자열은 null. */
export const penaltyNoteSchema = z.string().trim().max(PENALTY_MAX, `벌칙 메모는 ${PENALTY_MAX}자 이하입니다.`).transform((v) => (v === '' ? null : v));

/** 원 단위 금액. "10,000" 같은 천 단위 구분 허용. */
export const wonSchema = z.string().trim().transform((v, ctx) => {
  const digits = v.replace(/,/g, '');
  if (!/^\d+$/.test(digits)) { ctx.addIssue({ code: 'custom', message: '금액은 0 이상의 정수(원)로 입력하세요.' }); return z.NEVER; }
  const n = Number(digits);
  if (n > MAX_WON) { ctx.addIssue({ code: 'custom', message: `금액은 ${MAX_WON.toLocaleString('ko-KR')}원 이하여야 합니다.` }); return z.NEVER; }
  return n;
});
```

`src/lib/domain/constants.ts`에서 `PENALTY_MIN`은 다른 곳에서 쓰지 않으면 그대로 둬도 된다(grep 해서 미사용이면 삭제).

`src/actions/group.ts`: import 줄을 바꾸고 두 스키마와 두 rpc 호출을 수정.

```ts
import { groupNameSchema, penaltyNoteSchema, wonSchema, distanceInputSchema, firstIssue, uuidSchema } from '@/lib/domain/validation';
import { MAX_TARGET_METERS } from '@/lib/domain/constants';

const settingsFields = {
  target: distanceInputSchema(MAX_TARGET_METERS),
  freeMin: distanceInputSchema(MAX_TARGET_METERS),
  perKmWon: wonSchema,
  zeroWon: wonSchema,
  penalty: penaltyNoteSchema.optional(),
};
const createSchema = z.object({ name: groupNameSchema, ...settingsFields });

function rpcSettings(d: z.infer<typeof createSchema> | z.infer<typeof scheduleSchema>) {
  return { p_target_meters: d.target, p_free_min_meters: d.freeMin, p_penalty_per_km_won: d.perKmWon, p_zero_km_penalty_won: d.zeroWon, p_penalty: d.penalty ?? null };
}
const scheduleSchema = z.object({ groupId: uuidSchema, ...settingsFields });
```

`createGroup` 안의 rpc 호출:

```ts
  const { data, error } = await supabase.rpc('create_group', { p_name: parsed.data.name, ...rpcSettings(parsed.data) });
```

`scheduleSettings`:

```ts
export async function scheduleSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('schedule_group_settings', { p_group_id: parsed.data.groupId, ...rpcSettings(parsed.data) });
  if (error) return { error: messageForError(error) };
  revalidatePath('/admin'); revalidatePath('/group');
  return { success: `${data}부터 적용됩니다.` };
}
```

`src/actions/member.ts` (신규):

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';
import { isRunnerType, type RunnerType } from '@/lib/domain/runner-type';
import { uuidSchema } from '@/lib/domain/validation';

/** 관리자: 멤버 러너 유형(뱃지) 변경. 진행 중인 주부터 적용. */
export async function setMemberRunnerType(groupId: string, userId: string, type: RunnerType): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(groupId).success || !uuidSchema.safeParse(userId).success || !isRunnerType(type)) return { error: '입력값을 확인하세요.' };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: userId, p_type: type });
  if (error) return { error: messageForError(error) };
  revalidatePath('/'); revalidatePath('/group'); revalidatePath('/profile'); revalidatePath('/admin');
  return {};
}
```

`git rm src/actions/rest.ts`.

`src/lib/errors.ts`: `already_resting`, `not_resting` 두 줄 삭제, 그 자리에 `same_runner_type: '이미 그 유형입니다.',` 추가.

`src/lib/notification-text.ts`: 상단에 `import { RUNNER_TYPE_LABEL, isRunnerType } from '@/lib/domain/runner-type';` 추가. `rest_request`/`rest_result`/`rest_changed` case 블록을 삭제하고 아래로 교체:

```ts
    case 'runner_type_changed': return `방장이 회원님을 ${isRunnerType(m.type) ? RUNNER_TYPE_LABEL[m.type] : '다른 유형'}로 변경했습니다.`;
    case 'rest_request': case 'rest_result': case 'rest_changed': return '휴식 관련 알림 (종료된 기능)';
```

`src/lib/group-state.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { RunnerType } from '@/lib/domain/runner-type';

export type GroupRules = { targetMeters: number; penalty: string | null; freeMinMeters: number; penaltyPerKmWon: number; zeroKmPenaltyWon: number };

export type GroupState = {
  membership: { groupId: string; role: 'admin' | 'member'; groupName: string; archived: boolean; notice: string | null; noticeUpdatedAt: string | null; runnerType: RunnerType } | null;
  pendingRequest: ({ id: string; groupId: string; groupName: string } & GroupRules) | null;
  lastRejected: { groupName: string; reviewedAt: string } | null;
};

export async function getGroupState(supabase: SupabaseClient<Database>): Promise<GroupState> {
  const { data } = await supabase.rpc('get_my_group_state');
  const d = (data ?? {}) as Partial<GroupState>;
  return { membership: d.membership ?? null, pendingRequest: d.pendingRequest ?? null, lastRejected: d.lastRejected ?? null };
}
```

`src/lib/dashboard/shell.ts`의 `countAdminPending`: `rest_requests` 카운트 줄을 제거하고 두 개만 더한다.

```ts
async function countAdminPending(supabase: Client, groupId: string): Promise<number> {
  const [{ count: a }, { count: b }] = await Promise.all([
    supabase.from('join_requests').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'pending'),
    supabase.from('running_records').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'pending'),
  ]);
  return (a ?? 0) + (b ?? 0);
}
```

`src/lib/dashboard/types.ts`: 상단에 `import type { RunnerType } from '@/lib/domain/runner-type';`. `MemberRow`에서 `resting`, `restingNow` 두 필드(주석 포함)를 지우고 다음을 넣는다:

```ts
  runnerType: RunnerType;
  /** 유형별 목표(m). 부상은 null */
  goalMeters: number | null;
  /** 잠정(진행 중) 또는 확정 벌금(원) */
  penaltyWon: number;
```

`WeekDashboard.week`를:

```ts
  week: {
    id: string; weekStart: string; state: WeekState; targetMeters: number; penalty: string | null;
    freeMinMeters: number; penaltyPerKmWon: number; zeroKmPenaltyWon: number;
    finalizedAt: string | null; groupName: string; groupTotalMeters: number | null; isCurrent: boolean;
  };
  me: { approvedMeters: number; pendingMeters: number; eligible: boolean; inWeek: boolean; runnerType: RunnerType; goalMeters: number | null; penaltyWon: number };
```

`WeekSummary`에 `penaltyTotalWon: number;` 추가. `OUTCOME_LABEL.not_evaluated`는 `'평가 제외'`로 바꾼다(준비 주간·부상 모두 포함하는 말).

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run tests/unit`
Expected: PASS. (`typecheck`는 아직 UI 파일 때문에 실패한다. 다음 태스크들에서 해결.)

- [ ] **Step 5: Commit**

```bash
git add -A src/actions src/lib tests/unit
git commit -m "feat: 러너 유형 서버 액션·검증·알림 문구·상태 타입, 휴식 액션 제거

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `RunnerBadge` 스티커와 `Avatar.badge`

**Files:**
- Create: `src/components/ui/RunnerBadge.tsx`
- Modify: `src/components/ui/Avatar.tsx`
- Delete: `src/components/ui/RestChip.tsx`
- Test: `tests/unit/runner-badge.test.tsx`

**Interfaces:**
- Produces:
  - `RunnerBadge({ type: RunnerType; size?: number; className?: string })` — `role="img"`, `aria-label={RUNNER_TYPE_LABEL[type]}`
  - `Avatar({ src, name, size?, badge?: RunnerType | null })` — `badge==='injured'`이면 흐림 처리, `badge`가 있으면 오른쪽 아래에 `RunnerBadge`
- Consumes: Task 1 상수.

단위 테스트는 jsdom이 필요하다. `vitest.config.ts`의 `environment: 'node'`는 유지하고 테스트 파일 상단에 `// @vitest-environment jsdom`을 쓴다. `jsdom`과 `@testing-library/react`가 없으면 `npm i -D jsdom @testing-library/react`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/runner-badge.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RunnerBadge } from '@/components/ui/RunnerBadge';
import { Avatar } from '@/components/ui/Avatar';

describe('RunnerBadge', () => {
  it('exposes the type label to assistive tech and shows the short text', () => {
    const { getByRole, getByText } = render(<RunnerBadge type="passion" />);
    expect(getByRole('img', { name: '열정러너' })).toBeTruthy();
    expect(getByText('열정')).toBeTruthy();
  });
  it('injured badge has no text, only the cross', () => {
    const { getByRole, queryByText } = render(<RunnerBadge type="injured" />);
    expect(getByRole('img', { name: '부상러너' })).toBeTruthy();
    expect(queryByText('부상')).toBeNull();
  });
});

describe('Avatar badge', () => {
  it('renders the badge and dims only for injured', () => {
    const a = render(<Avatar src={null} name="짹리" badge="free" />);
    expect(a.getByRole('img', { name: '자유러너' })).toBeTruthy();
    expect(a.getByLabelText('짹리 프로필 · 자유러너').className).not.toContain('grayscale');
    const b = render(<Avatar src={null} name="보안관" badge="injured" />);
    expect(b.getByLabelText('보안관 프로필 · 부상러너').className).toContain('grayscale');
  });
  it('no badge → plain avatar', () => {
    const { queryByRole, getByLabelText } = render(<Avatar src={null} name="홍길동" />);
    expect(queryByRole('img')).toBeNull();
    expect(getByLabelText('홍길동 프로필')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/runner-badge.test.tsx`
Expected: FAIL — `RunnerBadge` 모듈 없음.

- [ ] **Step 3: Implement**

```tsx
// src/components/ui/RunnerBadge.tsx
import { RUNNER_TYPE_LABEL, RUNNER_TYPE_SHORT, type RunnerType } from '@/lib/domain/runner-type';

/**
 * 아바타 오른쪽 아래에 붙는 스티커 뱃지.
 *  - 열정: 노란 폭발형 + 빨간 테두리, 빨간 "열정"
 *  - 자유: 하늘색 둥근 네모 + 남색 테두리, 남색 "자유"
 *  - 부상: 초록 원 + 흰 테두리, 흰 십자
 */
export function RunnerBadge({ type, size = 28, className = '' }: { type: RunnerType; size?: number; className?: string }) {
  const label = RUNNER_TYPE_LABEL[type];
  const text = RUNNER_TYPE_SHORT[type];
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={`shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)] ${className}`}
    >
      {type === 'passion' && (
        <>
          <polygon points={BURST} fill="#FACC15" stroke="#DC2626" strokeWidth="2.2" strokeLinejoin="round" />
          <text x="20" y="24" textAnchor="middle" fontSize="12" fontWeight="800" fill="#DC2626" style={{ fontFamily: 'inherit' }}>{text}</text>
        </>
      )}
      {type === 'free' && (
        <>
          <rect x="4" y="6" width="32" height="28" rx="12" fill="#38BDF8" stroke="#1E3A8A" strokeWidth="2.2" transform="rotate(-8 20 20)" />
          <text x="20" y="24" textAnchor="middle" fontSize="12" fontWeight="800" fill="#1E3A8A" style={{ fontFamily: 'inherit' }}>{text}</text>
        </>
      )}
      {type === 'injured' && (
        <>
          <circle cx="20" cy="20" r="16" fill="#22C55E" stroke="#FFFFFF" strokeWidth="2.5" />
          <rect x="17" y="10" width="6" height="20" rx="1.5" fill="#FFFFFF" />
          <rect x="10" y="17" width="20" height="6" rx="1.5" fill="#FFFFFF" />
        </>
      )}
    </svg>
  );
}

/** 12각 폭발형(중심 20,20 / 바깥 반지름 19, 안쪽 14) */
const BURST = Array.from({ length: 24 }, (_, i) => {
  const r = i % 2 === 0 ? 19 : 14;
  const a = (Math.PI / 12) * i - Math.PI / 2;
  return `${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');
```

`src/components/ui/Avatar.tsx` 전체 교체:

```tsx
'use client';

import { useState } from 'react';
import { RUNNER_TYPE_LABEL, type RunnerType } from '@/lib/domain/runner-type';
import { RunnerBadge } from './RunnerBadge';

type Props = { src: string | null; name: string; size?: number; /** 러너 유형 뱃지. 부상이면 흐리게. */ badge?: RunnerType | null };

export function Avatar({ src, name, size = 36, badge = null }: Props) {
  const initial = name.trim().slice(0, 1) || '?';
  // 로드에 실패한 URL을 기억한다. 새 서명 URL이 오면 자동으로 다시 시도된다.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const label = `${name} 프로필${badge ? ` · ${RUNNER_TYPE_LABEL[badge]}` : ''}`;
  const dim = badge === 'injured' ? 'opacity-60 grayscale' : '';
  const image = src && src !== failedSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label} width={size} height={size} onError={() => setFailedSrc(src)} className={`shrink-0 rounded-full object-cover ${dim}`} style={{ width: size, height: size }} />
  ) : (
    <div aria-label={label} className={`flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600 ${dim}`} style={{ width: size, height: size }}>{initial}</div>
  );
  if (!badge) return image;
  const badgeSize = Math.max(14, Math.round(size * 0.55));
  return (
    <span className="relative inline-block shrink-0 align-middle" style={{ width: size, height: size }}>
      {image}
      <RunnerBadge type={badge} size={badgeSize} className="absolute -bottom-1 -right-1.5" />
    </span>
  );
}
```

`git rm src/components/ui/RestChip.tsx`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/runner-badge.test.tsx`
Expected: PASS (4 tests). `getByLabelText`가 `<img alt>`와 `<div aria-label>` 둘 다 잡는 것을 확인.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/RunnerBadge.tsx src/components/ui/Avatar.tsx tests/unit/runner-badge.test.tsx package.json package-lock.json
git rm -q src/components/ui/RestChip.tsx
git commit -m "feat(ui): 러너 유형 스티커 뱃지와 Avatar badge prop

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 주간 트랙·멤버 모달

**Files:**
- Modify: `src/components/dashboard/WeekTrack.tsx`, `src/components/dashboard/MemberModal.tsx`
- Test: `tests/unit/track.test.ts` (기존 유지, 추가 없음) — UI 변경은 Task 10 e2e가 커버

**Interfaces:**
- Consumes: `MemberRow.{runnerType, goalMeters, penaltyWon}`, `Avatar.badge`, `formatWon`, `RUNNER_TYPE_LABEL`.

- [ ] **Step 1: WeekTrack — 뱃지·유형별 남은 거리·벌금**

`src/components/dashboard/WeekTrack.tsx` 변경점:

import 추가:
```ts
import { formatWon } from '@/lib/domain/penalty';
import { RUNNER_TYPE_SHORT } from '@/lib/domain/runner-type';
```

`WeekTrack` 안 `displayRank` 계산을 열정러너만 대상으로 바꾼다(자유·부상은 메달 없음):
```ts
  const displayRank = new Map(assignRanks(data.members.filter((m) => m.runnerType === 'passion').map((m) => ({ userId: m.userId, totalMeters: m.approvedMeters }))).map((r) => [r.userId, r.rank]));
```

순위 열 `<li>` 안을:
```tsx
                  {m.runnerType === 'passion' ? <RankBadge rank={displayRank.get(m.userId)} /> : <span className="text-[10px] font-bold text-white/70">{RUNNER_TYPE_SHORT[m.runnerType]}</span>}
```

`Lane` 함수 시작부 계산을 교체:
```ts
function Lane({ member: m, lane, goalPct, targetMeters, isMe, ran, backParam, onOpenProfile }: LaneProps) {
  const goal = m.goalMeters;                       // 부상은 null
  const reachedGoal = goal !== null && m.approvedMeters > 0 && m.approvedMeters >= goal;
  const remaining = goal === null ? 0 : Math.max(0, goal - m.approvedMeters);
  const over = goal === null ? 0 : Math.max(0, m.approvedMeters - goal);
  const status = m.leftDuringWeek || !m.activeNow ? '탈퇴' : m.runnerType === 'injured' ? '부상' : null;
  const showPenalty = goal !== null && !reachedGoal && m.eligible && m.penaltyWon > 0;
  void targetMeters;
```
(`targetMeters` prop은 트랙 축척용으로 `buildTrack`에 이미 쓰이므로 `LaneProps`에서 제거해도 된다. 제거하면 `<Lane ... targetMeters=...>` 전달도 지우고 `void targetMeters;` 줄도 지운다. 제거를 권장한다.)

aria-label을:
```ts
          aria-label={`${m.nickname} 이번 주 기록 보기 · 승인 ${formatMeters(m.approvedMeters)} km · ${goal === null ? '평가 제외' : reachedGoal ? '목표 달성' : `남은 ${formatMeters(remaining)} km`}${showPenalty ? ` · 벌금 ${formatWon(m.penaltyWon)}` : ''}${status ? ` · ${status}` : ''}`}
```

Avatar 호출:
```tsx
            <Avatar src={m.avatarUrl ?? null} name={m.nickname} size={AVATAR} badge={m.runnerType} />
```

거리 줄의 `<span className="ml-1 font-semibold ...">` 내용을:
```tsx
            {goal === null ? '평가 제외' : reachedGoal ? (over > 0 ? `+${formatMeters(over)} 🎉` : 'GOAL! 🎉') : `${formatMeters(remaining)} 남음`}
          </span>
          {showPenalty && <span className="ml-1 rounded bg-red-600/80 px-1 text-[9px] font-semibold text-white">{formatWon(m.penaltyWon)}</span>}
```

`lane.overMeters` 참조가 남아 있으면 `over`로 바꾼다. `buildTrack`의 `overMeters`는 그룹 목표 기준이라 자유러너에게 맞지 않으므로 Lane에서는 쓰지 않는다.

- [ ] **Step 2: MemberModal — 유형·목표·벌금**

`src/components/dashboard/MemberModal.tsx` 변경점:

import 추가:
```ts
import { formatWon } from '@/lib/domain/penalty';
import { RUNNER_TYPE_LABEL } from '@/lib/domain/runner-type';
```

목표 계산부 교체:
```ts
  const target = m?.goalMeters ?? data.week.targetMeters;
```
(아래 `pct`, `remaining`, `over`는 그대로 `target`을 쓴다.)

outcome 라벨 두 줄 교체:
```ts
  const injured = m?.runnerType === 'injured';
  const outcomeLabel = m ? (injured ? '부상 · 평가 제외' : m.joinedThisWeek ? '준비 주간' : finalized ? OUTCOME_LABEL[m.outcome] : '') : '';
  const outcomeKey: Outcome = m ? (injured || m.joinedThisWeek ? 'not_evaluated' : m.outcome) : 'not_evaluated';
  const showPenalty = Boolean(m && !injured && m.eligible && m.penaltyWon > 0);
```

두 `<Avatar ... resting={m.resting} />`를 `badge={m.runnerType}`로.

이름 아래 칩 영역(`<div className="mt-2 flex flex-wrap gap-1.5">`) 맨 앞에 유형 칩 추가:
```tsx
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">{RUNNER_TYPE_LABEL[m.runnerType]}</span>
```

"목표 {formatMeters(target)} km" 블록을 부상이면 "평가 제외"로:
```tsx
                <p className="text-right text-xs text-slate-500">
                  {injured ? '평가 제외' : <>목표 {formatMeters(target)} km</>}
                  <br />
                  <span className="font-semibold text-slate-900">
                    {injured ? '' : remaining > 0 ? `남은 ${formatMeters(remaining)} km` : over > 0 ? `+${formatMeters(over)} km 초과 달성` : '목표 달성'}
                  </span>
                  {showPenalty && <><br /><span className="font-semibold text-red-600">{finalized ? '벌금' : '예상 벌금'} {formatWon(m.penaltyWon)}</span></>}
                </p>
```

- [ ] **Step 3: Typecheck these two files**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "WeekTrack|MemberModal" || echo "clean"`
Expected: `clean`

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/WeekTrack.tsx src/components/dashboard/MemberModal.tsx
git commit -m "feat(ui): 주간 트랙·멤버 모달에 러너 유형 뱃지, 유형별 목표와 벌금 표시

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 관리자 — 멤버 유형 변경, 설정 폼, 휴식 UI 제거

**Files:**
- Modify: `src/components/admin/MemberList.tsx`, `src/components/admin/GroupSettings.tsx`, `src/app/admin/page.tsx`
- Delete: `src/components/admin/RestRequests.tsx`

**Interfaces:**
- Consumes: `setMemberRunnerType`, `RUNNER_TYPES`, `RUNNER_TYPE_LABEL`, `RUNNER_TYPE_DESC`, `Avatar.badge`, `scheduleSettings` 폼 필드 `target, freeMin, perKmWon, zeroWon, penalty`.
- Produces: `MemberItem = { userId; nickname; avatarUrl; role; joinedAt; runnerType: RunnerType }`, `GroupSettings.current/scheduled: { targetMeters; penalty: string | null; freeMinMeters; penaltyPerKmWon; zeroKmPenaltyWon; weekStart }`.

- [ ] **Step 1: MemberList**

`src/components/admin/MemberList.tsx` 교체 부분:

import:
```ts
import { setMemberRunnerType } from '@/actions/member';
import { RUNNER_TYPES, RUNNER_TYPE_LABEL, RUNNER_TYPE_DESC, type RunnerType } from '@/lib/domain/runner-type';
```
(`setMemberRest`, `RestChip` import 제거.)

```ts
export type MemberItem = { userId: string; nickname: string; avatarUrl: string | null; role: 'admin' | 'member'; joinedAt: string; runnerType: RunnerType };

type Action = { kind: 'transfer'; member: MemberItem } | { kind: 'type'; member: MemberItem; to: RunnerType };
```

`restingCount` 줄을:
```ts
  const counts = RUNNER_TYPES.map((t) => `${RUNNER_TYPE_LABEL[t].slice(0, 2)} ${members.filter((m) => m.runnerType === t).length}`).join(' · ');
```

멤버 카드 헤더와 목록:
```tsx
      <Card>
        <h3 className="mb-1 font-semibold">멤버 {members.length}명 <span className="ml-1 text-sm font-normal text-slate-500">· {counts}</span></h3>
        <p className="mb-2 text-xs text-slate-500">뱃지는 방장만 바꿀 수 있습니다. 바꾸면 진행 중인 주의 평가부터 적용됩니다.</p>
        <ul className="divide-y divide-slate-200">
          {members.map((m) => (
            <li key={m.userId} className="py-3">
              <div className="flex items-center gap-3">
                <Avatar src={m.avatarUrl} name={m.nickname} badge={m.runnerType} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.nickname}
                    {m.role === 'admin' && <span className="ml-1 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">관리자</span>}
                  </p>
                  <p className="text-xs text-slate-500">참여 {new Date(m.joinedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
                </div>
                {m.userId !== myId && <Button variant="ghost" onClick={() => setAction({ kind: 'transfer', member: m })}>권한 위임</Button>}
              </div>
              <div role="radiogroup" aria-label={`${m.nickname} 러너 유형`} className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                {RUNNER_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={m.runnerType === t}
                    disabled={pending}
                    onClick={() => m.runnerType !== t && setAction({ kind: 'type', member: m, to: t })}
                    className={`min-h-9 rounded-lg text-xs font-semibold transition ${m.runnerType === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {RUNNER_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>
```

휴식 관련 `<Modal>` 두 개를 지우고 하나로:
```tsx
      <Modal open={action?.kind === 'type'} onClose={() => setAction(null)} title="러너 유형 변경">
        {action?.kind === 'type' && (
          <>
            <p className="text-sm text-slate-700"><b>{action.member.nickname}</b>을(를) <b>{RUNNER_TYPE_LABEL[action.to]}</b>로 바꿉니다.</p>
            <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{RUNNER_TYPE_DESC[action.to]}</p>
            <p className="mt-2 text-xs text-slate-500">진행 중인 주의 평가부터 적용됩니다. 이미 마감 집계 중이거나 확정된 주는 바뀌지 않습니다.</p>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" full onClick={() => setAction(null)}>취소</Button>
              <Button full loading={pending} onClick={() => run(() => setMemberRunnerType(groupId, action.member.userId, action.to), `${RUNNER_TYPE_LABEL[action.to]}로 바꿨습니다.`)}>변경</Button>
            </div>
          </>
        )}
      </Modal>
```

- [ ] **Step 2: GroupSettings**

`src/components/admin/GroupSettings.tsx`:

import 추가: `import { formatWon } from '@/lib/domain/penalty';`

```ts
type Rules = { targetMeters: number; penalty: string | null; freeMinMeters: number; penaltyPerKmWon: number; zeroKmPenaltyWon: number; weekStart: string };
type Props = { groupId: string; name: string; current: Rules; scheduled: Rules | null; notice: string | null };
```

목표·벌칙 카드를 아래로 교체:
```tsx
      <Card className="space-y-3">
        <h3 className="font-semibold">목표·벌금 규칙</h3>
        <RulesSummary title="이번 주" r={current} />
        {scheduled && (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="mb-1 font-semibold">{scheduled.weekStart}부터 적용 예정</p>
            <RulesSummary r={scheduled} compact />
          </div>
        )}
        <form action={setAction} className="space-y-3">
          <input type="hidden" name="groupId" value={groupId} />
          <Input label="열정러너 주간 목표 (km)" name="target" inputMode="decimal" required defaultValue={formatMeters((scheduled ?? current).targetMeters)} hint="0.01 ~ 1,000km" />
          <Input label="자유러너 주간 최소 거리 (km)" name="freeMin" inputMode="decimal" required defaultValue={formatMeters((scheduled ?? current).freeMinMeters)} hint="0.01 ~ 1,000km" />
          <Input label="미달 1km당 벌금 (원)" name="perKmWon" inputMode="numeric" required defaultValue={(scheduled ?? current).penaltyPerKmWon.toLocaleString('ko-KR')} hint="미달 거리는 1km 단위로 올림" />
          <Input label="0km 벌금 (원)" name="zeroWon" inputMode="numeric" required defaultValue={(scheduled ?? current).zeroKmPenaltyWon.toLocaleString('ko-KR')} hint="한 번도 안 달리면 km당 벌금 대신 이 금액" />
          <Textarea label="벌칙 메모 (선택)" name="penalty" maxLength={500} rows={2} defaultValue={(scheduled ?? current).penalty ?? ''} placeholder="예: 정산은 일요일 밤, 계좌는 공지 참고" />
          <p className="text-xs text-slate-500">변경은 다음 주 월요일부터 적용됩니다. 같은 주에 다시 저장하면 예약을 대체합니다.</p>
          <FormMessage error={setState.error} success={setState.success} />
          <SubmitButton full>다음 주부터 적용</SubmitButton>
        </form>
      </Card>
```

파일 끝에:
```tsx
function RulesSummary({ r, title, compact = false }: { r: Rules; title?: string; compact?: boolean }) {
  const row = (k: string, v: string) => <div key={k} className="flex justify-between gap-4"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="text-right">{v}</dd></div>;
  return (
    <dl className={compact ? 'space-y-0.5 text-xs' : 'space-y-0.5 rounded-xl bg-slate-50 p-3 text-sm'}>
      {title && <p className="mb-1 text-xs font-semibold text-slate-500">{title}</p>}
      {row('열정 목표', `${formatMeters(r.targetMeters)} km`)}
      {row('자유 최소', `${formatMeters(r.freeMinMeters)} km`)}
      {row('1km당', formatWon(r.penaltyPerKmWon))}
      {row('0km', formatWon(r.zeroKmPenaltyWon))}
      {r.penalty && row('메모', r.penalty)}
    </dl>
  );
}
```

- [ ] **Step 3: admin page**

`src/app/admin/page.tsx`:
- `RestRequests` import 삭제.
- `Promise.all`에서 `rest_requests` 쿼리를 제거하고 `memberships` select를 `'user_id, role, joined_at, runner_type, profiles(nickname, avatar_path)'`로.
- `avatarPaths`에서 `restRequests` 부분 제거. `restItems` 블록 삭제.
- `memberItems` 매핑: `resting/restStartedAt` 대신 `runnerType: m.runner_type`.
- `counts.requests`를 `requestItems.length`로.
- `tab === 'requests'` 렌더를 `<JoinRequests items={requestItems} />`만.
- `SettingsTab`: select를 `'effective_week_start, target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won'`로, 매핑 함수 하나로:

```ts
  const toRules = (s: NonNullable<typeof settings>[number]) => ({ targetMeters: s.target_meters, penalty: s.penalty, freeMinMeters: s.free_min_meters, penaltyPerKmWon: s.penalty_per_km_won, zeroKmPenaltyWon: s.zero_km_penalty_won, weekStart: s.effective_week_start });
  return <GroupSettings groupId={groupId} name={name} notice={notice} current={toRules(current)} scheduled={scheduled ? toRules(scheduled) : null} />;
```

`git rm src/components/admin/RestRequests.tsx`.

- [ ] **Step 4: Typecheck admin files**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "admin/" || echo "clean"`
Expected: `clean`

- [ ] **Step 5: Commit**

```bash
git add -A src/components/admin src/app/admin
git commit -m "feat(admin): 멤버 러너 유형 세그먼트 변경, 숫자 벌금 설정 폼, 휴식 신청 UI 제거

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 그룹 생성·초대·가입 대기·그룹 탭·프로필

**Files:**
- Modify: `src/app/groups/new/NewGroupForm.tsx`, `src/app/join/[code]/page.tsx`, `src/components/group/NoGroupHome.tsx`, `src/app/(tabs)/group/page.tsx`, `src/app/profile/page.tsx`
- Create: `src/components/group/RulesLine.tsx`, `src/app/profile/MyRunnerType.tsx`
- Delete: `src/app/profile/RestSection.tsx`

**Interfaces:**
- Produces: `RulesLine({ rules: { targetMeters; freeMinMeters; penaltyPerKmWon; zeroKmPenaltyWon; penalty: string | null } })` — 한 줄 규칙 요약 + 메모.
- Consumes: `GroupState.pendingRequest`(GroupRules 포함), `lookup_invite` 새 컬럼, `createGroup` 폼 필드.

- [ ] **Step 1: RulesLine**

```tsx
// src/components/group/RulesLine.tsx
import { formatMeters } from '@/lib/domain/distance';
import { formatWon } from '@/lib/domain/penalty';
import type { GroupRules } from '@/lib/group-state';

/** "열정 15km · 자유 5km · 미달 1km당 10,000원 · 0km 100,000원" + 선택 메모 */
export function RulesLine({ rules, className = '' }: { rules: GroupRules; className?: string }) {
  return (
    <div className={`text-sm text-slate-700 ${className}`}>
      <p>열정 {formatMeters(rules.targetMeters)}km · 자유 {formatMeters(rules.freeMinMeters)}km · 미달 1km당 {formatWon(rules.penaltyPerKmWon)} · 0km {formatWon(rules.zeroKmPenaltyWon)}</p>
      {rules.penalty && <p className="mt-0.5 text-xs text-slate-500">메모: {rules.penalty}</p>}
    </div>
  );
}
```

- [ ] **Step 2: NewGroupForm**

```tsx
'use client';
import { useActionState } from 'react';
import { createGroup } from '@/actions/group';
import type { ActionState } from '@/actions/auth';
import { Input, Textarea } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';
import { DEFAULT_FREE_MIN_METERS, DEFAULT_PENALTY_PER_KM_WON, DEFAULT_ZERO_KM_PENALTY_WON } from '@/lib/domain/constants';
import { formatMeters } from '@/lib/domain/distance';

export function NewGroupForm({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(createGroup, {});
  return (
    <form action={action} className="space-y-5">
      <Input label="그룹명" name="name" required minLength={2} maxLength={30} hint="2~30자" />
      <Input label="열정러너 주간 목표 (km)" name="target" inputMode="decimal" required placeholder="예: 15" hint="0.01 ~ 1,000km, 소수 둘째 자리까지. 순위 내기에 참여하는 기본 유형입니다." />
      <Input label="자유러너 주간 최소 거리 (km)" name="freeMin" inputMode="decimal" required defaultValue={formatMeters(DEFAULT_FREE_MIN_METERS)} hint="순위 없이 최소 거리만 채우는 유형" />
      <Input label="미달 1km당 벌금 (원)" name="perKmWon" inputMode="numeric" required defaultValue={DEFAULT_PENALTY_PER_KM_WON.toLocaleString('ko-KR')} hint="미달 거리는 1km 단위로 올림" />
      <Input label="0km 벌금 (원)" name="zeroWon" inputMode="numeric" required defaultValue={DEFAULT_ZERO_KM_PENALTY_WON.toLocaleString('ko-KR')} hint="한 번도 안 달리면 km당 벌금 대신 이 금액" />
      <Textarea label="벌칙 메모 (선택)" name="penalty" maxLength={500} rows={2} hint="정산 방법 등. 비워도 됩니다." />
      <p className="text-xs text-slate-500">그룹을 만든 주는 준비 주간입니다. 다음 주부터 성공·실패를 평가합니다. 멤버 유형(열정/자유/부상)은 관리자 화면에서 바꿉니다.</p>
      <FormMessage error={state.error} />
      <SubmitButton full disabled={disabled}>그룹 만들기</SubmitButton>
    </form>
  );
}
```

- [ ] **Step 3: join page, NoGroupHome, group tab**

`src/app/join/[code]/page.tsx`: `import { RulesLine } from '@/components/group/RulesLine';` 추가. `<dl ...>...</dl>` 블록을:
```tsx
            <RulesLine rules={{ targetMeters: invite.target_meters, freeMinMeters: invite.free_min_meters, penaltyPerKmWon: invite.penalty_per_km_won, zeroKmPenaltyWon: invite.zero_km_penalty_won, penalty: invite.penalty }} />
```

`src/components/group/NoGroupHome.tsx`: `RulesLine` import 추가, `pendingRequest` 카드의 `<dl>` 블록을 `<RulesLine rules={r} />`로. (`r`은 `GroupRules` 필드를 모두 가진다.) `formatMeters` import가 더 이상 안 쓰이면 제거.

`src/app/(tabs)/group/page.tsx`:
- `RestChip` import 제거, `import { RulesLine } from '@/components/group/RulesLine';` 추가.
- `group_settings` select에 `free_min_meters, penalty_per_km_won, zero_km_penalty_won` 추가. `memberships` select의 `rest_started_at`을 `runner_type`으로.
- 주간 목표/벌칙 `<dl>` 2칸을 유지하되 벌칙 칸을 규칙 요약으로:

```tsx
          {current && (
            <div className="mt-3 space-y-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">열정러너 주간 목표</dt>
                <dd className="mt-0.5 text-xl font-bold tabular-nums">{formatMeters(current.target_meters)} <span className="text-sm font-normal text-slate-500">km</span></dd>
              </div>
              <RulesLine className="rounded-xl bg-slate-50 p-3" rules={{ targetMeters: current.target_meters, freeMinMeters: current.free_min_meters, penaltyPerKmWon: current.penalty_per_km_won, zeroKmPenaltyWon: current.zero_km_penalty_won, penalty: current.penalty }} />
            </div>
          )}
          {scheduled && (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">{scheduled.effective_week_start}부터 적용 예정</p>
              <RulesLine className="text-amber-900" rules={{ targetMeters: scheduled.target_meters, freeMinMeters: scheduled.free_min_meters, penaltyPerKmWon: scheduled.penalty_per_km_won, zeroKmPenaltyWon: scheduled.zero_km_penalty_won, penalty: scheduled.penalty }} />
            </div>
          )}
```
- 멤버 목록: `const resting = ...` 삭제, `<Avatar ... badge={m.runner_type} />`, `{resting && <RestChip .../>}` 삭제.

- [ ] **Step 4: profile**

```tsx
// src/app/profile/MyRunnerType.tsx
import { RunnerBadge } from '@/components/ui/RunnerBadge';
import { RUNNER_TYPE_LABEL, RUNNER_TYPE_DESC, type RunnerType } from '@/lib/domain/runner-type';

export function MyRunnerType({ groupName, type }: { groupName: string | null; type: RunnerType | null }) {
  if (!groupName || !type) return null;
  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <h3 className="mb-2 font-semibold">내 러너 유형</h3>
      <div className="flex items-center gap-3">
        <RunnerBadge type={type} size={40} />
        <div>
          <p className="font-semibold">{RUNNER_TYPE_LABEL[type]}</p>
          <p className="text-xs text-slate-500">{RUNNER_TYPE_DESC[type]}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">유형은 {groupName} 방장만 바꿀 수 있어요. 바꾸고 싶으면 방장에게 말해 주세요.</p>
    </section>
  );
}
```

`src/app/profile/page.tsx`: `RestSection` import를 `import { MyRunnerType } from './MyRunnerType';`로 바꾸고 `<RestSection .../>` 블록을:
```tsx
        <MyRunnerType groupName={membership?.groupName ?? null} type={membership?.runnerType ?? null} />
```

`git rm src/app/profile/RestSection.tsx`.

- [ ] **Step 5: Full typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. 남은 오류가 있으면 그 파일의 `resting`/`rest_` 참조를 이 태스크 범위에서 정리한다 (`grep -rn "resting\|rest_started_at\|rest_requests\|RestChip\|actions/rest" src` 가 비어야 한다).

- [ ] **Step 6: Commit**

```bash
git add -A src/app src/components/group
git commit -m "feat(ui): 그룹 생성·초대·그룹 탭에 벌금 규칙 표시, 프로필 내 유형 섹션, 휴식 섹션 제거

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 주간 요약 카드

**Files:**
- Modify: `src/components/summary/SummaryCard.tsx`

**Interfaces:**
- Consumes: `WeekSummary.penaltyTotalWon`, `MemberRow.{runnerType, penaltyWon}`, `formatWon`, `Avatar.badge`.

- [ ] **Step 1: Implement**

`src/components/summary/SummaryCard.tsx` 변경점:

import 추가: `import { formatWon } from '@/lib/domain/penalty';`

`outcomeText`:
```ts
function outcomeText(m: MemberRow): string {
  if (m.runnerType === 'injured') return '부상';
  if (m.joinedThisWeek || !m.eligible) return '준비 주간';
  switch (m.outcome) {
    case 'success': case 'provisional_success': return '성공';
    case 'fail': case 'provisional_fail': return '실패';
    case 'pending_review': return '판정 대기';
    default: return '';
  }
}
```

`displayRank`를 열정러너만:
```ts
  const displayRank = new Map(assignRanks(members.filter((m) => m.runnerType === 'passion').map((m) => ({ userId: m.userId, totalMeters: m.approvedMeters }))).map((r) => [r.userId, r.rank]));
```

`rests`/`preps`:
```ts
  const injured = members.filter((m) => m.runnerType === 'injured');
  const preps = members.filter((m) => !m.eligible && m.runnerType !== 'injured');
```

규칙 줄:
```tsx
      <p className="mt-1 text-sm text-slate-600">열정 {formatMeters(week.targetMeters)}km · 자유 {formatMeters(week.freeMinMeters)}km · 1km당 {formatWon(week.penaltyPerKmWon)}{week.penalty ? ` · ${week.penalty}` : ''}</p>
```

나의 결과 줄: `{` · ${displayRank.get(me.userId)}위`}`를 조건부로:
```tsx
          <p className="text-xl font-bold">{outcomeText(me)} · {formatMeters(me.approvedMeters)} km{displayRank.has(me.userId) ? ` · ${displayRank.get(me.userId)}위` : ''}{me.penaltyWon > 0 ? ` · ${formatWon(me.penaltyWon)}` : ''}</p>
```

목록 행: `<Avatar ... resting={m.resting} />` → `badge={m.runnerType}`. 거리 뒤에 벌금:
```tsx
            <span className="tabular-nums">{formatMeters(m.approvedMeters)} km</span>
            {m.penaltyWon > 0 && <span className="text-xs tabular-nums text-red-600">{formatWon(m.penaltyWon)}</span>}
```

합계 그리드: `rests` 줄을 `injured`로 바꾸고 라벨 "부상". 그리드 안에 벌금 합계 칸 추가(0원이면 숨김):
```tsx
          {summary.penaltyTotalWon > 0 && <div className="col-span-2 rounded-xl bg-red-50 p-2"><p className="text-slate-500">벌금 합계</p><p className="text-base font-bold text-red-700">{formatWon(summary.penaltyTotalWon)}</p></div>}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/summary/SummaryCard.tsx
git commit -m "feat(ui): 주간 요약에 유형 뱃지와 벌금 합계

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: e2e, 문서, 전체 검증

**Files:**
- Modify: `tests/e2e/core-flow.spec.ts`, `README.md`, `docs/all-migrations.sql`, `scripts/seed-demo.ts`

- [ ] **Step 1: Extend the e2e flow (failing until the app is built)**

`tests/e2e/core-flow.spec.ts`의 "owner approves" 블록 뒤, "member submits a record" 앞에 추가:

```ts
  // owner changes the member's runner type to 자유러너; badge shows on the dashboard
  await owner.goto('/admin?tab=members');
  const memberGroup = owner.getByRole('radiogroup', { name: '멤버 러너 유형' });
  await expect(memberGroup.getByRole('radio', { name: '열정러너' })).toHaveAttribute('aria-checked', 'true');
  await memberGroup.getByRole('radio', { name: '자유러너' }).click();
  await owner.getByRole('button', { name: '변경' }).click();
  await expect(owner.getByText('자유러너로 바꿨습니다.')).toBeVisible();
  await expect(memberGroup.getByRole('radio', { name: '자유러너' })).toHaveAttribute('aria-checked', 'true');

  await member.goto('/');
  await expect(member.getByRole('img', { name: '자유러너' }).first()).toBeVisible();
  await member.goto('/profile');
  await expect(member.getByText('자유러너', { exact: true })).toBeVisible();
  await member.goto('/notifications');
  await expect(member.getByText('방장이 회원님을 자유러너로 변경했습니다.')).toBeVisible();
```

기존 흐름의 멤버 닉네임은 `멤버`(onboard 호출), 그룹명은 `E2E 러너`다. 그룹 생성 단계의 두 줄을 고친다: `getByLabel('1인당 주간 목표 거리 (km)')` → `getByLabel('열정러너 주간 목표 (km)')`, `getByLabel('실패 시 벌칙').fill('커피')` 줄은 삭제(숫자 필드는 기본값이 있다). 대시보드 단계: 멤버가 자유러너(최소 5km)가 되면 진행률 기준이 5km라 5.25km는 100%다. `toHaveAttribute('aria-valuenow', '53')`을 `'100'`으로 바꾼다. 다르면 실제 렌더값으로 맞추되 계산식(5250/5000 → 100 상한)을 먼저 확인한다.

- [ ] **Step 2: Demo seed**

`scripts/seed-demo.ts`의 `create_group` 호출에 숫자 인자를 명시한다:

```ts
  const { data: g } = await owner.client.rpc('create_group', { p_name: '데모 러닝 크루', p_target_meters: 15000, p_penalty: '정산은 일요일 밤', p_free_min_meters: 5000, p_penalty_per_km_won: 10000, p_zero_km_penalty_won: 100000 });
```

멤버 루프(`members.push(m)`) 바로 뒤, 첫 `record(...)` 호출 앞에 두 번째 멤버를 `free`, 세 번째를 `injured`로 바꾸는 호출을 추가한다(데모 화면에서 뱃지 세 종류가 보이도록). 그룹 id는 `g.group_id`다:

```ts
  await owner.client.rpc('set_member_runner_type', { p_group_id: g.group_id, p_user_id: members[1].id, p_type: 'free' });
  await owner.client.rpc('set_member_runner_type', { p_group_id: g.group_id, p_user_id: members[2].id, p_type: 'injured' });
```

- [ ] **Step 3: Docs**

`README.md`:
- "핵심 규칙" 문단 끝에 추가: `멤버 러너 유형(열정/자유/부상)은 관리자만 바꾸며, 유형별 목표와 미달 1km당·0km 벌금은 그룹 설정으로 두고 주차마다 스냅샷한다. 판정·벌금은 DB 함수 app.evaluate 한 곳에서 계산한다(src/lib/domain/penalty.ts 와 교차 테스트).`
- 구조 표의 `supabase/migrations/0001~0010`를 `0001~0015`로.

`docs/all-migrations.sql` 재생성:
기존 파일은 파일마다 `-- ===== 0001_schema.sql =====` 헤더를 붙여 이어 붙인 형식이다. 같은 형식으로 재생성:
```bash
: > docs/all-migrations.sql
for f in supabase/migrations/*.sql; do printf -- '-- ===== %s =====\n' "$(basename "$f")" >> docs/all-migrations.sql; cat "$f" >> docs/all-migrations.sql; printf '\n' >> docs/all-migrations.sql; done
```
`git diff --stat docs/all-migrations.sql`로 0015 부분만 추가됐는지 확인한다.

- [ ] **Step 4: Full verification**

```bash
npm run verify
npm run test:integration
npm run build && (npm start & sleep 5; npm run test:e2e; kill %1)
```
Expected: 모두 PASS. e2e가 셀렉터 문제로 실패하면 실제 렌더 결과(`npx playwright test --debug` 또는 트레이스)를 보고 테스트 셀렉터를 맞춘다. 구현을 테스트에 맞춰 억지로 바꾸지 않는다.

`grep -rn "resting\|rest_started_at\|rest_requests\|RestChip\|RestSection\|RestRequests\|actions/rest" src tests scripts` 가 비어야 한다.

- [ ] **Step 5: Commit and open the PR**

```bash
git add -A
git commit -m "test(e2e): 러너 유형 변경 흐름, 데모 시드·문서 갱신

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/runner-types
gh pr create --base main --title "feat: 러너 유형(열정/자유/부상) 뱃지와 벌금 자동 계산" --body "$(cat <<'EOF'
## 요약
- 멤버 러너 유형(열정/자유/부상)을 관리자가 지정하고 아바타에 스티커 뱃지로 표시
- 유형별 주간 판정·벌금(미달 1km당, 0km 고정액)을 DB `app.evaluate` 한 곳에서 계산, 마감 시 `weekly_results.penalty_won` 확정
- 그룹 설정에 자유 최소 거리·km당 벌금·0km 벌금 추가, 벌칙 문구는 선택 메모로
- 휴식 기능은 부상 유형으로 흡수 (데이터 이전 후 테이블·함수·UI 제거)

스펙: `docs/superpowers/specs/2026-10-06-runner-types-design.md`
계획: `docs/superpowers/plans/2026-10-06-runner-types.md`

## 검증
- `npm run verify`, `npm run test:integration`, `npm run test:e2e` 통과

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage**
- §2.1 타입·컬럼 → Task 2. §2.2 휴식 이전·제거 → Task 2(데이터·테이블·함수), Task 3(조회 함수 재정의), Task 4/5/7/8(UI·액션 제거).
- §3.1 `app.evaluate` + TS 복제 + 교차 테스트 → Task 1, 2, 3. §3.2 eligible·순위 → Task 3 `ensure_group_week`/`finalize_week`/대시보드. §3.3 유형 변경 함수·알림 → Task 3. §3.4 설정 함수·zod → Task 3, 4. §3.5 JSON 변경 → Task 3, 4.
- §4.1 RunnerBadge/Avatar → Task 5. §4.2 트랙 → Task 6. §4.3 모달 → Task 6. §4.4 관리자 → Task 7. §4.5 생성·가입 → Task 8. §4.6 프로필 → Task 8. §4.7 요약 → Task 9. §4.8 텍스트 → Task 4.
- §6 테스트: 단위(Task 1, 4, 5), 통합(Task 2, 3), e2e(Task 10). 휴식→부상 마이그레이션 검증은 Task 2의 SQL이 `db:reset`에서 실행되는 것으로 확인하되, 운영 데이터가 있는 상태의 이전은 통합 테스트에서 재현하지 않는다(seed에 휴식 데이터가 없음). 배포 전 운영 DB 백업 후 적용할 것을 PR 본문에 적는다.

**Placeholder scan**: 모든 코드 스텝에 실제 코드가 있다. Task 10 Step 1의 `aria-valuenow` 기대값만 실행 결과로 확정하도록 명시했다.

**Type consistency**: `setMemberRunnerType(groupId, userId, type)` (Task 4 → 7), `MemberRow.{runnerType, goalMeters, penaltyWon}` (Task 4 → 6, 9), `GroupRules` (Task 4 → 8), `Avatar.badge` (Task 5 → 6, 7, 8, 9), RPC `set_member_runner_type(p_group_id, p_user_id, p_type)` (Task 3 → 4), `create_group`/`schedule_group_settings` 인자명 (Task 3 → 4) 일치 확인.

**Review Focus**: 1·2 → Task 1 단위 + Task 3 교차 테이블(`passion 14999`, `free 0`). 3 → Task 3 "closing-week change" 단언. 4 → Task 3 "old 3-arg call still works" + 전체 통합 실행. 5 → Task 3 legacy 알림 통합 + Task 4 단위.
