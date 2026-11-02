-- 0059 채팅 하루 삭제 검사 (테스트 DB 전용, 끝에 일부러 오류를 내서 전부 되돌린다)
do $$
declare a uuid := '22222222-2222-2222-2222-222222222222'; b uuid := '33333333-3333-3333-3333-333333333333'; id1 uuid := gen_random_uuid(); out text := ''; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'email', 'momA@dadamom.test')::text, true);
  insert into chat_messages (id, body) values (id1, '어제 글 시험');
  perform set_config('request.jwt.claims', '{}', true);
  update chat_messages set created_at = public._chat_today_start() - interval '1 hour' where id = id1;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'email', 'momB@dadamom.test')::text, true);
  set local role authenticated;
  select count(*) into n from chat_messages where id = id1;
  out := out || (case when n = 0 then 'PASS' else 'FAIL' end) || ' 어제(자정 전) 글은 회원에게 안 보임 / ';
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  perform public._purge_old_chat();
  select count(*) into n from chat_messages where id = id1;
  out := out || (case when n = 0 then 'PASS' else 'FAIL' end) || ' 매일 지우기 함수가 어제 글을 지움 / ';
  select count(*) into n from cron.job where jobname = 'chat-purge-daily' and schedule = '5 15 * * *';
  out := out || (case when n = 1 then 'PASS' else 'FAIL' end) || ' 매일 00:05(한국) 예약';
  raise exception 'RESULT %', out;
end $$;
