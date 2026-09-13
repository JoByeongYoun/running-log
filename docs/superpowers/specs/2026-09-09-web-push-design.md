# Web Push 알림 설계

작성일: 2026-09-09

## 1. 목표와 범위

모바일(및 데스크톱) 브라우저에서 앱 내 알림이 생성될 때 Web Push로 기기 알림을 보낸다.

- 전달 채널: Web Push(PWA). 네이티브 앱 없음. iOS는 16.4 이상이고 홈 화면에 설치한 PWA에서만 동작한다.
- 대상: 기존 7종 알림 전부(join_request, join_result, record_submitted, record_review, record_expired, review_reminder, week_final). 유형별 설정은 두지 않는다.
- 권한 요청: 홈 화면 배너의 [켜기] 버튼과 프로필 페이지 토글. 온보딩에는 넣지 않는다.
- 발송 트리거: `notifications` insert → DB 트리거 → `pg_net`으로 Next.js 웹훅 호출. cron 폴링·재시도는 두지 않는다(추후 필요 시 추가).

## 2. 전체 구조

```
[사용자: 알림 켜기 탭] → PushManager.subscribe()
   → 서버 액션 savePushSubscription → public.push_subscriptions upsert

[DB] app.notify() insert → after insert 트리거 app.push_webhook()
   → net.http_post(app.settings.push_webhook_url, x-push-secret, {notificationId})
   → Next.js POST /api/push/dispatch
      → get_push_payload(id) → 문구 생성 → 수신자의 구독 전부에 web-push 발송
      → 404/410 구독 삭제, 성공 시 last_used_at 갱신

[서비스 워커] push → showNotification / notificationclick → 링크로 이동
```

## 3. DB (`supabase/migrations/0010_push.sql`)

### 3.1 테이블 `public.push_subscriptions`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| user_id | uuid not null → profiles(id) on delete cascade | 소유자 |
| endpoint | text not null unique | 브라우저 푸시 URL. 기기(브라우저)당 하나 |
| p256dh | text not null | 암호화 키 |
| auth | text not null | 인증 키 |
| user_agent | text | 프로필에서 기기 표시용 |
| created_at | timestamptz not null default now() | |
| last_used_at | timestamptz | 마지막 발송 성공 시각 |

인덱스: `(user_id)`.
RLS: `user_id = auth.uid()` 조건으로 select/insert/update/delete 허용. service role은 RLS 우회.
저장은 endpoint 기준 upsert(`on conflict (endpoint) do update set user_id, p256dh, auth, user_agent`). 같은 endpoint를 다른 계정이 다시 등록하면 소유자가 바뀐다(기기 공유 시 로그아웃 후 다른 계정 로그인). RLS로는 타인 행 update가 막히므로 upsert는 security definer RPC `public.save_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent)`로 수행한다.

### 3.2 알림 뷰 공용 함수 `app.notification_view(n public.notifications, p_uid uuid) returns jsonb`

기존 `get_notifications`의 `link`/`meta` case문을 이 함수로 옮긴다. 반환은 `{id, type, targetId, groupId, readAt, createdAt, link, meta}`. 권한 판정(`app.is_group_admin`, `app.can_view_record`, `app.can_view_week`)은 `auth.uid()`가 아니라 `p_uid`를 기준으로 해야 한다.

- 이 세 함수가 현재 `auth.uid()`를 내부에서 읽는다면 `p_uid` 인자를 받는 오버로드를 추가하고 기존 시그니처는 그 오버로드에 위임한다.
- `get_notifications`는 `app.notification_view(n, uid)`를 호출하도록 바꾼다. 반환 형식은 동일하게 유지한다(화면 코드 변경 없음).

### 3.3 발송용 RPC `public.get_push_payload(p_notification_id uuid) returns jsonb`

security definer. `notifications` 한 행을 읽어 `jsonb_build_object('userId', n.user_id, 'view', app.notification_view(n, n.user_id))`를 돌려준다. 없으면 null. `grant execute ... to service_role`만 부여하고 `authenticated`에는 부여하지 않는다.

### 3.4 설정 테이블 `app.settings`

`key text primary key, value text not null`. 사용 키: `push_webhook_url`, `push_webhook_secret`. 마이그레이션에는 값을 넣지 않는다.

- 로컬: `supabase/seed.sql`에서 `http://host.docker.internal:3000/api/push/dispatch`와 `.env.local`의 시크릿과 같은 값을 insert.
- 클라우드: `docs/deploy.md`에 `insert into app.settings ... on conflict do update` SQL 안내.

### 3.5 트리거 `app.push_webhook()` on `public.notifications` after insert for each row

```
url := (select value from app.settings where key = 'push_webhook_url');
secret := (select value from app.settings where key = 'push_webhook_secret');
if url is null or secret is null then return new; end if;
perform net.http_post(url := url,
  headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret),
  body := jsonb_build_object('notificationId', new.id));
return new;
```

`create extension if not exists pg_net with schema extensions;`를 마이그레이션 상단에 둔다. `net.http_post` 호출 실패는 `exception when others then return new`로 삼켜 알림 insert 자체는 실패하지 않게 한다.

## 4. 서버 발송

### 4.1 환경변수

| 이름 | 용도 |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 브라우저 구독 시 applicationServerKey |
| `VAPID_PRIVATE_KEY` | 서명 |
| `VAPID_SUBJECT` | `mailto:` 형식 연락처 |
| `PUSH_WEBHOOK_SECRET` | 웹훅 인증. `app.settings.push_webhook_secret`과 같아야 함 |

키 생성: `npx web-push generate-vapid-keys`. `.env.example`, README 환경변수 표, `docs/deploy.md` 3절에 추가한다.

### 4.2 `src/lib/notification-text.ts`

`src/app/notifications/page.tsx`의 `text(n)` 함수와 `Item` 타입을 이 파일로 옮긴다. export: `notificationText(view): string`, `notificationTitle(view): string`(week_final은 `meta.groupName`, 그 외 `'Running Log'`). 페이지는 이 모듈을 import한다.

### 4.3 `src/lib/push/send.ts` (server-only)

- `web-push` 패키지를 lazy 초기화. VAPID 환경변수가 하나라도 없으면 `isPushConfigured() === false`.
- `sendToUser(admin, userId, payload: {title, body, url, tag}): Promise<{sent, removed, failed}>`
  - `push_subscriptions`에서 userId의 행 전부 조회.
  - 각 행에 `webpush.sendNotification(subscription, JSON.stringify(payload), {TTL: 86400})`. `Promise.allSettled`로 병렬.
  - statusCode 404 또는 410 → 해당 행 delete, `removed++`.
  - 성공 → `last_used_at = now()`, `sent++`. 그 외 오류 → `failed++`, 로그.

### 4.4 라우트 `src/app/api/push/dispatch/route.ts`

`export const dynamic = 'force-dynamic'`. POST만.

1. `x-push-secret` 헤더가 `PUSH_WEBHOOK_SECRET`과 다르거나 환경변수가 없으면 401.
2. body를 zod `{notificationId: z.uuid()}`로 검증. 실패 시 400.
3. `createAdminSupabase().rpc('get_push_payload', {p_notification_id})`. 결과가 null이면 `{ok: true, skipped: 'not_found'}` 200.
4. VAPID 미설정이면 로그 남기고 `{ok: true, skipped: 'unconfigured'}` 200.
5. 문구 생성 후 `sendToUser`. `url`은 `view.link ?? '/notifications'`.
6. `console.log(JSON.stringify({job: 'push', notificationId, type, sent, removed, failed}))`. 본문·endpoint는 로그에 남기지 않는다.
7. 200 `{ok: true, sent, removed, failed}`.

`src/proxy.ts`의 `PUBLIC_PREFIXES`에 `/api/push/` 추가.

## 5. 클라이언트

### 5.1 서버 액션 `src/actions/push.ts`

- `savePushSubscription(input)`: zod `{endpoint: z.url(), keys: {p256dh: z.string().min(1), auth: z.string().min(1)}, userAgent: z.string().max(300).optional()}`. 세션 필수. RPC `save_push_subscription` 호출. 반환 `{ok: true} | {ok: false, error}`.
- `deletePushSubscription(endpoint)`: 본인 행 delete.
- `hasPushSubscription(endpoint)`: 프로필/배너 초기 상태용. select head count.

### 5.2 훅 `src/lib/push/usePushSubscription.ts` (client)

상태: `'loading' | 'unsupported' | 'ios-install-required' | 'denied' | 'available' | 'subscribed'`.

판정 순서:
1. `process.env.NODE_ENV !== 'production'`(서비스 워커 미등록) 또는 `!('PushManager' in window)` 또는 `!('serviceWorker' in navigator)` → iOS Safari이고 `!window.matchMedia('(display-mode: standalone)').matches`면 `ios-install-required`, 아니면 `unsupported`.
2. `Notification.permission === 'denied'` → `denied`.
3. `navigator.serviceWorker.ready` → `registration.pushManager.getSubscription()`이 있고 서버에도 있으면 `subscribed`, 아니면 `available`.

`subscribe()`:
1. `Notification.requestPermission()`. `granted`가 아니면 상태 갱신 후 종료.
2. `pushManager.subscribe({userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(NEXT_PUBLIC_VAPID_PUBLIC_KEY)})`.
3. `savePushSubscription`. 실패하면 `subscription.unsubscribe()`로 되돌리고 오류 반환.

`unsubscribe()`: 브라우저 `subscription.unsubscribe()` → `deletePushSubscription(endpoint)`.

### 5.3 홈 배너 `src/components/pwa/PushBanner.tsx`

홈 페이지(그룹 소속 상태)에서 헤더 아래 카드 한 줄.

| 상태 | 표시 |
|---|---|
| available | "새 알림을 기기에서 바로 받아보세요" + [켜기] + [×] |
| ios-install-required | "홈 화면에 추가하면 알림을 받을 수 있어요" + [×] |
| 그 외 | 표시 안 함 |

[×]는 `localStorage['push-banner-dismissed'] = '1'`로 기록하고 이후 숨긴다. 켜기 성공 시 배너 제거, 실패 시 기존 Toast 컴포넌트로 오류 안내.

### 5.4 프로필 섹션 `src/app/profile/PushSection.tsx`

"푸시 알림" 제목 아래 상태 문구와 버튼.

| 상태 | 문구 | 버튼 |
|---|---|---|
| subscribed | 이 기기에서 알림을 받고 있어요 | 끄기 |
| available | 꺼져 있어요 | 켜기 |
| denied | 브라우저 설정에서 알림을 허용한 뒤 다시 시도하세요 | 없음 |
| ios-install-required | 홈 화면에 추가한 뒤 켤 수 있어요 | 없음 |
| unsupported | 이 브라우저는 푸시 알림을 지원하지 않아요 | 없음 |

### 5.5 서비스 워커 (`src/app/sw.js/source.ts`)

```
self.addEventListener('push', (event) => {
  let data = {}; try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'Running Log';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: data.tag, data: { url: data.url || '/notifications' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => c.url.startsWith(self.location.origin));
    if (win) return win.navigate(url).then((w) => w && w.focus());
    return self.clients.openWindow(url);
  }));
});
```

앱이 포그라운드일 때도 알림을 표시한다(억제 없음).

## 6. 오류 처리

| 상황 | 처리 |
|---|---|
| 웹훅 호출 실패(서버 다운 등) | pg_net 비동기라 DB 트랜잭션 영향 없음. 푸시 유실, 앱 내 알림은 유지. 재시도 없음 |
| 트리거 내부 예외 | 삼키고 insert는 성공 |
| 시크릿 불일치 | 401 |
| body 형식 오류 | 400 |
| 알림 없음 | 200 skipped |
| VAPID 미설정 | 로그 후 200 skipped |
| 발송 404/410 | 구독 삭제 |
| 발송 기타 오류 | 로그, failed 카운트 |
| 구독 저장 실패 | 브라우저 구독 해지, Toast 안내 |

## 7. 테스트

단위(vitest, `tests/unit`):
- `notification-text.test.ts`: 7종 문구와 제목.
- `push-dispatch-route.test.ts`: 401/400/not_found/unconfigured/정상 경로. `@/lib/push/send`와 admin 클라이언트 mock.
- `push-send.test.ts`: web-push mock으로 410 시 delete 호출, 성공 시 last_used_at update, 기타 오류 시 failed 카운트.

통합(`tests/integration`, 로컬 Supabase):
- `push.test.ts`: `push_subscriptions` RLS(타인 행 조회/삭제 불가), `save_push_subscription` upsert 동작, `get_push_payload`가 `get_notifications`와 같은 link/meta 반환, `app.settings` 비어 있을 때 알림 insert가 오류 없이 성공.

수동:
- 로컬: `.env.local`에 VAPID 키와 시크릿 설정, `app.settings` seed, `npm run build && npm start`(서비스 워커는 production만 등록) → Android Chrome에서 켜기 → 기록 제출 → 관리자 기기에 알림 도착 확인.
- 배포 후: iOS 홈 화면 설치 → 켜기 → 수신 확인. `docs/deploy.md` 5절 확인 목록에 추가.

## 8. 파일 목록

신규:
- `supabase/migrations/0010_push.sql`
- `src/lib/notification-text.ts`
- `src/lib/push/send.ts`, `src/lib/push/usePushSubscription.ts`
- `src/app/api/push/dispatch/route.ts`
- `src/actions/push.ts`
- `src/components/pwa/PushBanner.tsx`
- `src/app/profile/PushSection.tsx`
- 테스트 4개

수정:
- `src/app/sw.js/source.ts`, `src/app/notifications/page.tsx`, `src/app/page.tsx`(배너 삽입), `src/app/profile/page.tsx`, `src/proxy.ts`
- `supabase/seed.sql`, `src/lib/db/types.ts`(재생성), `.env.example`, `README.md`, `docs/deploy.md`, `package.json`(`web-push`, `@types/web-push`)

## 9. 결정 사항 요약

- Web Push 단독, 7종 전부, 유형별 설정 없음.
- 권한 요청은 홈 배너 + 프로필 토글.
- 발송은 DB 트리거 → pg_net 웹훅 단독. 폴링·재시도 없음.
- 작업은 `feat/web-push` 브랜치(워크트리)에서 하고 PR로 올린다. main에 직접 push하지 않는다.
