-- TEST ONLY: confirm dashboard ref srxdtddrtnhtlbbviyvs before running.
-- Metadata only; no member records, source content, keys, or tokens.
select jsonb_build_object(
 'database',current_database(),'server_time',clock_timestamp(),
 'pilot_cohort_exists',to_regclass('public.pilot_activity_cohort') is not null,
 'pilot_days_exists',to_regclass('public.pilot_activity_days') is not null,
 'max_migration',(select max(version) from supabase_migrations.schema_migrations),
 '0044_history',(select count(*) from supabase_migrations.schema_migrations where version='0044'),
 'cron_installed',exists(select 1 from pg_extension where extname='pg_cron'),
 'cron_available',exists(select 1 from pg_available_extensions where name='pg_cron'),
 'pilot_job_count',(select count(*) from cron.job where jobname='dadamom-pilot-activity-purge-daily'),
 'cron_timezone',current_setting('cron.timezone',true),
 'columns',(select jsonb_agg(jsonb_build_object('table',table_name,'name',column_name,'type',data_type,'nullable',is_nullable,'default',column_default) order by table_name,ordinal_position) from information_schema.columns where table_schema='public' and table_name in('community_posts','post_comments')),
 'constraints',(select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'def',pg_get_constraintdef(oid))) from pg_constraint where conrelid in('public.community_posts'::regclass,'public.post_comments'::regclass)),
 'triggers',(select jsonb_agg(jsonb_build_object('def',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid))) from pg_trigger t where not t.tgisinternal and t.tgrelid in('public.community_posts'::regclass,'public.post_comments'::regclass))
) as preflight;
