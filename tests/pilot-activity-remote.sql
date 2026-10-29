-- TEST ONLY srxdtddrtnhtlbbviyvs. Run after 0044; everything here rolls back.
-- Requires empty pilot tables. No existing account is modified; no member list is read.
begin;
set local statement_timeout='45s';
do $$begin
 if exists(select 1 from public.pilot_activity_cohort) or exists(select 1 from public.pilot_activity_days)
 then raise exception 'STOP: expected empty pilot tables'; end if;
 if to_regprocedure('public._pilot_0044_test_fail()') is not null then raise exception 'STOP: fixture name collision'; end if;
end$$;
create temp table pilot_checks(name text,ok boolean);
create function pg_temp.ok(n text,v boolean) returns void language plpgsql as $$
begin if v is not true then raise exception 'FAIL: %',n; end if; insert into pg_temp.pilot_checks values(n,true); end$$;
create temp table pilot_fixture(k text primary key,uid uuid default gen_random_uuid());
insert into pilot_fixture(k) values('a'),('b'),('c');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,
 email_change_token_new,email_change_token_current,email_change,phone_change,phone_change_token,reauthentication_token)
select uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 uid::text||'@dadamom.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','','','',''
from pilot_fixture;
create function pg_temp.post(u uuid) returns uuid language plpgsql as $$
declare p uuid; begin insert into public.community_posts(owner_id,author,text,created_at)
values(u,'0044 fixture','0044 virtual test','2000-01-01') returning id into p; return p; end$$;
create temp table pilot_posts(k text,pid uuid);
insert into pilot_posts select 'nonparticipant',pg_temp.post(uid) from pilot_fixture where k='a';
select pg_temp.ok('nonparticipant: no capture',not exists(select 1 from public.pilot_activity_days));
insert into public.pilot_activity_cohort(user_id,joined_at)
select uid,now()-interval '100 days' from pilot_fixture where k in('a','c');
select pg_temp.ok('default collection 30d',not exists(select 1 from public.pilot_activity_cohort where expires_at<>enrolled_at+interval '30 days'));
insert into pilot_posts select 'first',pg_temp.post(uid) from pilot_fixture where k='a';
insert into pilot_posts select 'duplicate',pg_temp.post(uid) from pilot_fixture where k='a';
insert into public.post_comments(owner_id,post_id,author,content,created_at)
select f.uid,p.pid,'0044 fixture','0044 comment','2000-01-01' from pilot_fixture f,pilot_posts p where f.k='a' and p.k='first';
select pg_temp.ok('post/comment split + daily dedup',(select count(*)=2 from public.pilot_activity_days where user_id=(select uid from pilot_fixture where k='a')));
select pg_temp.ok('server time + KST day',not exists(select 1 from public.pilot_activity_days where first_at<>now() or activity_day<>(now() at time zone 'Asia/Seoul')::date));
delete from public.community_posts where id in(select pid from pilot_posts);
select pg_temp.ok('source deletion preserves activity',(select count(*)=2 from public.pilot_activity_days));
-- Real authenticated source DML through existing source RLS/triggers (fixture a only).
delete from public.pilot_activity_days where user_id=(select uid from pilot_fixture where k='a');
do $$declare u uuid;p uuid:=gen_random_uuid();c uuid:=gen_random_uuid();begin
 select uid into u from pilot_fixture where k='a';
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 set local role authenticated;
 insert into public.community_posts(id,owner_id,author,text,created_at)
 values(p,u,'0044 fixture','0044 virtual test','2000-01-01');
 insert into public.post_comments(id,owner_id,post_id,author,content,created_at)
 values(c,u,p,'0044 fixture','0044 virtual comment','2000-01-01');
 reset role;
 perform pg_temp.ok('authenticated source INSERT captures both kinds',(select count(*)=2 from public.pilot_activity_days where user_id=u));
 perform pg_temp.ok('source triggers keep server timestamps',exists(select 1 from public.community_posts where id=p and created_at=now()) and exists(select 1 from public.post_comments where id=c and created_at=now()));
 set local role authenticated;
 delete from public.post_comments where id=c and owner_id=u;
 delete from public.community_posts where id=p and owner_id=u;
 reset role;
 perform pg_temp.ok('authenticated source DELETE retains activity',not exists(select 1 from public.community_posts where id=p) and not exists(select 1 from public.post_comments where id=c) and (select count(*)=2 from public.pilot_activity_days where user_id=u));
end$$;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
-- c has no activity: demonstrate a genuinely new source AND measurement row rollback.
do $$declare u uuid;p uuid;begin
 select uid into u from pilot_fixture where k='c';
 begin p:=pg_temp.post(u);
 perform pg_temp.ok('inside rollback captured',exists(select 1 from public.pilot_activity_days where user_id=u));
 raise no_data_found;
 exception when no_data_found then null;end;
 perform pg_temp.ok('source + capture rollback',not exists(select 1 from public.community_posts where id=p) and not exists(select 1 from public.pilot_activity_days where user_id=u));
 begin insert into public.community_posts(owner_id,author,text) values(u,'fixture',null);
 raise exception 'expected NOT NULL failure';exception when not_null_violation then null;end;
 perform pg_temp.ok('failed source has no capture',not exists(select 1 from public.pilot_activity_days where user_id=u));
end$$;
-- Guarded measurement failure affects only c in this transaction/session.
select set_config('dadamom.pilot_fail_user',(select uid::text from pilot_fixture where k='c'),true);
create function public._pilot_0044_test_fail() returns trigger language plpgsql as $$
begin if new.user_id::text=current_setting('dadamom.pilot_fail_user',true) then
 raise exception 'DO NOT LOG fixture detail' using errcode='23514';end if;return new;end$$;
create trigger zz_pilot_0044_test_fail before insert on public.pilot_activity_days for each row execute function public._pilot_0044_test_fail();
insert into pilot_posts select 'fail-open',pg_temp.post(uid) from pilot_fixture where k='c';
select pg_temp.ok('measurement failure preserves source',exists(select 1 from public.community_posts where id=(select pid from pilot_posts where k='fail-open')) and not exists(select 1 from public.pilot_activity_days where user_id=(select uid from pilot_fixture where k='c')));
drop trigger zz_pilot_0044_test_fail on public.pilot_activity_days;
drop function public._pilot_0044_test_fail();
-- Both roles: activity/cohort SELECT INSERT UPDATE DELETE and functions are denied.
do $$declare r text;q text;blocked boolean;u uuid;begin
 select uid into u from pilot_fixture where k='b';
 for r in select unnest(array['anon','authenticated']) loop
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',u,'role',r)::text,true);
 for q in select unnest(array[
 'select * from public.pilot_activity_days',
 'insert into public.pilot_activity_days(user_id,activity_day,kind) values('''||u||''',current_date,''post'')',
 'update public.pilot_activity_days set first_at=now()',
 'delete from public.pilot_activity_days',
 'select * from public.pilot_activity_cohort',
 'insert into public.pilot_activity_cohort(user_id,joined_at) values('''||u||''',now())',
 'update public.pilot_activity_cohort set expires_at=now()',
 'delete from public.pilot_activity_cohort',
 'select public.capture_pilot_activity_day()',
 'select public.purge_pilot_activity()']) loop
 blocked:=false;
 begin execute 'set local role '||quote_ident(r);execute q;execute 'reset role';
 exception when insufficient_privilege then execute 'reset role';blocked:=true;end;
 perform pg_temp.ok(r||' blocked: '||split_part(q,' ',1)||' '||case when q like '%cohort%' then 'cohort' when q like '%purge%' then 'purge' else 'activity' end,blocked);
 end loop;end loop;
end$$;
reset role;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
update public.pilot_activity_cohort set enrolled_at=now()-interval '2 days',expires_at=now()-interval '1 second'
where user_id=(select uid from pilot_fixture where k='c');
insert into pilot_posts select 'expired',pg_temp.post(uid) from pilot_fixture where k='c';
select pg_temp.ok('expired collection stopped',not exists(select 1 from public.pilot_activity_days where user_id=(select uid from pilot_fixture where k='c')));
update public.pilot_activity_cohort set enrolled_at=now()+interval '1 day',expires_at=now()+interval '2 days'
where user_id=(select uid from pilot_fixture where k='c');
insert into pilot_posts select 'future',pg_temp.post(uid) from pilot_fixture where k='c';
select pg_temp.ok('future enrollment stopped',not exists(select 1 from public.pilot_activity_days where user_id=(select uid from pilot_fixture where k='c')));
update public.pilot_activity_cohort set enrolled_at=now(),expires_at=now()+interval '30 days'
where user_id=(select uid from pilot_fixture where k='c');
insert into pilot_posts select 'cascade',pg_temp.post(uid) from pilot_fixture where k='c';
delete from auth.users where id=(select uid from pilot_fixture where k='c');
select pg_temp.ok('dedicated account deletion cascade',not exists(select 1 from public.pilot_activity_cohort where user_id=(select uid from pilot_fixture where k='c')) and not exists(select 1 from public.pilot_activity_days where user_id=(select uid from pilot_fixture where k='c')));
-- Test purge only against this transaction's fixtures, with initially empty pilot tables.
insert into public.pilot_activity_cohort(user_id,joined_at,enrolled_at,expires_at)
select uid,now()-interval '100 days',now()-interval '89 days'+interval '1 hour',now()-interval '60 days' from pilot_fixture where k='b';
insert into public.pilot_activity_days(user_id,activity_day,kind,first_at)
select uid,(now() at time zone 'Asia/Seoul')::date,'post',now() from pilot_fixture where k='b';
update public.pilot_activity_cohort set enrolled_at=statement_timestamp()-interval '89 days',expires_at=now()-interval '59 days' where user_id=(select uid from pilot_fixture where k='a');
create temp table pilot_purge_result as select public.purge_pilot_activity() as n;
select pg_temp.ok('89d cutoff + cascade',(select n=1 from pilot_purge_result) and not exists(select 1 from public.pilot_activity_days where user_id=(select uid from pilot_fixture where k='a')));
select pg_temp.ok('not-due fixture preserved',exists(select 1 from public.pilot_activity_cohort where user_id=(select uid from pilot_fixture where k='b')) and exists(select 1 from public.pilot_activity_days where user_id=(select uid from pilot_fixture where k='b')));
select jsonb_build_object('scope','TEST_TRANSACTION_FIXTURES_ONLY','checks',count(*),'all_passed',bool_and(ok),'results',jsonb_agg(name order by name),'cleanup','ROLLBACK follows; fixture data and test helper objects do not persist') as verification from pilot_checks;
rollback;
