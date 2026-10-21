-- =============================================================================
-- 테스트 계정 복구 — 탈퇴 테스트로 사라진 계정을 원래 uid 로 되살린다
--
-- ⚠️ 테스트 프로젝트(dadamom-test) 전용입니다. 운영에서는 아래 가드가 막습니다.
--
-- 001_test_users.sql 과 같은 내용이고, 이미 있는 계정은 건드리지 않습니다
-- (on conflict do nothing). 여러 번 돌려도 안전합니다.
--
-- 비밀번호는 전부  dadamom-test-1234
-- =============================================================================
begin;

-- ───────────────── 운영에서 실수로 돌리는 것을 막는 가드 ─────────────────
-- 아래 두 표는 테스트 프로젝트에만 있습니다(0005·0006). 운영에는 없습니다.
do $guard$
begin
  if to_regclass('public.entry_votes') is null
     or to_regclass('public.benefit_applications_pii') is null then
    raise exception
      '중단: 여기는 테스트 프로젝트가 아닙니다. 이 SQL 은 dadamom-test 에서만 실행하세요.'
      using errcode = '42501';
  end if;
end $guard$;

create extension if not exists pgcrypto;

create or replace function pg_temp.mk_user(uid uuid, mail text)
returns void language plpgsql as $fn$
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    -- 아래 토큰 컬럼을 NULL 로 두면 Supabase 인증 서버가 읽다가 실패해 로그인이 안 된다.
    -- 반드시 빈 문자열로 채운다. (CLAUDE.md 지뢰 목록 1번)
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, email_change, phone_change,
    phone_change_token, reauthentication_token
  ) values (
    uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', mail,
    crypt('dadamom-test-1234', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(),
    '', '', '', '', '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, 'email',
          json_build_object('sub', uid::text, 'email', mail)::jsonb, now(), now())
  on conflict do nothing;
end $fn$;

select pg_temp.mk_user('11111111-1111-1111-1111-111111111111', 'admin@dadamom.test');
select pg_temp.mk_user('22222222-2222-2222-2222-222222222222', 'momA@dadamom.test');
select pg_temp.mk_user('33333333-3333-3333-3333-333333333333', 'momB@dadamom.test');
select pg_temp.mk_user('44444444-4444-4444-4444-444444444444', 'dadC@dadamom.test');

-- 운영자 지정
insert into public.admin_emails (email) values ('admin@dadamom.test') on conflict do nothing;

-- 프로필 (있으면 원래 값으로 맞춰 놓는다)
insert into public.profiles (id, nickname, kid_type, parent_role, birth_month, due_date, region, interests, onboarded) values
  ('22222222-2222-2222-2222-222222222222', '하람이', 'parenting', 'mom', '2025-06', null,         '인천', '["이유식","수면교육"]'::jsonb, true),
  ('33333333-3333-3333-3333-333333333333', '콩이',   'pregnant',  'mom', null,      '2026-12-10', '서울', '["출산준비"]'::jsonb,          true),
  ('44444444-4444-4444-4444-444444444444', '도윤이', 'parenting', 'dad', '2026-02', null,         '경기', '["놀이","외출"]'::jsonb,       true)
on conflict (id) do update set
  nickname = excluded.nickname, kid_type = excluded.kid_type, parent_role = excluded.parent_role,
  birth_month = excluded.birth_month, due_date = excluded.due_date, region = excluded.region,
  interests = excluded.interests, onboarded = true;

commit;

-- ───────────────────────────── 확인 ─────────────────────────────
-- 4줄이 나오고 '로그인가능' 이 전부 예 여야 합니다.
select u.email                                               as 계정,
       coalesce(p.nickname, '(프로필 없음)')                  as 아이,
       case when u.email_confirmed_at is not null
             and u.confirmation_token = ''
             and u.recovery_token = ''
            then '예' else '아니오 ← 문제' end                as 로그인가능
  from auth.users u
  left join public.profiles p on p.id = u.id
 where u.email like '%@dadamom.test'
 order by u.email;
