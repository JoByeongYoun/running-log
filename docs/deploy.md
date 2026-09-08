# 배포 가이드

## 0. 필요한 값 (사용자 준비)

| 항목 | 설명 |
|---|---|
| Supabase 프로젝트 2개 | 개발(미리보기용), 운영. 각 URL / Publishable key / Secret key |
| Vercel 프로젝트 | GitHub 저장소 연결. 요금제 결정(아래 4절) |
| 운영 도메인 | 예: `https://run.example.com` |
| `CRON_SECRET` | `openssl rand -hex 32` |

## 1. 마이그레이션 적용

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push                      # supabase/migrations 만 적용. seed.sql은 적용되지 않음
```
확인: Supabase Studio → SQL → `select test_mode from app.test_clock;` 가 `false` 여야 한다.

## 2. Supabase Auth 설정 (Dashboard → Authentication → URL Configuration)

- Site URL: `https://<도메인>`
- Redirect URLs: `https://<도메인>/auth/callback`, `https://*-<vercel-team>.vercel.app/auth/callback` (미리보기)
- Email: Confirm email 켜기. 템플릿의 링크는 기본 `{{ .ConfirmationURL }}` 유지 (PKCE code → `/auth/callback`).
- 운영 발송량이 늘면 Custom SMTP 설정(기본 SMTP는 시간당 발송 제한이 있다).

## 3. Vercel 환경 변수

Preview 환경에는 개발 Supabase, Production 환경에는 운영 Supabase 값을 넣는다. 5개 변수 모두 필요 (README 표). `NEXT_PUBLIC_SITE_URL`은 Production에 운영 도메인, Preview에는 비워두지 말고 미리보기 도메인 패턴 대신 `https://<project>.vercel.app`을 넣는다.

## 4. 예약 작업 (스펙 12절, 목표 5분 간격)

Vercel 공식 문서(2026-09-08 확인): Hobby는 cron **하루 1회**·시간 단위 정밀도(±59분), Pro는 분 단위. `vercel.json`의 `*/5 * * * *`는 Hobby에서 배포가 실패한다.

선택지 (개발자가 임의로 결정하지 않음 — 사용자 결정 필요):

1. **Vercel Pro**: `vercel.json` 그대로 사용. Settings → Cron Jobs 에서 실행 로그 확인.
2. **Hobby 유지 + Supabase pg_cron (권장, 무료)**: Dashboard → Database → Extensions에서 `pg_cron` 활성화 후 SQL:
   ```sql
   select cron.schedule('weekly-maintenance', '*/5 * * * *', $$select public.run_week_maintenance();$$);
   ```
   `vercel.json`의 crons 항목은 삭제하거나 `0 3 * * *`(하루 1회, 보조)로 바꾼다.
3. **Hobby 유지 + 하루 1회**: `vercel.json` 스케줄을 `0 3 * * *`(KST 12:00)로 변경. 화면 전환과 마감 판정은 조회 시 `reconcile_group`이 서버 시각으로 처리하므로 기능은 유지되지만, 아무도 접속하지 않는 그룹의 알림·확정은 최대 하루 지연된다.

어느 경우든 마감 로직은 DB 함수 `run_week_maintenance()` 하나이며, 조회(`get_week_dashboard`, `claim_summary_auto_show`)가 현재 주 생성과 마감을 함께 복구한다.

수동 실행 / 장애 복구:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/cron/weekly
# 또는 SQL: select public.run_week_maintenance();
# 실행 이력: select * from app.maintenance_runs order by started_at desc limit 20;
```
로그에는 시작·종료 시각과 영향 주차 ID만 남는다. 비밀 키·서명 URL·사진은 기록하지 않는다.

## 5. 배포 후 확인

1. 가입 → 확인 메일 → 온보딩 → 그룹 생성 → 초대 링크 → 두 번째 계정 참여 요청 → 승인.
2. 기록 등록(사진 1~5장) → 관리자 승인 → 대시보드 합계 반영.
3. `curl` 로 cron 엔드포인트 200 확인, `app.maintenance_runs` 행 생성 확인.
4. 모바일: Android Chrome 설치 배너, iOS Safari 홈 화면 추가 안내, standalone 실행, 비행기 모드에서 `/offline` 표시.
5. DevTools → Application → Cache Storage에 `/`나 API 응답이 없는지 확인 (정적 자산만 있어야 함).

## 6. 미리보기 정리

- 미리보기 배포는 개발 Supabase만 가리키므로 운영 DB를 건드리지 않는다.
- 미리보기 도메인은 Auth Redirect 허용 목록의 와일드카드 항목으로 처리한다.
