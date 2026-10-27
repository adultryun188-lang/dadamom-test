// 영상만 챌린지(0033, 첫걸음·배밀이) → 실제 테스트 DB. node tests/video-only.spec.mjs  (localhost:8000 필요)
// 서버: 사진·이름만 .mp4 인 사진은 첫걸음에 못 들어가고, 진짜 영상은 들어간다. 할로윈은 사진도 된다.
// 화면: 첫걸음 참여 창은 영상만 고르게 하고, 사진을 고르면 제출이 잠긴다. 만든 것은 지운다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
let failed = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) failed++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadamom-vo-'));
const vid = path.join(dir, 'v.mp4'), jpg = path.join(dir, 'p.jpg');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=pink:s=320x240:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', vid]);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=pink:s=320x240', '-frames:v', '1', jpg]);
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x });
const A = await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, { 'Content-Type': 'application/json' }), body: JSON.stringify({ email: 'momA@dadamom.test', password: 'dadamom-test-1234' }) })).json();
const T = A.access_token, uid = A.user.id, tag = Date.now().toString(36);
const files = [], rows = [];
const upload = async (name, file, type) => {
  const p = `${uid}/vo-${tag}-${name}`;
  const r = await fetch(U + '/storage/v1/object/media/' + p, { method: 'POST', headers: h(T, { 'Content-Type': type }), body: fs.readFileSync(file) });
  if (r.ok) files.push(p);
  return r.ok ? p : null;
};
const enter = async (key, p) => {
  const id = crypto.randomUUID();
  const r = await fetch(U + '/rest/v1/challenge_entries', { method: 'POST', headers: h(T, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ id, name: '시험', age: '시험', note: 'video-only ' + tag, media_path: p, challenge_key: key }) });
  if (r.ok) rows.push(id);
  return r.status;
};
const b = await chromium.launch(); const errs = [];
try {
  const pJpg = await upload('a.jpg', jpg, 'image/jpeg');
  const pFake = await upload('fake.mp4', jpg, 'image/jpeg');   // 이름만 영상
  const pVid = await upload('b.mp4', vid, 'video/mp4');
  ok('시험 파일 올림', pJpg && pFake && pVid);
  ok('서버: 첫걸음에 사진 → 거절', (await enter('firststep', pJpg)) === 403);
  ok('서버: 첫걸음에 이름만 .mp4 인 사진 → 거절', (await enter('firststep', pFake)) === 403);
  ok('서버: 첫걸음에 파일 없이 → 거절', (await enter('firststep', null)) === 403);
  ok('서버: 배밀이에 사진 → 거절', (await enter('crawl', pJpg)) === 403);
  ok('서버: 첫걸음에 영상 → 받음', (await enter('firststep', pVid)) === 201);
  ok('서버: 할로윈에 사진 → 받음', (await enter('halloween', pJpg)) === 201);
  ok('서버: 할로윈에 영상 → 거절 (사진만)', (await enter('halloween', pVid)) === 403);

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route('**/env.js*', r => r.fulfill({ contentType: 'text/javascript', body: env }));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8000/index.html'); await p.waitForTimeout(2000);
  await p.locator('[data-popup-today]').click({ timeout: 1500 }).catch(() => {});
  await p.fill('#auth-email', 'momA@dadamom.test'); await p.fill('#auth-password', 'dadamom-test-1234');
  await p.click('#auth-password-submit'); await p.waitForTimeout(4500);
  await p.locator('[data-popup-today]').click({ timeout: 1500 }).catch(() => {});
  await p.evaluate(() => { location.hash = '#challenge'; }); await p.waitForTimeout(2500);
  await p.click('[data-challenge-open="firststep"]'); await p.waitForTimeout(800);
  ok('화면: 첫걸음 상세에 "영상만" 안내', (await p.textContent('#challenge-example')).includes('영상으로만 참가'));
  await p.click('[data-open-challenge-modal]'); await p.waitForTimeout(600);
  ok('화면: 파일 고르기가 영상만', (await p.getAttribute('#entry-file', 'accept')) === 'video/mp4,video/quicktime');
  await p.fill('#entry-note', '시험'); await p.check('#entry-consent'); await p.check('#entry-consent2');
  await p.setInputFiles('#entry-file', jpg); await p.waitForTimeout(800);
  ok('화면: 사진 고르면 안내 + 제출 잠김', (await p.textContent('#entry-file-hint')).includes('영상만') && await p.isDisabled('#entry-submit'), await p.textContent('#entry-file-hint'));
  await p.setInputFiles('#entry-file', vid); await p.waitForTimeout(1500);
  ok('화면: 영상 고르면 제출 가능', !(await p.isDisabled('#entry-submit')), await p.textContent('#entry-file-hint'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.click('[data-challenge-back]'); await p.waitForTimeout(600);
  await p.click('[data-challenge-open="halloween"]'); await p.waitForTimeout(800);
  ok('화면: 할로윈은 사진만 안내 + 예시도 사진', (await p.textContent('#challenge-example')).includes('사진으로만 참가') && await p.locator('#challenge-example img').count() === 1);
  await p.click('[data-open-challenge-modal]'); await p.waitForTimeout(600);
  ok('화면: 할로윈 파일 고르기가 사진만', (await p.getAttribute('#entry-file', 'accept')) === 'image/jpeg,image/png,image/webp');
  await p.fill('#entry-note', '시험'); await p.check('#entry-consent');
  ok('화면: 홍보 활용 동의 안 하면 제출 잠김', await p.isDisabled('#entry-submit'));
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally {
  for (const id of rows) await fetch(U + '/rest/v1/challenge_entries?id=eq.' + id, { method: 'DELETE', headers: h(T) });
  for (const f of files) await fetch(U + '/storage/v1/object/media/' + f, { method: 'DELETE', headers: h(T) });
  await b.close(); fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
