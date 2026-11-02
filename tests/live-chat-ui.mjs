// 실시간 채팅 화면 시험 (지시서 7번 2·3·4). 테스트 DB만.
//   node tests/live-chat-ui.mjs [BASE]   (기본: 배포된 테스트 사이트)
// 2) momA·momB 두 창: A 가 보내면 B 화면에 1초 안에 뜨는지, 지금 있는 사람 수
// 3) 일반 브라우저는 입구 대신 안내, window.Capacitor 를 앱처럼 흉내 내면 입구
// 4) 보내기 실패 이유가 화면에 보이는지, 신고·차단을 실제로 눌러 화면과 DB 를 같이 확인. 만든 것은 지운다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const BASE = process.argv[2] || 'https://adultryun188-lang.github.io/dadamom-test/';
assert(BASE.includes('/dadamom-test/') || BASE.includes('localhost'), 'STOP: 테스트 사이트만');
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
const ref = new URL(U).hostname.split('.')[0];
let failed = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x });
const J = { 'Content-Type': 'application/json' };
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, J), body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
const A = await login('momA@dadamom.test'), B = await login('momB@dadamom.test'), M = await login('admin@dadamom.test');
const tag = Date.now().toString(36);
const b = await chromium.launch();
const page = async (sess, app) => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([s, r, app]) => {
    localStorage.setItem('sb-' + r + '-auth-token', JSON.stringify(s));
    if (app) { window.Capacitor = { isNativePlatform: () => true, Plugins: {} }; localStorage.setItem('dadamom.chatRules.v1.' + s.user.id, 'test'); }
  }, [sess, ref, app]);
  p.errs = errs; return p;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  // 3) 웹
  const w = await page(A, false);
  await w.goto(BASE + 'index.html?nc=' + Date.now() + '#community'); await w.waitForTimeout(5000);
  ok('웹: 입구 대신 "앱에서 채팅하기" 안내', await w.locator('#chat-entry:has-text("앱에서 채팅하기")').count() === 1 && await w.locator('[data-chat-open]').count() === 0);
  await w.goto(BASE + 'index.html?nc=' + Date.now() + '#chat'); await w.waitForTimeout(3000);
  ok('웹: #chat 으로 와도 커뮤니티로 돌려보냄', (await w.evaluate(() => location.hash)) === '#community');
  // 3) 앱 흉내
  const pa = await page(A, true), pb = await page(B, true);
  await pa.goto(BASE + 'index.html?nc=' + Date.now() + '#community'); await pa.waitForTimeout(5000);
  ok('앱(흉내): 커뮤니티 위쪽에 채팅 입구', await pa.locator('[data-chat-open]:visible').count() === 1);
  await pa.locator('[data-chat-open]').click(); await pa.waitForTimeout(2500);
  ok('앱: 입구를 누르면 채팅 화면', (await pa.evaluate(() => location.hash)) === '#chat' && await pa.locator('#screen-chat:visible').count() === 1);
  await pb.goto(BASE + 'index.html?nc=' + Date.now() + '#community'); await pb.waitForTimeout(5000);
  await pb.locator('[data-chat-open]').click(); await pb.waitForTimeout(4000);   // 새 기기는 아이 정보를 받기 전 #chat 바로가기를 홈으로 돌린다 → 실제 순서대로 들어간다
  const online = await pa.locator('#chat-online').innerText();
  ok('지금 들어와 있는 사람 수 (두 창이면 2)', online === '2', online);

  // 2) 실시간 1초
  const msg = '실시간 시험 ' + tag;
  await pa.fill('#chat-input', msg);
  const t0 = Date.now();
  await pa.click('#chat-send');
  let seen = 0;
  while (Date.now() - t0 < 5000) { if (await pb.locator('#chat-list .chat-bubble', { hasText: msg }).count()) { seen = Date.now() - t0; break; } await sleep(50); }
  ok('A 가 보내면 B 화면에 1초 안에 뜸', seen > 0 && seen <= 1000, seen ? seen + 'ms' : '안 뜸');
  ok('내 글은 오른쪽(내 글 모양)', await pa.locator('#chat-list .chat-msg.mine', { hasText: msg }).count() === 1);

  // 4) 실패 이유가 화면에
  await sleep(3200); await pa.fill('#chat-input', '먼저 ' + tag); await pa.click('#chat-send'); await pa.waitForFunction(() => document.getElementById('chat-input').value === '', null, { timeout: 2500 });
  await pa.fill('#chat-input', '바로 또 ' + tag); await pa.click('#chat-send'); await pa.waitForTimeout(1500);
  const e1 = await pa.locator('#chat-err').innerText();
  ok('3초 안 연속 → 이유가 화면에 보임', /천천히/.test(e1), e1);
  await sleep(3200);
  await pa.fill('#chat-input', '오픈채팅 주소 드려요'); await pa.click('#chat-send'); await pa.waitForTimeout(1500);
  const e2 = await pa.locator('#chat-err').innerText();
  ok('금지어 → 이유가 화면에 보임', /보낼 수 없어요/.test(e2), e2);

  // 4) 신고 (B 가 A 글을 눌러 신고) → DB
  const bubble = pb.locator('#chat-list button.chat-bubble', { hasText: msg }).first();
  await bubble.click(); await pb.waitForTimeout(800);
  await pb.locator('[data-report-reason="광고·스팸"]').click();
  await pb.locator('#report-submit').click(); await pb.waitForTimeout(2000);
  const msgRow = (await (await fetch(U + '/rest/v1/chat_messages?select=id&body=eq.' + encodeURIComponent(msg), { headers: h(M.access_token) })).json())[0];
  const rep = await (await fetch(U + '/rest/v1/reports?select=id,target_type&target_id=eq.' + (msgRow && msgRow.id) + '&reporter_id=eq.' + B.user.id, { headers: h(M.access_token) })).json();
  ok('신고 누름 → DB 에 채팅 신고가 들어감', rep.length === 1 && rep[0].target_type === 'chat', JSON.stringify(rep));
  // 4) 차단 → 화면에서 사라지고 DB 에 기록
  await bubble.click(); await pb.waitForTimeout(800);
  await pb.locator('#report-block').click(); await pb.waitForTimeout(2500);
  const stillB = await pb.locator('#chat-list .chat-bubble', { hasText: msg }).count();
  const blk = await (await fetch(U + '/rest/v1/blocks?select=blocked_id&blocked_id=eq.' + A.user.id, { headers: h(B.access_token) })).json();
  ok('차단 누름 → 화면에서 사라짐 + DB 에 차단 기록', stillB === 0 && blk.length === 1, 'screen ' + stillB + ' / db ' + blk.length);

  // 나가면 연결 끊김
  await pb.locator('[data-chat-back]').click(); await pb.waitForTimeout(2500);
  const online2 = await pa.locator('#chat-online').innerText();
  ok('B 가 나가면 사람 수가 줄어듦 (연결 끊김)', online2 === '1', online2);
  ok('화면 오류 없음', !w.errs.length && !pa.errs.length && !pb.errs.length, [...w.errs, ...pa.errs, ...pb.errs].join(' / '));

  // 정리
  await fetch(U + '/rest/v1/blocks?blocked_id=eq.' + A.user.id, { method: 'DELETE', headers: h(B.access_token) });
  for (const r of rep) await fetch(U + '/rest/v1/reports?id=eq.' + r.id, { method: 'PATCH', headers: h(M.access_token, J), body: JSON.stringify({ status: 'dismissed' }) });
  await fetch(U + '/rest/v1/chat_messages?body=like.*' + tag + '*', { method: 'DELETE', headers: h(M.access_token) });
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
await b.close();
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
