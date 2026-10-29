-- TEST ONLY srxdtddrtnhtlbbviyvs. 전용 transaction fixture 최소 입력 추출; 영구 등록 없음.
begin;
do $$begin
 if exists(select 1 from auth.users where id='00440000-2026-4029-8044-000000000001')
 or exists(select 1 from public.pilot_activity_cohort) or exists(select 1 from public.pilot_activity_days)
 then raise exception 'STOP: fixture collision or nonempty pilot tables';end if;
end$$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change_token_current,email_change,phone_change,phone_change_token,reauthentication_token)
values('00440000-2026-4029-8044-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','0044-export-fixture@dadamom.test','',now(),'{"provider":"email","providers":["email"]}','{}',now()-interval '100 days',now(),'','','','','','','','');
insert into public.pilot_activity_cohort(user_id,joined_at,enrolled_at,expires_at)
values('00440000-2026-4029-8044-000000000001',now()-interval '100 days',now()-interval '8 days',now()+interval '22 days');
create temp table pilot_export_post as
with p as (insert into public.community_posts(owner_id,author,text)
values('00440000-2026-4029-8044-000000000001','0044 export fixture','virtual test') returning id) select id from p;
insert into public.post_comments(owner_id,post_id,author,content)
select '00440000-2026-4029-8044-000000000001',id,'0044 export fixture','virtual test' from pilot_export_post;
select jsonb_build_object('asOf',now(),
 'cohort',(select jsonb_agg(jsonb_build_object('user_id',user_id,'joined_at',joined_at,'enrolled_at',enrolled_at,'expires_at',expires_at)) from public.pilot_activity_cohort where user_id='00440000-2026-4029-8044-000000000001'),
 'days',(select jsonb_agg(jsonb_build_object('user_id',user_id,'activity_day',activity_day,'kind',kind,'first_at',first_at) order by kind) from public.pilot_activity_days where user_id='00440000-2026-4029-8044-000000000001')) as minimal_input;
rollback;
-- 별도 확인: 전용 auth.users id와 pilot 두 표가 모두 0이어야 한다.
