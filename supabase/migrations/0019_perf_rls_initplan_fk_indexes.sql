-- =============================================================================
-- 0019_perf_rls_initplan_fk_indexes.sql  —  데이터가 늘어도 느려지지 않게 (동작은 그대로)
--
-- 배경 (2026-10-19 Supabase 성능 점검, 운영·테스트 같음)
--   1) RLS 정책 39개가 auth.uid() 를 "행마다" 다시 계산한다 (auth_rls_initplan 경고).
--      `(select auth.uid())` 로 감싸면 쿼리당 한 번만 계산한다. is_admin() 도 같은 이유로 감싼다.
--      값은 한 쿼리 안에서 바뀌지 않으므로 결과는 같다.
--   2) 외래키 7개에 인덱스가 없다. 특히 post_comments.post_id — 글마다 댓글을 찾을 때와
--      알림(내 글에 달린 댓글)에서 표 전체를 훑는다. 나머지는 회원 탈퇴 때 연결 행을 찾는 데 쓰인다.
--
-- 정책은 하나씩 손으로 옮겨 쓰지 않고, 지금 걸려 있는 정책 식을 읽어 그 안의 두 함수만 감싼다.
-- 그래서 테스트(가족 공유 정책 포함)·운영(없음) 어디서 돌려도 그 DB 의 정책만 바뀐다.
-- 이미 감싼 식은 건너뛰므로 여러 번 돌려도 된다 (뒤에 새 정책이 생기면 다시 돌리면 됨).
--
-- 확인: tests/0019_rehearsal.sql — 계정 5종(비로그인·momA·momB·dadC·admin) × 모든 표의 보이는 행 수를
--       적용 전후로 비교. 다르면 멈춘다.
-- 적용: 테스트 2026-10-19 (리허설 100칸 동일 → 적용 → rls.spec·reactions·family 37/37 통과, 성능 경고 auth_rls_initplan 0).
--       운영 리허설 2026-10-19 통과 (90칸 동일). 운영 적용은 사장님 승인 뒤.
-- =============================================================================
begin;

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

commit;

-- 되돌리기: 인덱스는 drop index, 정책은 감싼 식이 의미상 같아 되돌릴 필요가 없다.
