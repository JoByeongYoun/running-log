-- Local development only. Never applied by `supabase db push`.
update app.test_clock set test_mode = true where id;
