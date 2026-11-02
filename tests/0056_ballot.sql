-- 0056 투표 규칙 검사 (테스트 DB 전용, 끝에 일부러 오류를 내서 전부 되돌린다)
--   결과는 오류 메시지 'RESULT ...' 에 PASS/FAIL 로 나온다.
do $$
declare
  ent uuid; ck text; m text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v1 uuid := '11111111-1111-1111-1111-111111111111';  -- admin: 메일함 주인 역할
  v2 uuid := '44444444-4444-4444-4444-444444444444';  -- dadC: 검사 대상
  owner uuid := '33333333-3333-3333-3333-333333333333'; -- momB 참가작
  out text := ''; got text;
begin
  select id, challenge_key into ent, ck from challenge_entries where owner_id = owner and status = 'approved' limit 1;
  if public._same_family(v1, owner) or public._same_family(v2, owner) then raise exception 'SETUP: 같은 가족이라 검사 불가'; end if;
  delete from entry_ballots where voter_id in (v1, v2) and challenge_key = ck and month = m;

  -- 1) 오늘 이메일 가입 → 막힘
  update auth.users set created_at = now(), raw_app_meta_data = '{"provider":"email","providers":["email"]}' , email = 'dadc.test@gmail.com' where id = v2;
  perform set_config('request.jwt.claims', json_build_object('sub', v2)::text, true);
  begin got := public.cast_ballot(ent); exception when others then got := sqlerrm; end;
  out := out || (case when got = 'NEW_ACCOUNT' then 'PASS' else 'FAIL' end) || ' 오늘 이메일 가입 막힘(' || got || ') / ';

  -- 2) 오늘 가입이라도 카카오 연결 → 바로 투표
  update auth.users set raw_app_meta_data = '{"provider":"kakao","providers":["kakao"]}' where id = v2;
  begin got := public.cast_ballot(ent); exception when others then got := sqlerrm; end;
  out := out || (case when got = 'voted' then 'PASS' else 'FAIL' end) || ' 카카오 바로(' || got || ') / ';
  got := public.cast_ballot(ent);  -- 취소
  out := out || (case when got = 'removed' then 'PASS' else 'FAIL' end) || ' 다시 누르면 취소 / ';

  -- 3) 네이버 연결(이메일+네이버) → 바로
  update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email","custom:naver"]}' where id = v2;
  begin got := public.cast_ballot(ent); exception when others then got := sqlerrm; end;
  out := out || (case when got = 'voted' then 'PASS' else 'FAIL' end) || ' 네이버 바로(' || got || ') / ';
  perform public.cast_ballot(ent);

  -- 4) 구글은 이메일과 같게: 오늘 가입이면 막힘
  update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email","google"]}' where id = v2;
  begin got := public.cast_ballot(ent); exception when others then got := sqlerrm; end;
  out := out || (case when got = 'NEW_ACCOUNT' then 'PASS' else 'FAIL' end) || ' 구글 오늘 가입 막힘(' || got || ') / ';

  -- 5) 이틀 전 이메일 가입 → 투표됨
  update auth.users set created_at = now() - interval '2 days', raw_app_meta_data = '{"provider":"email","providers":["email"]}' where id = v2;
  begin got := public.cast_ballot(ent); exception when others then got := sqlerrm; end;
  out := out || (case when got = 'voted' then 'PASS' else 'FAIL' end) || ' 하루 지난 이메일 가입(' || got || ') / ';
  perform public.cast_ballot(ent);

  -- 6) 같은 메일함(d.a.d.c.test+2 = dadctest) 의 다른 계정이 먼저 투표 → 막힘
  update auth.users set created_at = now() - interval '30 days', email = 'd.a.d.c.test+2@gmail.com', raw_app_meta_data = '{"provider":"email","providers":["email"]}' where id = v1;
  perform set_config('request.jwt.claims', json_build_object('sub', v1)::text, true);
  got := public.cast_ballot(ent);
  perform set_config('request.jwt.claims', json_build_object('sub', v2)::text, true);
  begin got := public.cast_ballot(ent); exception when others then got := sqlerrm; end;
  out := out || (case when got = 'SAME_MAILBOX' then 'PASS' else 'FAIL' end) || ' 같은 메일함 두 번째 계정 막힘(' || got || ') / ';

  -- 7) 일회용 메일 → 막힘
  delete from entry_ballots where voter_id in (v1, v2) and challenge_key = ck and month = m;
  update auth.users set email = 'someone@yopmail.com' where id = v2;
  begin got := public.cast_ballot(ent); exception when others then got := sqlerrm; end;
  out := out || (case when got = 'THROWAWAY_MAIL' then 'PASS' else 'FAIL' end) || ' 일회용 메일 막힘(' || got || ')';

  raise exception 'RESULT %', out;
end $$;
