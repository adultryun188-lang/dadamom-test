-- 0058 닉네임 한 달에 한 번 검사 (테스트 DB 전용, 끝에 일부러 오류를 내서 전부 되돌린다)
do $$
declare
  u uuid := '33333333-3333-3333-3333-333333333333';   -- momB
  out text := ''; got text; v timestamptz;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  update public.profiles set nickname = '처음이름', nickname_changed_at = null where id = u;   -- 준비 (관리 권한 쪽에서 한 것처럼)
  -- 위 update 는 role authenticated 로 돌았으므로 changed_at 을 서버가 다시 정함 → 시작 상태를 강제로 맞춘다
  perform set_config('request.jwt.claims', '{}', true);
  update public.profiles set nickname_changed_at = null where id = u;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  begin update public.profiles set nickname = '새이름' where id = u; got := 'ok'; exception when others then got := sqlerrm; end;
  select nickname_changed_at into v from public.profiles where id = u;
  out := out || (case when got = 'ok' and v is not null then 'PASS' else 'FAIL' end) || ' 첫 변경은 됨(' || got || ') / ';

  begin update public.profiles set nickname = '또바꿈' where id = u; got := 'ok'; exception when others then got := sqlerrm; end;
  out := out || (case when got = 'NICKNAME_COOLDOWN' then 'PASS' else 'FAIL' end) || ' 한 달 안 재변경 막힘(' || got || ') / ';

  begin update public.profiles set nickname_changed_at = now() - interval '60 days' where id = u; got := 'ok'; exception when others then got := sqlerrm; end;
  select nickname_changed_at into v from public.profiles where id = u;
  out := out || (case when v > now() - interval '1 minute' then 'PASS' else 'FAIL' end) || ' 변경일을 직접 못 고침 / ';

  begin update public.profiles set region = '인천', nickname = '새이름' where id = u; got := 'ok'; exception when others then got := sqlerrm; end;
  out := out || (case when got = 'ok' then 'PASS' else 'FAIL' end) || ' 이름 그대로 두고 다른 칸 수정은 됨(' || got || ') / ';

  perform set_config('request.jwt.claims', '{}', true);
  update public.profiles set nickname_changed_at = now() - interval '31 days' where id = u;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  begin update public.profiles set nickname = '한달뒤이름' where id = u; got := 'ok'; exception when others then got := sqlerrm; end;
  out := out || (case when got = 'ok' then 'PASS' else 'FAIL' end) || ' 30일 지나면 다시 바꿀 수 있음(' || got || ') / ';

  perform set_config('request.jwt.claims', '{}', true);
  update public.profiles set nickname = '', nickname_changed_at = null where id = u;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  begin update public.profiles set nickname = '빈칸에서처음' where id = u; got := 'ok'; exception when others then got := sqlerrm; end;
  select nickname_changed_at into v from public.profiles where id = u;
  out := out || (case when got = 'ok' and v is null then 'PASS' else 'FAIL' end) || ' 비어 있다 처음 정할 때는 기다리지 않음';

  raise exception 'RESULT %', out;
end $$;
