-- =============================================================================
-- tests/0007_rehearsal.sql — 0007 리허설. begin ... rollback 이라 DB 에 남지 않는다.
--
-- 주의(0005 에서 겪은 것): 적용 전 값은 반드시 본문보다 "먼저" 담고,
-- 적용 후 값은 본문이 끝난 "뒤에" update 로 채운다.
-- 본문이 만드는 객체를 본문 앞에서 조회하면 42P01 로 통째로 실패한다.
-- =============================================================================
begin;

create temp table _r(k text primary key, before_val text, after_val text) on commit drop;

insert into _r(k, before_val) values
  ('purge 함수에 is_admin 검사',
     (select case when pg_get_functiondef(p.oid) like '%is_admin%' then '있음' else '없음 (뚫림)' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='purge_expired_pii')),
  ('purge 를 부를 수 있는 로그인 사용자',
     (select case when has_function_privilege('authenticated','public.purge_expired_pii()','execute')
                  then '전원' else '없음' end)),
  ('pii_access_log.viewer_id NOT NULL',
     (select case when attnotnull then '예 (탈퇴 시 23502)' else '아니오' end
        from pg_attribute
       where attrelid='public.pii_access_log'::regclass and attname='viewer_id')),
  ('열람 기록 건수',
     (select count(*)::text from public.pii_access_log)),
  ('bap_insert 가 신청서 소유까지 보는가',
     (select case when coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'') like '%owns_application%'
                  then '본다' else '안 본다 (남의 신청서에 심을 수 있음)' end
        from pg_policy pol
       where pol.polrelid = 'public.benefit_applications_pii'::regclass
         and pol.polname = 'bap_insert'));

-- ─────────────────────────────────────── 본문 ──
create or replace function public.purge_expired_pii()
returns integer language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.benefit_applications_pii where purge_after < current_date;
  get diagnostics n = row_count;
  return n;
end $fn$;
revoke all on function public.purge_expired_pii() from public, anon;
grant execute on function public.purge_expired_pii() to authenticated;

alter table public.pii_access_log alter column viewer_id drop not null;

create or replace function public.owns_application(app_id uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.benefit_applications
     where id = app_id and owner_id = uid
  );
$fn$;
revoke all on function public.owns_application(uuid, uuid) from public, anon;
grant execute on function public.owns_application(uuid, uuid) to authenticated;
drop policy if exists bap_insert on public.benefit_applications_pii;
create policy bap_insert on public.benefit_applications_pii for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.owns_application(application_id, auth.uid())
  );
-- ──────────────────────────────────── 본문 끝 ──

update _r set after_val = (
  select case when pg_get_functiondef(p.oid) like '%is_admin%' then '있음' else '없음 (뚫림)' end
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='purge_expired_pii')
 where k = 'purge 함수에 is_admin 검사';

update _r set after_val = (
  select case when has_function_privilege('authenticated','public.purge_expired_pii()','execute')
              then '전원 (단, 본문에서 검수자만 통과)' else '없음' end)
 where k = 'purge 를 부를 수 있는 로그인 사용자';

update _r set after_val = (
  select case when attnotnull then '예 (탈퇴 시 23502)' else '아니오' end
    from pg_attribute
   where attrelid='public.pii_access_log'::regclass and attname='viewer_id')
 where k = 'pii_access_log.viewer_id NOT NULL';

update _r set after_val = (select count(*)::text from public.pii_access_log)
 where k = '열람 기록 건수';

update _r set after_val = (
  select case when coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'') like '%owns_application%'
              then '본다' else '안 본다 (남의 신청서에 심을 수 있음)' end
    from pg_policy pol
   where pol.polrelid = 'public.benefit_applications_pii'::regclass
     and pol.polname = 'bap_insert')
 where k = 'bap_insert 가 신청서 소유까지 보는가';

-- (B) 를 실제로 재현해 본다: 열람 기록을 가진 계정을 지우면 예전엔 23502 였다.
do $t$
declare vid uuid;
begin
  select viewer_id into vid from public.pii_access_log where viewer_id is not null limit 1;
  if vid is null then
    insert into _r(k, before_val, after_val) values ('탈퇴 재현', '기록 없음', '건너뜀');
    return;
  end if;
  begin
    -- 여기서 FK 의 on delete set null 이 동작한다.
    delete from auth.users where id = vid;
    insert into _r(k, before_val, after_val)
      values ('열람 기록 가진 검수자 탈퇴', '23502 로 실패했음', '성공 · 기록은 남고 viewer_id 만 NULL');
  exception when others then
    insert into _r(k, before_val, after_val)
      values ('열람 기록 가진 검수자 탈퇴', '23502 로 실패했음', '여전히 실패: ' || SQLSTATE || ' ' || SQLERRM);
  end;
end $t$;

select k as "항목", before_val as "적용 전", after_val as "적용 후" from _r order by k;

rollback;
