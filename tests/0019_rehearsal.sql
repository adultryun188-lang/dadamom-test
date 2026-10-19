-- =============================================================================
-- 0019 리허설 — 정책을 감싸기 전후로 "누가 무엇을 볼 수 있나"가 같은지
--
-- 계정 5종(비로그인·momA·momB·dadC·admin) × RLS 가 걸린 모든 표에서 보이는 행 수를 센 뒤,
-- 0019 를 적용하고 다시 세어 비교한다. 결과는 마지막 오류 메시지로 나오고 전부 롤백된다.
-- 테스트 계정 id 는 supabase/seed 의 고정값. 운영에서 돌리면 테스트 계정이 없어 0행끼리 비교만 된다.
-- =============================================================================
begin;

create function pg_temp._snap() returns jsonb language plpgsql as $f$
declare who record; t record; n bigint; out jsonb := '{}';
begin
  for who in select * from (values
      ('anon',  null::uuid, null::text),
      ('momA',  '22222222-2222-2222-2222-222222222222'::uuid, 'momA@dadamom.test'),
      ('momB',  '33333333-3333-3333-3333-333333333333'::uuid, 'momB@dadamom.test'),
      ('dadC',  '44444444-4444-4444-4444-444444444444'::uuid, 'dadC@dadamom.test'),
      ('admin', '11111111-1111-1111-1111-111111111111'::uuid, 'admin@dadamom.test')) v(name, id, email) loop
    for t in select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
              where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity order by 1 loop
      begin
        if who.id is null then
          perform set_config('request.jwt.claims', '{"role":"anon"}', true);
          execute 'set local role anon';
        else
          perform set_config('request.jwt.claims', json_build_object('sub', who.id, 'role', 'authenticated', 'email', who.email)::text, true);
          execute 'set local role authenticated';
        end if;
        execute format('select count(*) from public.%I', t.relname) into n;
        execute 'reset role';
      exception when insufficient_privilege then
        n := -1;   -- 표 권한 자체가 없음 (전후 같아야 함)
      end;
      out := out || jsonb_build_object(who.name || '.' || t.relname, n);
    end loop;
  end loop;
  return out;
end $f$;

create temp table _before as select pg_temp._snap() as s;

-- ↓ supabase/migrations/0019 본문과 같음 (begin/commit 제외)
create index if not exists post_comments_post_idx        on public.post_comments (post_id, created_at);
create index if not exists ba_pii_owner_idx              on public.benefit_applications_pii (owner_id);
create index if not exists blocks_blocked_idx            on public.blocks (blocked_id);
create index if not exists notices_owner_idx             on public.notices (owner_id);
create index if not exists outings_owner_idx             on public.outings (owner_id);
create index if not exists pii_access_log_viewer_idx     on public.pii_access_log (viewer_id);
create index if not exists reports_target_owner_idx      on public.reports (target_owner);
-- 운영에만 있던 작성자 인덱스 (이름도 운영과 같게 — 운영에서는 이미 있어 건너뜀)
create index if not exists idx_community_posts_owner     on public.community_posts (owner_id);
create index if not exists idx_challenge_entries_owner   on public.challenge_entries (owner_id);
create index if not exists idx_post_comments_owner       on public.post_comments (owner_id);

do $rw$
declare r record; q text; c text; s text;
begin
  for r in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := r.qual; c := r.with_check;
    if q is not null and position('SELECT auth.uid()' in q) = 0 then q := replace(q, 'auth.uid()', '(select auth.uid())'); end if;
    if q is not null and position('SELECT is_admin()' in q) = 0 then q := replace(q, 'is_admin()', '(select is_admin())'); end if;
    if c is not null and position('SELECT auth.uid()' in c) = 0 then c := replace(c, 'auth.uid()', '(select auth.uid())'); end if;
    if c is not null and position('SELECT is_admin()' in c) = 0 then c := replace(c, 'is_admin()', '(select is_admin())'); end if;
    if q is distinct from r.qual or c is distinct from r.with_check then
      s := format('alter policy %I on public.%I', r.policyname, r.tablename);
      if q is not null then s := s || ' using (' || q || ')'; end if;
      if c is not null then s := s || ' with check (' || c || ')'; end if;
      execute s;
    end if;
  end loop;
end $rw$;
-- ↑

do $v$
declare b jsonb := (select s from _before); a jsonb := pg_temp._snap(); diff text; left_n int;
begin
  select string_agg(k || ' ' || (b->>k) || '→' || (a->>k), ', ') into diff
    from jsonb_object_keys(b) k where (b->>k) is distinct from (a->>k);
  select count(*) into left_n from pg_policies where schemaname = 'public'
     and ((qual ~ 'auth\.uid\(\)' and qual !~ 'SELECT auth\.uid\(\)') or (with_check ~ 'auth\.uid\(\)' and with_check !~ 'SELECT auth\.uid\(\)'));
  raise exception 'REHEARSAL(롤백됨) 비교 % 칸 · 달라진 칸: % · 안 감싼 정책 남음: % · 예) momA.community_posts=% admin.profiles=% anon.community_posts=%',
    (select count(*) from jsonb_object_keys(b)), coalesce(diff, '없음'), left_n,
    a->>'momA.community_posts', a->>'admin.profiles', a->>'anon.community_posts';
end $v$;
