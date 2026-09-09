-- 0008_realtime.sql : 화면 자동 갱신용 Realtime publication.
-- 클라이언트는 postgres_changes 이벤트를 받으면 router.refresh()만 호출한다.
-- 이벤트 페이로드는 각 테이블의 RLS select 정책을 통과한 행만 전달된다.
alter publication supabase_realtime add table
  public.running_records,
  public.record_reviews,
  public.comments,
  public.notifications,
  public.join_requests,
  public.memberships,
  public.group_weeks;
