// 실제 0044 SQL을 로컬 PostgreSQL에서 실행한다. 원격 DB 미접속.
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const db=new PGlite();let passed=0;
const check=(name,value)=>{assert(value,name);passed++;console.log('PASS '+name);};
const uid=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
const [A,B,ROLLBACK,FAIL_OPEN,FUTURE,EXPIRED,CASCADE,OLD,BOUNDARY,RECENT]=Array.from({length:10},(_,i)=>uid(i+1));
const rows=async user=>(await db.query('select * from public.pilot_activity_days where user_id=$1 order by kind',[user])).rows;
const count=async(table,user)=>Number((await db.query('select count(*) as n from public.'+table+' where '+(table==='pilot_activity_cohort'?'user_id':'owner_id')+'=$1',[user])).rows[0].n);
const enroll=async user=>db.query("insert into public.pilot_activity_cohort(user_id,joined_at) values($1,now()-interval '1 day')",[user]);
async function denied(label,role,subject,query,params=[]){
  await db.exec('begin;set local role '+role);
  try{
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:subject})]);
    await assert.rejects(db.query(query,params),error=>error.code==='42501',label);
  }finally{await db.exec('rollback');}
  check(label,true);
}
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
  create table public.community_posts(id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id),created_at timestamptz default now());
  create table public.post_comments(id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id));
  insert into auth.users select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,10) n;`);
  const sql=await fs.readFile(new URL('../supabase/migrations/0044_pilot_activity_days.sql',import.meta.url),'utf8');
  await db.exec(sql);

  await db.query('insert into public.community_posts(owner_id) values($1)',[A]);
  await db.query('insert into public.post_comments(owner_id) values($1)',[B]);
  check('등록하지 않은 이용자의 글·댓글 수집 안 함',(await rows(A)).length===0&&(await rows(B)).length===0);
  await enroll(A);
  const defaults=(await db.query("select expires_at-enrolled_at=interval '30 days' as thirty from public.pilot_activity_cohort where user_id=$1",[A])).rows[0];
  check('기본 수집 기간은 등록 후 30일',defaults.thirty);
  await assert.rejects(db.query("insert into public.pilot_activity_cohort(user_id,joined_at,enrolled_at,expires_at) values($1,now(),now(),now()+interval '31 days')",[B]),error=>error.code==='23514');
  check('30일을 넘는 수집 기간 등록 차단',true);
  await assert.rejects(db.query("insert into public.pilot_activity_cohort(user_id,joined_at,enrolled_at,expires_at) values($1,now()+interval '1 day',now(),now()+interval '30 days')",[B]),error=>error.code==='23514');
  check('가입 기준 시각이 참여 시작보다 늦은 등록 차단',true);

  const before=Date.now();
  await db.query("insert into public.community_posts(owner_id,created_at) values($1,'2020-01-01'),($1,now())",[A]);
  const first=(await rows(A))[0];
  check('하루 같은 종류 중복 없음',(await rows(A)).length===1);
  check('행위 시각은 조작된 글 날짜가 아닌 현재 서버 시각',Math.abs(Date.parse(first.first_at)-before)<5000);
  check('활동 날짜는 최초 서버 시각의 한국 날짜',new Date(first.activity_day).toISOString().slice(0,10)===new Date(Date.parse(first.first_at)+9*3600000).toISOString().slice(0,10));
  await db.query('insert into public.community_posts(owner_id) values($1)',[A]);
  check('중복 작성은 최초 시각을 덮어쓰지 않음',Date.parse((await rows(A))[0].first_at)===Date.parse(first.first_at));
  await db.query('insert into public.post_comments(owner_id) values($1)',[A]);
  check('글과 댓글 종류 분리',(await rows(A)).length===2);
  await db.query('delete from public.community_posts where owner_id=$1',[A]);
  await db.query('delete from public.post_comments where owner_id=$1',[A]);
  check('원본 삭제해도 최소 활동 날짜 유지',(await rows(A)).length===2);

  await enroll(ROLLBACK);
  await db.exec('begin');
  await db.query('insert into public.post_comments(owner_id) values($1)',[ROLLBACK]);
  check('rollback 전 전용 fixture의 원본·측정 행이 실제 생성됨',await count('post_comments',ROLLBACK)===1&&(await rows(ROLLBACK)).length===1);
  await db.exec('rollback');
  check('rollback 후 전용 fixture의 원본·측정 행 모두 없음',await count('post_comments',ROLLBACK)===0&&(await rows(ROLLBACK)).length===0);
  await assert.rejects(db.query('insert into public.community_posts(owner_id) values($1)',[uid(99)]),error=>error.code==='23503');
  check('원본 작성 제약 실패는 측정 행을 남기지 않음',(await rows(uid(99))).length===0);
  await db.exec('begin');
  await db.query('insert into public.community_posts(owner_id) values($1)',[ROLLBACK]);
  await assert.rejects(db.query('select 1/0'),error=>error.code==='22012');
  await db.exec('rollback');
  check('측정 뒤 같은 트랜잭션의 실패도 원본·측정 함께 취소',await count('community_posts',ROLLBACK)===0&&(await rows(ROLLBACK)).length===0);

  await enroll(FAIL_OPEN);
  await db.exec(`create function public.reject_pilot_fixture() returns trigger language plpgsql as $fn$
    begin raise exception using errcode='23514',message='fixture-private-detail';end $fn$;
    create trigger reject_pilot_fixture before insert on public.pilot_activity_days for each row execute function public.reject_pilot_fixture();`);
  const notices=[];
  await db.query('insert into public.community_posts(owner_id) values($1)',[FAIL_OPEN],{onNotice:notice=>notices.push(notice)});
  check('측정 INSERT 실패가 원본 작성을 막지 않음',await count('community_posts',FAIL_OPEN)===1&&(await rows(FAIL_OPEN)).length===0);
  check('측정 실패 경고는 상세 내용 없이 SQLSTATE만 기록',notices.some(n=>n.message==='pilot activity capture failed: 23514')&&notices.every(n=>!n.message.includes('fixture-private-detail')));
  await db.exec('drop trigger reject_pilot_fixture on public.pilot_activity_days;drop function public.reject_pilot_fixture()');

  for(const [label,role,subject] of [['anon','anon',B],['authenticated 본인','authenticated',A],['authenticated 타인','authenticated',B]]){
    for(const [table,insert] of [
      ['pilot_activity_cohort',"insert into public.pilot_activity_cohort(user_id,joined_at) values($1,now())"],
      ['pilot_activity_days',"insert into public.pilot_activity_days(user_id,activity_day,kind) values($1,current_date,'post')"]
    ]){
      await denied(label+' '+table+' 조회 차단',role,subject,'select * from public.'+table+' where user_id=$1',[A]);
      await denied(label+' '+table+' 임의 추가 차단',role,subject,insert,[A]);
      const update=table==='pilot_activity_cohort'?'expires_at=expires_at':"kind='comment'";
      await denied(label+' '+table+' 수정 차단',role,subject,'update public.'+table+' set '+update+' where user_id=$1',[A]);
      await denied(label+' '+table+' 삭제 차단',role,subject,'delete from public.'+table+' where user_id=$1',[A]);
    }
    await denied(label+' 측정 트리거 함수 직접 호출 차단',role,subject,'select public.capture_pilot_activity_day()');
    await denied(label+' 보유기간 정리 함수 직접 호출 차단',role,subject,'select public.purge_pilot_activity()');
  }
  check('차단 시도 후 기존 코호트·활동 보존',await count('pilot_activity_cohort',A)===1&&(await rows(A)).length===2);

  await db.query("insert into public.pilot_activity_cohort(user_id,joined_at,enrolled_at,expires_at) values($1,now()-interval '10 days',now()+interval '1 day',now()+interval '31 days')",[FUTURE]);
  await db.query('insert into public.community_posts(owner_id) values($1)',[FUTURE]);
  check('미래 참여 시작 시각 전에는 수집하지 않음',(await rows(FUTURE)).length===0);
  await db.query("insert into public.pilot_activity_cohort(user_id,joined_at,enrolled_at,expires_at) values($1,now()-interval '40 days',now()-interval '31 days',now()-interval '1 day')",[EXPIRED]);
  await db.query('insert into public.post_comments(owner_id) values($1)',[EXPIRED]);
  check('수집 기간 만료 뒤 새 수집 없음',(await rows(EXPIRED)).length===0);
  await db.exec('begin');
  await db.query("delete from public.pilot_activity_days where user_id=$1 and kind='post'",[A]);
  await db.query("update public.pilot_activity_cohort set expires_at=now() where user_id=$1",[A]);
  await db.query("insert into public.community_posts(owner_id) values($1)",[A]);
  check('수집 종료 시각과 같은 시각의 작성은 새 활동 없음',(await rows(A)).length===1);
  await db.exec('rollback');

  await enroll(CASCADE);
  await db.query('insert into public.post_comments(owner_id) values($1)',[CASCADE]);
  await db.query('delete from public.post_comments where owner_id=$1',[CASCADE]);
  await db.query('delete from auth.users where id=$1',[CASCADE]);
  check('전용 가상 계정 탈퇴 시 코호트·활동 cascade 삭제',await count('pilot_activity_cohort',CASCADE)===0&&(await rows(CASCADE)).length===0);
  check('탈퇴 fixture 외 기존 계정·측정 자료 보존',await count('pilot_activity_cohort',A)===1&&(await rows(A)).length===2);

  // 일일 간격을 포함해 90일 상한을 지키기 위해 89일부터 정리한다.
  await db.exec('begin');
  for(const [user,age] of [[OLD,"interval '90 days'"],[RECENT,"interval '88 days 23 hours 59 minutes'"]]){
    await db.query("insert into public.pilot_activity_cohort(user_id,joined_at,enrolled_at,expires_at) values($1,now()-interval '100 days',now()-"+age+",now()-"+age+"+interval '30 days')",[user]);
    await db.query("insert into public.pilot_activity_days(user_id,activity_day,kind,first_at) values($1,(now()-interval '80 days')::date,'post',now()-interval '80 days')",[user]);
  }
  // DO 한 문장 안에서 경계 등록·활동 추가·정리를 실행해 서버 기준 시각을 고정한다.
  await db.exec(`do $boundary$ declare removed integer;
  begin
    insert into public.pilot_activity_cohort(user_id,joined_at,enrolled_at,expires_at)
    values('${BOUNDARY}',statement_timestamp()-interval '100 days',statement_timestamp()-interval '89 days',statement_timestamp()-interval '59 days');
    insert into public.pilot_activity_days(user_id,activity_day,kind,first_at)
    values('${BOUNDARY}',(statement_timestamp()-interval '80 days')::date,'post',statement_timestamp()-interval '80 days');
    removed:=public.purge_pilot_activity();
    perform set_config('pilot.fixture_purged',removed::text,true);
  end $boundary$;`);
  const result=Number((await db.query("select current_setting('pilot.fixture_purged') as purged")).rows[0].purged);
  check('정리 함수는 삭제한 코호트 수를 반환',result===2);
  check('90일 도달·89일 경계 코호트와 활동 정리 cascade',await count('pilot_activity_cohort',OLD)===0&&await count('pilot_activity_cohort',BOUNDARY)===0&&(await rows(OLD)).length===0&&(await rows(BOUNDARY)).length===0);
  check('89일 직전 보유 fixture의 코호트·활동 보존',await count('pilot_activity_cohort',RECENT)===1&&(await rows(RECENT)).length===1);
  check('정리 함수는 다른 코호트·원본 글을 보존',await count('pilot_activity_cohort',A)===1&&await count('community_posts',FAIL_OPEN)===1);
  check('반복 정리는 남은 대상이 없으면 0 반환',(await db.query('select public.purge_pilot_activity() as purged')).rows[0].purged===0);
  await db.exec('rollback');

  await db.exec(sql);
  check('마이그레이션 재실행 후 기존 측정 자료 보존',(await rows(A)).length===2);
}finally{await db.close();}
console.log(`파일럿 활동 DB ${passed}개 통과 (로컬 전용)`);
