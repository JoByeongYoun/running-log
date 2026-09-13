-- Local development only. Never applied by `supabase db push`.
update app.test_clock set test_mode = true where id;

-- 로컬 Web Push 웹훅. 시크릿은 .env.local 의 PUSH_WEBHOOK_SECRET 과 같아야 한다.
insert into app.settings (key, value) values
  ('push_webhook_url', 'http://host.docker.internal:3000/api/push/dispatch'),
  ('push_webhook_secret', 'local-push-secret')
on conflict (key) do update set value = excluded.value;
