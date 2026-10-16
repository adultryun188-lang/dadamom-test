// 가족 공유 화면 → 실제 테스트 DB 확인 (지시서 2-6). 브라우저 두 개로 momA·dadC.
//   node tests/family_ui.mjs [BASE_URL]   기본 http://localhost:8000 (env.js 가 테스트 Supabase 를 가리켜야 함)
// 만들기 → 참여 → 한쪽에서 수유·성장·접종 기록 → 다른 쪽 화면과 DB 확인 → 지우기 전파 → 둘 다 나가기.
// 테스트 계정·테스트 DB 전용. 끝나면 두 계정 모두 가족에서 나간다.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8000';
const env = fs.readFileSync(new URL('../env.js', import.meta.url), 'utf8');
const URL_ = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const KEY = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
if (!/srxdtddrtnhtlbbviyvs/.test(URL_)) { console.error('STOP: 테스트 DB 가 아님'); process.exit(1); }
const PW = 'dadamom-test-1234';

let fail = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(email) {
  const r = await fetch(URL_ + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
  const j = await r.json();
  const h = { apikey: KEY, Authorization: 'Bearer ' + j.access_token, 'Content-Type': 'application/json' };
  return {
    rpc: (fn, body = {}) => fetch(URL_ + '/rest/v1/rpc/' + fn, { method: 'POST', headers: h, body: JSON.stringify(body) }).then((x) => x.json()),
    rows: (fid) => fetch(URL_ + '/rest/v1/family_records?select=kind,rid,body,deleted&family_id=eq.' + fid, { headers: h }).then((x) => x.json())
  };
}

async function open(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const toasts = [];
  page.on('dialog', (d) => d.accept());
  await page.exposeFunction('__toast', (t) => toasts.push(t));
  await page.addInitScript(() => {
    new MutationObserver(() => { const t = document.getElementById('toast'); if (t && t.classList.contains('show')) window.__toast(t.textContent); })
      .observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.goto(BASE + '/index.html#onboarding', { waitUntil: 'load' });
  await sleep(1500);
  await page.fill('#screen-onboarding input[type=email]', email);
  await page.fill('#screen-onboarding input[type=password]', PW);
  await page.click('#auth-password-submit');
  await page.waitForFunction(() => location.hash === '#home', null, { timeout: 15000 });
  return { ctx, page, toasts };
}
const growth = async (p) => { await p.goto(BASE + '/index.html#growth', { waitUntil: 'load' }); await p.reload({ waitUntil: 'load' }); await sleep(4000); };
const appState = (p) => p.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('auth-token'));
  const uid = JSON.parse(localStorage.getItem(k)).user.id;
  return JSON.parse(localStorage.getItem('dadamom_v2::' + uid) || '{}');
});

const browser = await chromium.launch();
const A0 = await api('momA@dadamom.test'), B0 = await api('dadC@dadamom.test');
await A0.rpc('leave_family'); await B0.rpc('leave_family');   // 이전 실행이 남긴 상태 정리

const A = await open(browser, 'momA@dadamom.test');
const B = await open(browser, 'dadC@dadamom.test');

// 1) A 만들기 (동의 필수)
await growth(A.page);
ok('로그인 시 가족 카드 보임', await A.page.isVisible('#family-card'));
await A.page.click('[data-family-create]');
ok('동의 전 버튼 잠김', await A.page.isDisabled('#family-consent-ok'));
await A.page.check('#family-consent-check');
await A.page.click('#family-consent-ok');
await sleep(5000);
const code = (await A.page.textContent('#family-body')).match(/[0-9A-F]{5}-[0-9A-F]{5}/)?.[0];
ok('A 만들기 → 초대 코드 표시', !!code, code || '');
ok('만들기 안내', A.toasts.some((t) => t.includes('가족 공유를 시작했어요')));

// 2) B 참여
await growth(B.page);
await B.page.fill('#family-join-input', code.toLowerCase());   // 소문자로 넣어도 된다
await B.page.click('[data-family-join]');
await B.page.check('#family-consent-check');
await B.page.click('#family-consent-ok');
await sleep(5000);
ok('B 참여', B.toasts.some((t) => t.includes('가족 기록에 연결됐어요')), B.toasts.join(' / '));
ok('B 화면에 2명', (await B.page.textContent('#family-body')).includes('2명'));

// 3) A 수유 기록 → B
await A.page.click('[data-care-log="feed"]');
await sleep(3000);
const aCare = (await appState(A.page)).careLog.slice(-1)[0];
await growth(B.page);
const bState = await appState(B.page);
ok('A 수유 → B 기기에 들어옴', bState.careLog.some((c) => c.id === aCare.id));
const fid = bState.family.id;
let rows = await A0.rows(fid);
ok('A 수유 → DB 에 있음', rows.some((r) => r.kind === 'care' && r.rid === aCare.id && !r.deleted));

// 4) B 성장 기록·접종 → A
await B.page.click('[data-open-growth-modal]');
await B.page.fill('#growth-height', '74.5');
await B.page.fill('#growth-weight', '9.1');
await B.page.click('#growth-submit');
await sleep(2500);
const vbox = await B.page.$('[data-vax-done]');
const vid = vbox ? await vbox.getAttribute('data-vax-done') : null;
if (vbox) await vbox.click();
await sleep(3000);
await growth(A.page);
const aState = await appState(A.page);
ok('B 성장 기록 → A 기기', aState.growthRecords.some((g) => g.height === 74.5 && g.weight === 9.1));
ok('B 접종 완료 → A 기기', vid ? aState.vaccines[vid] === true : false, vid || '(접종 버튼 없음)');
ok('A 성장 화면에 74.5 표시', (await A.page.textContent('#screen-growth')).includes('74.5') || (await A.page.textContent('#screen-growth')).includes('9.1'));

// 5) A 방금 기록 취소 → B 에서도 사라짐
await A.page.click('[data-care-undo]');
await sleep(3000);
rows = await A0.rows(fid);
ok('취소 → DB deleted 표시', rows.some((r) => r.kind === 'care' && r.rid === aCare.id && r.deleted === true));
await growth(B.page);
ok('취소 → B 기기에서도 사라짐', !(await appState(B.page)).careLog.some((c) => c.id === aCare.id));

// 6) 비구성원은 못 읽음 (momB)
const C = await api('momB@dadamom.test');
const cRows = await C.rows(fid);
ok('비구성원 읽기 0행', Array.isArray(cRows) && cRows.length === 0);

// 7) 실패 토스트가 없었는지
const bad = A.toasts.concat(B.toasts).filter((t) => /못했어요|실패/.test(t));
ok('실패 안내 없음', !bad.length, bad.join(' / '));

// 8) 나가기 (B → A, A 는 마지막이라 가족 기록 삭제)
await B.page.click('[data-family-leave]');
await sleep(3000);
ok('B 나가기', !(await appState(B.page)).family);
await growth(A.page);
ok('A 화면 1명', (await A.page.textContent('#family-body')).includes('1명'));
await A.page.click('[data-family-leave]');
await sleep(3000);
ok('A 나가기', !(await appState(A.page)).family);
rows = await A0.rows(fid);
ok('마지막 사람 나감 → 기록 비공개(0행)', Array.isArray(rows) && rows.length === 0);

await browser.close();
await A0.rpc('leave_family'); await B0.rpc('leave_family');
console.log(fail ? '실패 ' + fail : '전부 통과');
process.exit(fail ? 1 : 0);
