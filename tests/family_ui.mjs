// 가족 공유 화면 → 실제 테스트 DB. family.spec.mjs와 같은 계정을 쓰므로 순서대로 실행한다.
// node tests/family_ui.mjs [BASE_URL] — 기본 http://localhost:8000. 배포본은 dadamom-test만 허용.
// 끝나거나 실패해도 두 계정은 leave_family + 동의 철회로 정리한다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const BASE = (process.argv[2] || 'http://localhost:8000').replace(/\/$/, '');
const target = new URL(BASE);
assert(['localhost', '127.0.0.1'].includes(target.hostname) ||
  (target.origin === 'https://adultryun188-lang.github.io' && target.pathname === '/dadamom-test'), 'STOP: 테스트 앱 주소만 허용');
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const URL_ = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1];
const KEY = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(URL_).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
const PW = 'dadamom-test-1234';
let count = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  count++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(name, fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await fn()) return; await sleep(150); }
  throw new Error('대기 시간 초과: ' + name);
}
async function api(email) {
  const request = async (path, method, body, token) => {
    const r = await fetch(URL_ + path, {
      method, signal: AbortSignal.timeout(15000),
      headers: { apikey: KEY, Authorization: 'Bearer ' + (token || KEY), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await r.text();
    if (!r.ok) throw new Error(method + ' ' + path.split('?')[0] + ': HTTP ' + r.status);
    return text ? JSON.parse(text) : null;
  };
  const login = await request('/auth/v1/token?grant_type=password', 'POST', { email, password: PW });
  assert(login.access_token, '테스트 로그인 실패');
  return {
    uid: login.user.id,
    rpc: (fn, body = {}) => request('/rest/v1/rpc/' + fn, 'POST', body, login.access_token),
    rows: fid => request('/rest/v1/family_records?select=kind,rid,body,deleted&family_id=eq.' + fid, 'GET', undefined, login.access_token),
    consent: granted => request('/rest/v1/consent_records', 'POST', { kind: 'family_share', granted, doc_version: 'v1' }, login.access_token),
    insert: rows => request('/rest/v1/family_records', 'POST', rows, login.access_token),
    // 0024 이후 기록이 계정(user_app_data)에도 남는다. 지난 실행의 기록이 쌓이지 않게 시작 전에 지운다.
    wipeAppData: () => request('/rest/v1/user_app_data?user_id=eq.' + login.user.id, 'DELETE', undefined, login.access_token)
  };
}
const appState = p => p.evaluate(() => {
  const k = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('auth-token'));
  const uid = JSON.parse(localStorage.getItem(k)).user.id;
  return JSON.parse(localStorage.getItem('dadamom_v2::' + uid) || '{}');
});
const errors = [], badRequests = [];
async function open(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route('**/*', async route => {
    const u = new URL(route.request().url());
    if ((u.hostname.endsWith('.supabase.co') && u.origin !== URL_) ||
        (u.hostname === 'adultryun188-lang.github.io' && !u.pathname.startsWith('/dadamom-test/'))) {
      badRequests.push(u.origin + u.pathname); await route.abort(); return;
    }
    await route.continue();
  });
  const page = await ctx.newPage();
  const toasts = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__toast', t => toasts.push(t));
  await page.addInitScript(() => {
    const observe = () => new MutationObserver(() => {
      const t = document.getElementById('toast');
      if (t && t.classList.contains('show')) window.__toast(t.textContent);
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
    if (document.documentElement) observe(); else document.addEventListener('DOMContentLoaded', observe, { once: true });
  });
  await page.goto(BASE + '/index.html#onboarding', { waitUntil: 'load' });
  assert.equal(await page.evaluate(() => window.DADAMOM_ENV?.SUPABASE_URL), URL_, 'STOP: 브라우저 환경이 테스트 DB가 아님');
  await page.fill('#auth-email', email);
  await page.fill('#auth-password', PW);
  await page.click('#auth-password-submit');
  await page.waitForURL('**/*#home');
  await until('로그인 프로필', async () => (await appState(page)).onboarded);
  return { ctx, page, toasts };
}
async function screen(p, name, reload = false) {
  await p.evaluate(h => { location.hash = '#' + h; }, name);
  if (reload) await p.reload({ waitUntil: 'load' });
  await p.locator('#screen-' + name).waitFor({ state: 'visible' });
}
const growth = p => screen(p, 'growth', true);
// 로그인 직후 계정 기록(user_app_data)을 받아 화면을 다시 그릴 수 있어, 통신이 잠잠해진 뒤에 입력한다
async function family(p) { await screen(p, 'my', true); await p.locator('#family-card').waitFor({ state: 'visible' }); await p.waitForLoadState('networkidle').catch(() => {}); }

let browser;
const clients = [];
try {
  const A0 = await api('momA@dadamom.test');
  assert.equal(await A0.rpc('family_privacy_version'), 17, '0017 테스트 DB 적용 후 실행하세요');
  clients.push(A0);
  const B0 = await api('dadC@dadamom.test'); clients.push(B0);
  const C0 = await api('momB@dadamom.test');
  for (const c of clients) { await c.rpc('leave_family'); await c.wipeAppData(); }
  browser = await chromium.launch();
  const A = await open(browser, 'momA@dadamom.test');
  const B = await open(browser, 'dadC@dadamom.test');
  await family(A.page);
  ok('MY 화면에서 가족 카드 보임', await A.page.isVisible('#family-card'));
  await A.page.click('[data-family-create]');
  ok('동의 전 버튼 잠김', await A.page.isDisabled('#family-consent-ok'));
  await A.page.check('#family-consent-check');
  await A.page.click('#family-consent-ok');
  await A.page.locator('[data-family-copy]').waitFor();
  const code = (await A.page.textContent('#family-body')).match(/[0-9A-F]{5}-[0-9A-F]{5}/)?.[0];
  ok('A 만들기 → 초대 코드 표시', !!code);
  await until('만들기 성공 알림', () => A.toasts.some(t => t.includes('가족 공유를 시작했어요')));
  ok('만들기 안내', true);
  await family(B.page);
  await B.page.fill('#family-join-input', code.toLowerCase());
  await B.page.click('[data-family-join]');
  ok('참여도 동의 전 버튼 잠김', await B.page.isDisabled('#family-consent-ok'));
  await B.page.check('#family-consent-check');
  await B.page.click('#family-consent-ok');
  await until('참여 성공 알림', () => B.toasts.some(t => t.includes('가족 기록에 연결됐어요')));
  ok('소문자 초대 코드로 B 참여', true);
  ok('B 화면에 2명', (await B.page.textContent('#family-body')).includes('2명'));
  const fid = (await appState(B.page)).family.id;
  await growth(A.page);
  await A.page.click('[data-care-log="feed"]');
  const aCare = (await appState(A.page)).careLog.at(-1);
  await until('수유 서버 저장', async () => (await A0.rows(fid)).some(r => r.kind === 'care' && r.rid === aCare.id && !r.deleted));
  ok('A 수유 → DB에 있음', true);
  await growth(B.page);
  await until('수유 내려받기', async () => (await appState(B.page)).careLog.some(c => c.id === aCare.id));
  ok('A 수유 → B 기기', true);
  ok('B 돌봄 화면 수유 표시', (await B.page.textContent('#carelog-list')).includes('수유'));
  await B.page.click('[data-open-growth-modal]');
  await B.page.fill('#growth-height', '74.5');
  await B.page.fill('#growth-weight', '9.1');
  await B.page.click('#growth-submit');
  const vid = await B.page.locator('[data-vax-done]').getAttribute('data-vax-done');
  await B.page.click('[data-vax-done]');
  await until('성장·접종 서버 저장', async () => {
    const rows = await A0.rows(fid);
    return rows.some(r => r.kind === 'growth' && r.body.height === 74.5 && r.body.weight === 9.1) &&
      rows.some(r => r.kind === 'vaccine' && r.rid === vid && r.body === true);
  });
  ok('B 성장·접종 → DB', true);
  await growth(A.page);
  await until('성장·접종 내려받기', async () => {
    const s = await appState(A.page);
    return s.growthRecords.some(g => g.height === 74.5 && g.weight === 9.1) && s.vaccines[vid] === true;
  });
  ok('B 성장·접종 → A 기기', true);
  ok('A 성장 목록과 그래프 갱신', (await A.page.textContent('#growth-list')).includes('74.5') && (await A.page.locator('#growth-chart svg').count()) > 0);
  await A.page.click('[data-open-vax-modal]');
  ok('A 접종 목록 완료 표시', await A.page.isChecked('[data-vax-check="' + vid + '"]'));
  await A.page.click('#modal-card [data-close-modal]');
  await A.page.click('[data-care-undo]');
  await until('취소 서버 저장', async () => (await A0.rows(fid)).some(r => r.kind === 'care' && r.rid === aCare.id && r.deleted));
  ok('취소 → DB deleted', true);
  await growth(B.page);
  await until('취소 내려받기', async () => !(await appState(B.page)).careLog.some(c => c.id === aCare.id));
  ok('취소 → B 기기에서도 사라짐', true);
  ok('B 돌봄 화면에서도 제거', !(await B.page.textContent('#carelog-list')).includes('수유'));
  await A.page.click('[data-care-log="sleep"]');
  await until('수면 시작 저장', async () => (await A0.rows(fid)).some(r => r.kind === 'care' && r.body.type === 'sleep_start'));
  await growth(B.page);
  await until('B 수면 상태 갱신', async () => (await B.page.textContent('#carelog-sleep-label')).includes('기상하기'));
  ok('A 수면 시작 → B 화면 기상하기', true);
  await B.page.click('[data-care-log="sleep"]');
  await until('수면 종료 저장', async () => (await A0.rows(fid)).some(r => r.kind === 'care' && r.body.type === 'sleep_end'));
  await growth(A.page);
  await until('A 수면 종료 상태 갱신', async () => (await A.page.textContent('#carelog-sleep-label')).includes('수면 시작'));
  ok('B 수면 종료 → A 화면 수면 시작', true);
  ok('비구성원 읽기 0행', (await C0.rows(fid)).length === 0);
  const bad = A.toasts.concat(B.toasts).filter(t => /못했어요|실패/.test(t));
  ok('정상 흐름 중 실패 안내 없음', !bad.length, bad.join(' / '));

  // 저장 실패 뒤 pull이 예전 서버 값으로 미전송 수정을 덮어쓰면 안 된다.
  const recordsRoute = URL_ + '/rest/v1/family_records*';
  await B.page.route(recordsRoute, route => route.request().method() === 'POST' ? route.abort() : route.continue());
  await B.page.click('[data-open-vax-modal]');
  await B.page.uncheck('[data-vax-check="' + vid + '"]');
  await B.page.click('#modal-card [data-close-modal]');
  await until('미전송 접종 보관', async () => (await appState(B.page)).familyOutbox.some(r => r.kind === 'vaccine' && r.rid === vid && r.body === false));
  await until('저장 실패 알림', () => B.toasts.some(t => t.includes('가족 기록을 보내지 못했어요')));
  ok('저장 실패 알림과 outbox 보관', true);
  await growth(B.page);
  await until('실패한 재전송 후 서버 조회', async () => (await appState(B.page)).family?.cursor);
  await sleep(500);
  ok('재조회가 미전송 접종 해제를 되돌리지 않음', (await appState(B.page)).vaccines[vid] === false);
  await B.page.unroute(recordsRoute);
  await growth(B.page);
  await until('접종 재전송', async () => (await A0.rows(fid)).some(r => r.kind === 'vaccine' && r.rid === vid && r.body === false));
  await until('재전송 후 기기 값 일치', async () => (await appState(B.page)).vaccines[vid] === false);
  await until('재전송 응답 처리 완료', async () => !(await appState(B.page)).familyOutbox.length);
  ok('연결 복구 후 재전송·outbox 비움', !(await appState(B.page)).familyOutbox.length);

  // 첫 요청만 지연시켜 실제 DB에 역순으로 도착할 수 있는 연속 수정을 재현한다.
  let releaseFirst, sawFirst;
  const firstSeen = new Promise(r => { sawFirst = r; });
  const firstGate = new Promise(r => { releaseFirst = r; });
  let writes = 0;
  await B.page.route(recordsRoute, async route => {
    if (route.request().method() === 'POST' && ++writes === 1) { sawFirst(); await firstGate; }
    await route.continue();
  });
  await B.page.click('[data-open-vax-modal]');
  await B.page.check('[data-vax-check="' + vid + '"]');
  await Promise.race([firstSeen, sleep(10000).then(() => { throw new Error('연속 수정 첫 요청 없음'); })]);
  await B.page.uncheck('[data-vax-check="' + vid + '"]');
  await sleep(400);
  releaseFirst();
  await until('연속 수정 전송 완료', async () => !(await appState(B.page)).familyOutbox.length);
  await sleep(500);
  ok('빠른 연속 수정은 마지막 접종 해제가 DB에 남음', (await A0.rows(fid)).find(r => r.kind === 'vaccine' && r.rid === vid)?.body === false);
  await B.page.unroute(recordsRoute);
  await B.page.click('#modal-card [data-close-modal]');

  // 조회 응답을 늦춰도 그 사이 저장까지 마친 새 수정이 예전 값으로 되돌아가지 않는다.
  let releaseRead, sawRead;
  const readSeen = new Promise(r => { sawRead = r; });
  const readGate = new Promise(r => { releaseRead = r; });
  let heldRead = false;
  await B.page.route(recordsRoute, async route => {
    if (route.request().method() === 'GET' && !heldRead) {
      heldRead = true;
      const response = await route.fetch(); sawRead();
      await readGate; await route.fulfill({ response }); return;
    }
    await route.continue();
  });
  await growth(B.page);
  await Promise.race([readSeen, sleep(10000).then(() => { throw new Error('지연 조회 요청 없음'); })]);
  await B.page.click('[data-open-vax-modal]');
  await B.page.check('[data-vax-check="' + vid + '"]');
  await until('조회 중 새 접종 저장 완료', async () => !(await appState(B.page)).familyOutbox.length &&
    (await A0.rows(fid)).find(r => r.kind === 'vaccine' && r.rid === vid)?.body === true);
  const readDone = B.page.waitForResponse(r => r.url().startsWith(URL_ + '/rest/v1/family_records') && r.request().method() === 'GET');
  releaseRead(); await readDone; await sleep(300);
  ok('늦게 온 조회 응답이 방금 저장한 접종을 덮어쓰지 않음', (await appState(B.page)).vaccines[vid] === true);
  await B.page.unroute(recordsRoute);
  await B.page.click('#modal-card [data-close-modal]');

  // 첫 조회도 기본 1000행에서 잘리지 않아야 한다. 추가한 테스트 행은 마지막 leave로 삭제한다.
  const bulkPrefix = 'family-page-' + Date.now() + '-';
  for (let offset = 0; offset < 1005; offset += 200) {
    await A0.insert(Array.from({ length: Math.min(200, 1005 - offset) }, (_, i) => ({
      family_id: fid, kind: 'care', rid: bulkPrefix + String(offset + i).padStart(4, '0'),
      body: { type: 'feed', ts: Date.UTC(2020, 0, 1) + offset + i }, deleted: false
    })));
  }
  await growth(B.page);
  await until('1000행 초과 기록 내려받기', async () => (await appState(B.page)).careLog.filter(c => c.id.startsWith(bulkPrefix)).length === 1005);
  ok('1000행 초과 기록도 모두 내려받음', true);

  await family(B.page);
  await B.page.click('[data-family-leave]');
  await until('B 나가기', async () => !(await appState(B.page)).family);
  ok('B 나가기', true);
  ok('나가도 B 기기 성장 기록 유지', (await appState(B.page)).growthRecords.some(g => g.height === 74.5));
  await family(A.page);
  await until('구성원 수 갱신', async () => (await A.page.textContent('#family-body')).includes('1명'));
  ok('A 화면 1명', true);
  await A.page.click('[data-family-leave]');
  await until('A 나가기', async () => !(await appState(A.page)).family);
  ok('A 나가기', true);
  ok('마지막 사람 나감 → 두 계정 가족 없음', await A0.rpc('my_family') === null && await B0.rpc('my_family') === null);
  ok('마지막 사람 나감 → 기록 접근 0행', (await A0.rows(fid)).length === 0);
} catch (e) {
  failed++; console.error('ERROR ' + e.message);
} finally {
  if (browser) await browser.close();
  for (const c of clients) {
    try {
      await c.rpc('leave_family'); await c.consent(false);
      ok('테스트 계정 가족 정리 ' + c.uid, await c.rpc('my_family') === null);
    } catch (e) { failed++; console.error('CLEANUP ERROR ' + e.message); }
  }
}
ok('브라우저 JS 오류 없음', !errors.length, [...new Set(errors)].join(' / '));
ok('테스트 이외 앱·DB 요청 없음', !badRequests.length, badRequests.join(' / '));
console.log(`${count}개 확인, 실패 ${failed}건`);
process.exitCode = failed ? 1 : 0;
