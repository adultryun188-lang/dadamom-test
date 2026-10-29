// 실제 0044 SQL을 로컬 PostgreSQL에서 실행한다. 원격 DB 미접속.
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();let passed=0;
const check=(n,v)=>{assert(v,n);passed++;console.log('PASS '+n);};
const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002';
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create table community_posts(id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id),created_at timestamptz default now());
 create table post_comments(id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id));
 insert into auth.users values('${A}'),('${B}');`);
 const sql=await fs.readFile(new URL('../supabase/migrations/0044_pilot_activity_days.sql',import.meta.url),'utf8');await db.exec(sql);
 await db.query('insert into community_posts(owner_id) values($1)',[A]);
 const rows=async()=> (await db.query('select * from pilot_activity_days')).rows;
 check('등록하지 않은 이용자 수집 안 함',(await rows()).length===0);
 await db.query("insert into pilot_activity_cohort(user_id,joined_at) values($1,now()-interval '1 day')",[A]);
 await db.query("insert into community_posts(owner_id,created_at) values($1,'2020-01-01'),($1,now())",[A]);
 check('하루 같은 종류 중복 없음',(await rows()).length===1);
 check('행위 시각은 조작된 글 날짜가 아닌 서버 시각',Date.parse((await rows())[0].first_at)>Date.parse('2026-01-01'));
 await db.query('insert into post_comments(owner_id) values($1)',[A]);
 check('글과 댓글 종류 분리',(await rows()).length===2);
 await db.exec('begin');await db.query('insert into post_comments(owner_id) values($1)',[A]);await db.exec('rollback');
 check('실패·롤백된 작성은 활동 추가 안 함',(await rows()).length===2);
 await db.exec('delete from community_posts;delete from post_comments;');
 check('원본 삭제해도 최소 활동 날짜 유지',(await rows()).length===2);
 for(const role of ['anon','authenticated']){
   await db.exec(`begin;set local role ${role};`);
   await assert.rejects(db.query('select * from public.pilot_activity_days'),/permission denied/);await db.exec('rollback');
   check(role+' 활동 조회 차단',true);
   await db.exec(`begin;set local role ${role};`);
   await assert.rejects(db.query("insert into public.pilot_activity_cohort(user_id,joined_at) values($1,now())",[B]),/permission denied/);await db.exec('rollback');
   check(role+' 자기·타인 코호트 임의 등록 차단',true);
 }
 await db.query("update pilot_activity_cohort set expires_at=now()-interval '1 second',enrolled_at=now()-interval '2 days' where user_id=$1",[A]);
 await db.exec('delete from pilot_activity_days');await db.query('insert into post_comments(owner_id) values($1)',[A]);
 check('수집 기간 만료 뒤 새 수집 없음',(await rows()).length===0);
 await db.query("update pilot_activity_cohort set expires_at=now()+interval '1 day' where user_id=$1",[A]);
 await db.query('insert into post_comments(owner_id) values($1)',[A]);
 await db.query('delete from post_comments where owner_id=$1',[A]);await db.query('delete from auth.users where id=$1',[A]);
 check('탈퇴 시 코호트·활동 cascade 삭제',(await rows()).length===0&&(await db.query('select * from pilot_activity_cohort')).rows.length===0);
 await db.exec(sql);check('마이그레이션 재실행 가능',true);
 await db.query("insert into pilot_activity_cohort(user_id,joined_at,enrolled_at,expires_at) values($1,now()-interval '100 days',now()-interval '100 days',now()-interval '70 days')",[B]);
 await db.exec("delete from pilot_activity_cohort where enrolled_at < now()-interval '90 days'");
 check('90일 보유 정리 SQL 동작',(await db.query('select * from pilot_activity_cohort')).rows.length===0);
}finally{await db.close();}
console.log(`파일럿 활동 DB ${passed}개 통과 (로컬 전용)`);
