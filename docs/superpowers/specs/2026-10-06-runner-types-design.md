# 러너 유형(뱃지)과 벌금 계산 설계

작성일: 2026-10-06 · 상태: 검토 대기

## 1. 목표

그룹 멤버를 세 유형(열정·자유·부상)으로 나누고, 유형별 규칙으로 주간 성공/실패와 벌금 금액을 자동 계산한다. 유형은 방장(관리자)만 바꿀 수 있고, 아바타에 스티커 뱃지로 표시한다. 기존 "휴식" 기능은 부상 유형으로 흡수한다.

### 유형별 규칙

| 유형 | 코드 | 평가 기준 | 벌금 | 순위(내기) |
|---|---|---|---|---|
| 열정러너 | `passion` | 주간 승인 합계 ≥ 열정 목표(`target_meters`) | 미달분 올림(km) × km당 벌금 | 참여 |
| 자유러너 | `free` | 주간 승인 합계 ≥ 자유 최소 거리(`free_min_meters`) | 미달분 올림(km) × km당 벌금 | 미참여 |
| 부상러너 | `injured` | 평가하지 않음(`not_evaluated`) | 0원 | 미참여 |

공통: 열정·자유 모두 주간 승인 합계가 0m이면 km당 계산을 **대체**하여 0km 벌금(고정액)을 적용한다.
예: 목표 15km, km당 10,000원, 0km 벌금 100,000원일 때 12.3km → 미달 2.7km → 3km → 30,000원. 0km → 100,000원(150,000원이 아님).

### 결정 사항(브레인스토밍에서 확정)

- 숫자(목표·최소 거리·단가·0km 벌금)는 그룹 설정으로 방장이 조정하고, 주차 생성 시 스냅샷한다.
- 부상 뱃지가 휴식 기능을 대체한다. 멤버의 휴식 신청/관리자 승인 흐름은 제거한다.
- 자유러너 판정은 "주간 합계 ≥ 최소 거리"이다(단일 러닝 거리 기준 아님).
- 미달 거리 벌금 단위는 시작된 1km마다(올림).
- 신규 멤버 기본 유형은 열정. 유형 변경은 진행 중인 주(`open`)에 즉시 반영된다.
- 기존 자유 텍스트 벌금 문구(`penalty`)는 선택 입력 메모로 유지한다.
- 부상러너도 기록 제출은 가능하다(현재 휴식과 동일). 평가·순위·벌금에서만 제외된다.
- 벌금 결제·이행 추적은 여전히 범위 밖이다. 앱은 금액을 계산·표시만 한다.

## 2. 데이터 모델

마이그레이션 `supabase/migrations/0015_runner_types.sql` 하나로 처리한다. 적용 후 `docs/all-migrations.sql`과 `src/lib/db/types.ts`를 재생성한다.

### 2.1 타입·컬럼

```sql
create type public.runner_type as enum ('passion', 'free', 'injured');

alter table public.memberships add column runner_type public.runner_type not null default 'passion';
alter table public.week_members add column runner_type public.runner_type not null default 'passion';

alter table public.group_settings
  add column free_min_meters     integer not null default 5000   check (free_min_meters between 1 and 1000000),
  add column penalty_per_km_won  integer not null default 10000  check (penalty_per_km_won between 0 and 10000000),
  add column zero_km_penalty_won integer not null default 100000 check (zero_km_penalty_won between 0 and 10000000);
alter table public.group_settings alter column penalty drop not null;
alter table public.group_settings drop constraint group_settings_penalty_check;
alter table public.group_settings add constraint group_settings_penalty_check
  check (penalty is null or char_length(penalty) between 1 and 500);

alter table public.group_weeks
  add column free_min_meters integer not null default 5000,
  add column penalty_per_km_won integer not null default 10000,
  add column zero_km_penalty_won integer not null default 100000;
alter table public.group_weeks alter column penalty drop not null;

alter table public.weekly_results add column penalty_won integer not null default 0;
```

- `target_meters`는 그대로 열정 목표로 쓴다. 이름을 바꾸지 않는다(기존 코드·테스트 영향 최소화).
- `group_weeks`의 새 컬럼은 `ensure_group_week`가 `group_settings`에서 스냅샷한다. 기존 주차 행은 기본값을 가진다(과거 주차는 이미 확정됐거나 확정 시점의 규칙이 기존 단일 목표였으므로 재평가하지 않는다).
- `weekly_results.penalty_won`은 확정 시 1회 기록하고 이후 수정하지 않는다(확정 결과 불변 규칙 유지). 기존 확정 행은 0으로 둔다.

### 2.2 휴식 데이터 이전·제거

같은 마이그레이션 안에서 순서대로:

1. `update public.memberships set runner_type = 'injured' where rest_started_at is not null and left_at is null;`
2. `update public.week_members wm set runner_type = 'injured' where wm.resting;` (`eligible`은 이미 false)
3. `drop function` : `public.request_rest`, `public.cancel_rest_request`, `public.end_my_rest`, `public.review_rest_request`, `public.set_member_rest`, `app.set_rest`
4. `drop table public.rest_requests;`
5. `alter table public.memberships drop column rest_started_at; alter table public.week_members drop column resting;`
6. `get_my_group_state`, `get_week_dashboard`, `ensure_group_week`, `finalize_week`, `notification_view`, `create_group`, `schedule_group_settings` 를 새 컬럼 기준으로 재정의. 관리자 멤버 목록은 `src/app/admin/page.tsx`가 `memberships`를 직접 select 하므로 컬럼명(`rest_started_at` → `runner_type`)만 바꾼다.

기존 `notifications` 행 중 `rest_request`/`rest_result`/`rest_changed` 종류는 삭제하지 않는다. `notification_view`는 이 종류를 "휴식 관련 알림(종료된 기능)" 고정 문구로 내려주고, 클라이언트 `notification-text.ts`도 같은 문구로 맞춘다.

## 3. 평가·벌금 계산

### 3.1 단일 출처 함수

```sql
create function app.evaluate(
  p_type public.runner_type, p_total int,
  p_target int, p_free_min int, p_per_km int, p_zero_won int
) returns table (outcome public.result_outcome, penalty_won int, ranked boolean)
language sql immutable as $$ ... $$;
```

규칙:

- `injured` → `('not_evaluated', 0, false)`
- 목표 `goal` = `passion`이면 `p_target`, `free`면 `p_free_min`
- `p_total >= goal` → `('success', 0, p_type = 'passion')`
- `p_total = 0` → `('fail', p_zero_won, p_type = 'passion')`
- 그 외 → `('fail', ceil((goal - p_total) / 1000.0) * p_per_km, p_type = 'passion')`

`finalize_week`와 `get_week_dashboard`가 모두 이 함수를 호출한다. 대시보드는 잠정 결과(`provisional_*`)를 만들 때 `approved` 합계를 넣고, 확정 주차는 `weekly_results` 값을 그대로 쓴다.

같은 규칙을 `src/lib/domain/penalty.ts`에 순수 함수 `evaluate(type, totalMeters, settings)`로 둔다. 화면에서 "미달 시 예상 벌금"을 계산할 때와 단위 테스트에서 쓴다. 통합 테스트가 SQL 결과와 TS 결과를 같은 입력으로 비교한다.

### 3.2 eligible·순위

- `week_members.eligible` = `joined_at < 주 시작` **and** `runner_type <> 'injured'`. 이름과 의미는 유지한다(휴식 → 부상으로 조건만 바뀜).
- 순위(`rank`)는 `eligible and runner_type = 'passion'`인 멤버끼리만 매긴다. 자유·부상·이번 주 가입자는 `rank = null`.
- `finalize_week`의 `weekly_results` insert는 `outcome`, `penalty_won`, `rank`를 `app.evaluate` 결과로 채운다.

### 3.3 유형 변경 함수

```sql
create function public.set_member_runner_type(p_group_id uuid, p_user_id uuid, p_type public.runner_type) returns void
```

- 관리자만(`app.is_group_admin`). 대상이 활성 멤버가 아니면 `not_member`. 같은 유형이면 `same_runner_type` 오류.
- `memberships.runner_type` 갱신. `ensure_group_week(현재 주)` 후 그 주가 `open`이면 `week_members.runner_type`과 `eligible`을 즉시 갱신(기존 `app.set_rest` 패턴). `closing`/`finalized`면 주차 스냅샷은 건드리지 않는다.
- 본인에게 알림 `runner_type_changed` (dedupe key `runner_type_changed:<membership_id>:<변경 시각 epoch>`, payload에 `type`). 관리자 자신을 바꾸면 알림 생략.

### 3.4 그룹 설정 함수

- `create_group(p_name, p_target_meters, p_penalty, p_free_min_meters, p_penalty_per_km_won, p_zero_km_penalty_won)`: `p_penalty`는 null/빈 문자열 허용.
- `schedule_group_settings`도 같은 인자 추가. 기존 규칙(다음 주부터 유효 또는 현재 `effective_week_start` 정책)은 그대로 따른다.
- 서버 액션 zod: 거리 입력은 기존 `distanceInputSchema`, 금액은 `0 이상 10,000,000 이하 정수`(km당 벌금은 `1,000,000` 이하: 목표 최대 1,000km × km당 벌금이 int4 를 넘지 않도록), 메모는 `penaltySchema.optional()`.

### 3.5 조회 JSON 변경

`get_week_dashboard`:

- `week`에 `freeMinMeters`, `penaltyPerKmWon`, `zeroKmPenaltyWon` 추가. `penalty`는 null 가능.
- 멤버 항목에서 `resting`, `restingNow` 제거. `runnerType`, `goalMeters`(유형별 목표, 부상은 null), `penaltyWon`(잠정 또는 확정) 추가.
- `me`에 `runnerType`, `goalMeters`, `penaltyWon` 추가, `resting` 제거.
- 정렬: 열정(순위순) → 자유(승인 거리순) → 부상/미평가 → 탈퇴.

`get_my_group_state`: `membership.resting`, `restStartedAt` 제거, `runnerType` 추가. `pendingRequest`에 `freeMinMeters` 등 숫자 추가.

관리자 멤버 목록(`MemberItem`): `resting`, `restStartedAt` 제거, `runnerType` 추가.

주간 요약(`0007_notifications_summary.sql`의 요약 집계): `successCount` 등 옆에 `penaltyTotalWon`(열정·자유 벌금 합) 추가.

## 4. 화면

### 4.1 `RunnerBadge` 컴포넌트 (`src/components/ui/RunnerBadge.tsx`)

인라인 SVG. `type`과 `size`(기본 28px)를 받는다. 아바타 오른쪽 아래에 겹쳐 놓는 스티커 모양(사용자 시안 기준):

- `passion`: 노란(#FACC15) 12각 폭발형 + 빨간 테두리, 가운데 빨간 손글씨풍 "열정"
- `free`: 하늘색(#38BDF8) 둥근 네모 + 남색 테두리, 가운데 남색 "자유"
- `injured`: 초록(#22C55E) 원 + 흰 테두리, 가운데 흰 십자(글자 없음)

각 뱃지는 `role="img"`와 `aria-label`("열정러너" 등)을 가진다. `Avatar`에 `badge?: RunnerType` prop을 추가해 모든 화면이 같은 위치에 그린다. `Avatar`의 `resting` prop은 `dimmed`로 이름을 바꾸고 부상일 때 켠다.

### 4.2 주간 트랙 (`WeekTrack.tsx`)

- 아바타에 뱃지. 부상이면 아바타 흐림 + 이름 옆 "부상" 라벨(지금 "휴식" 자리, 탈퇴 라벨과 같은 스타일).
- 남은 거리 문구는 `goalMeters` 기준. 부상은 남은 거리 대신 "평가 제외".
- 미달 상태(잠정 실패)면 남은 거리 옆에 "벌금 30,000원" 작은 글씨. 확정 주차는 확정 금액.
- 순위 표시: 자유러너는 순위 자리에 뱃지 색과 같은 "자유" 텍스트, 부상은 비움.

### 4.3 멤버 모달 (`MemberModal.tsx`)

유형 라벨, 유형별 목표, 승인/대기 거리, 벌금(잠정이면 "예상"). 휴식 문구 제거.

### 4.4 관리자 (`/admin`)

- `MemberList`: "휴식 처리/해제" 버튼을 세그먼트 3개(열정·자유·부상)로 교체. 누르면 기존과 같은 확인 모달("OO님을 자유러너로 바꿀까요? 이번 주 평가부터 적용됩니다") → `setMemberRunnerType` 서버 액션(`src/actions/member.ts`). 헤더의 "휴식 N명"은 "열정 a · 자유 b · 부상 c".
- `RestRequests` 컴포넌트와 관련 액션(`src/actions/rest.ts`) 삭제.
- 그룹 설정 폼: 열정 목표(기존), 자유 최소 거리, km당 벌금(원), 0km 벌금(원), 벌금 메모(선택). 금액 입력은 천 단위 구분 표시.

### 4.5 그룹 생성 (`/groups/new`), 가입 요청 화면

같은 필드 세트. 가입 요청 카드에는 규칙 요약 한 줄("열정 15km · 자유 5km · 미달 1km당 10,000원").

### 4.6 프로필

`RestSection` 삭제. 내 유형 뱃지와 "유형은 방장만 바꿀 수 있어요" 안내 한 줄.

### 4.7 주간 요약 카드 (`SummaryCard.tsx`)

성공/실패 집계 밑에 "벌금 합계 60,000원" 한 줄(0원이면 숨김).

### 4.8 텍스트 자원

- `src/lib/errors.ts`: `already_resting`, `not_resting` 제거, `same_runner_type: '이미 그 유형입니다.'` 추가.
- `src/lib/notification-text.ts`: `runner_type_changed` → "방장이 회원님을 {유형}로 변경했습니다." 휴식 3종은 "휴식 관련 알림(종료된 기능)".
- 유형 라벨 상수 `RUNNER_TYPE_LABEL = { passion: '열정러너', free: '자유러너', injured: '부상러너' }`를 `src/lib/domain/runner-type.ts`에 둔다.

## 5. 범위 밖

- 멤버가 스스로 유형 변경을 요청하는 흐름(예전 휴식 신청에 해당). 필요해지면 별도 설계.
- 벌금 납부·정산 추적, 누적 벌금 대시보드.
- 과거 확정 주차의 재평가.
- 그룹별 유형 이름·색 커스터마이징.

## 6. 테스트

- 단위(`tests/unit/penalty.test.ts`): 올림 경계(0.1km 미달 → 1km), 정확히 목표 도달, 0m 고정액 대체, 자유/부상 분기, 단가 0원.
- 단위: `notification-text` 새 종류, 관리자 세그먼트 라벨 매핑.
- 통합(`tests/integration/runner-types.test.ts`):
  - 유형별 마감 결과·`penalty_won`·`rank`(자유·부상 null).
  - SQL `app.evaluate`와 TS `evaluate` 교차 비교(동일 입력 표).
  - 주 중 유형 변경이 `open` 주 `week_members`에 즉시 반영, `closing` 주에는 미반영.
  - 관리자가 아니면 `set_member_runner_type` 거부(RLS/권한).
  - 휴식 중이던 멤버가 마이그레이션 후 `injured`로 전환(seed에 `rest_started_at`을 심은 뒤 마이그레이션 적용 시나리오는 로컬 `db:reset`으로 검증하고, 테스트는 결과 상태만 단언).
  - 기존 `rest.test.ts`는 삭제하고 위 시나리오로 대체.
- e2e(`core-flow.spec.ts` 확장): 관리자가 멤버를 자유러너로 변경 → 트랙에 파란 뱃지(`aria-label="자유러너"`) 표시.
- `npm run verify`, `npm run test:integration` 통과.

## 7. 구현 순서(요약)

1. 마이그레이션 + 타입 재생성 + 통합 테스트.
2. 도메인 `penalty.ts`, 라벨 상수, 단위 테스트.
3. 서버 액션(`member.ts`, `group.ts` 수정, `rest.ts` 삭제).
4. `RunnerBadge`·`Avatar` → 트랙·모달·관리자·프로필·요약 순으로 UI.
5. 알림 문구, 에러 문구, 삭제된 휴식 UI 정리, e2e.
