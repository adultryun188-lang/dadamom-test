// 실제 앱 UI + 로컬 PostgreSQL RPC 통합 검증. 원격 DB에 접속하지 않는다.
// 로컬 서버를 먼저 실행하고 node tests/family_privacy_ui.mjs [http://localhost:8000]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { fixture, A, B } from './family_privacy_fixture.mjs';
const BASE = process.argv[2] || 'http://localhost:8000';
assert(['localhost','127.0.0.1'].includes(new URL(BASE).hostname), '로컬 테스트 서버만 허용');
const f = await fixture();
const family = await f.create();
await f.join(B, family.invite_code);
await f.write(A, family.family_id, 'author-A'); await f.write(B, family.family_id, 'author-B');
let browser, checks = 0, versionReady = false, responseLost = false, releaseVersion = null, leaveCalls = 0;
const errors = [], forbidden = [];
const check = (name, value) => { assert(value, name); console.log('PASS ' + name); checks++; };
const latestFalseCount = async () => Number((await f.db.query("select count(*) as n from public.consent_records where owner_id=$1 and not granted", [A])).rows[0].n);
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{ width:390,height:844 }, serviceWorkers:'block' });
  const stub = await fs.readFile(new URL('./supabase-stub.js', import.meta.url), 'utf8');
  await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    if(u.href.includes('/supabase-js@2')) return route.fulfill({ contentType:'application/javascript', body:stub });
    if(u.hostname.endsWith('.supabase.co')) { forbidden.push(u.hostname); return route.abort(); }
    if(u.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType:'text/css', body:'' });
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept()); page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__familyRpc', async name => {
    if(name === 'family_privacy_version') {
      if(releaseVersion) await releaseVersion.promise;
      return { data:versionReady ? 17 : 0, error:null };
    }
    try {
      if(name === 'leave_family') leaveCalls++;
      const result = await f.user(A, 'select public.' + name + '() as value');
      if(name === 'leave_family' && responseLost) { responseLost=false; return { data:null,error:{message:'test_response_lost'} }; }
      return { data:result[0].value,error:null };
    } catch(e) { return { data:null,error:{message:e.message} }; }
  });
  await page.goto(BASE + '/index.html#onboarding');
  await page.evaluate(({uid,fid}) => {
    localStorage.setItem('dadamom_v2::' + uid, JSON.stringify({ onboarded:true,nickname:'가족A',kidType:'parenting',region:'서울',family:{id:fid,cursor:null},careLog:[{id:'local-record',type:'feed',ts:Date.now()}] }));
    window.__SBSTUB.store.profiles.push({id:uid,onboarded:true,nickname:'가족A',kid_type:'parenting',region:'서울'});
    window.__SBSTUB.rpcHandler = name => ['my_family','family_privacy_version','leave_family'].includes(name) ? window.__familyRpc(name) : undefined;
    window.__SBSTUB.signIn(uid,'local@dadamom.test'); location.hash='#my';
  }, {uid:A,fid:family.family_id});
  const leave = page.locator('[data-family-leave]');
  await leave.waitFor({ state:'visible' });
  const state = () => page.evaluate(uid => JSON.parse(localStorage.getItem('dadamom_v2::'+uid)), A);
  const failedToast = () => page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('종료를 확인하지 못했어요'));
  await leave.click(); await failedToast();
  check('미적용 DB에서는 종료 RPC를 부르기 전에 차단', leaveCalls === 0 && (await state()).family);
  versionReady = true;
  await f.db.exec(`create function public.test_consent_fail() returns trigger language plpgsql as $$
    begin if not new.granted then raise exception 'test_consent_failure'; end if; return new; end $$;
    create trigger test_consent_fail before insert on public.consent_records for each row execute function public.test_consent_fail();`);
  await leave.click();
  await page.waitForFunction(() => !document.querySelector('[data-family-leave]')?.disabled);
  check('서버 철회 저장 실패 시 앱이 가족 상태를 성공처럼 지우지 않음', !!(await state()).family && leaveCalls === 1);
  check('실패 시 DB 구성원·철회 원장 모두 원상태', (await f.db.query('select 1 from public.family_members where user_id=$1',[A])).rows.length === 1 && await latestFalseCount() === 0);
  await f.db.exec('drop trigger test_consent_fail on public.consent_records; drop function public.test_consent_fail();');
  responseLost = true;
  await leave.click();
  await page.waitForFunction(() => !document.querySelector('[data-family-leave]')?.disabled);
  check('커밋 후 응답 유실은 완료했다고 거짓 표시하지 않음', !!(await state()).family && await latestFalseCount() === 1);
  let release;
  releaseVersion = {promise:new Promise(r => {release=r;})};
  await page.evaluate(() => { const b=document.querySelector('[data-family-leave]'); b.click(); b.click(); });
  await page.waitForFunction(() => document.querySelector('[data-family-leave]')?.disabled);
  check('처리 중 중복 클릭 잠금', leaveCalls === 2);
  release();
  await page.waitForFunction(uid => !JSON.parse(localStorage.getItem('dadamom_v2::'+uid)).family, A);
  check('재시도 성공 시에만 앱 가족 상태 정리', !(await state()).family && leaveCalls === 3);
  check('응답 유실 후 재시도도 철회 이력은 한 건', await latestFalseCount() === 1);
  check('나가도 기기의 기록은 유지', (await state()).careLog.some(r => r.id === 'local-record'));
  const records = (await f.db.query('select rid,updated_by from public.family_records')).rows;
  check('DB에서 내 계정 연결만 해제하고 다른 구성원의 연결은 유지', records.find(r=>r.rid==='author-A').updated_by === null && records.find(r=>r.rid==='author-B').updated_by === B);
  check('브라우저 JS 오류 없음', errors.length === 0);
  check('원격 Supabase 요청 없음', forbidden.length === 0);
  console.log(`${checks}개 검증 통과 (실제 앱 UI + 로컬 PostgreSQL)`);
} finally { if(browser) await browser.close(); await f.db.close(); }
