// 영상 줄이기 → 실제 크롬 + 테스트 DB. node tests/video-shrink.spec.mjs  (localhost:8000, 크롬 설치 필요)
// momA 가 앱에서 1080p 10초 영상(약 37MB, 소리 있음)으로 볼살 챌린지 참가 →
// 고르자마자 줄이기 시작, 안내에 'A → B', 저장소에 올라간 파일이 12MB 아래, 소리 트랙 유지. 만든 것은 지운다.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadamom-shrink-')), big = path.join(dir, 'big.mp4'), got = path.join(dir, 'got.mp4');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=10', '-f', 'lavfi', '-i', 'sine=f=440:d=10',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '8', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', big]);
// SRC=파일 로 다른 영상(고프로 HEVC 4K60, 세로 휴대폰 등)도 시험할 수 있다. WANT=예상 크기 (예: 720x1280)
if (process.env.SRC) fs.copyFileSync(process.env.SRC, big);
const bigSize = fs.statSync(big).size;
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x });
const A = await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, { 'Content-Type': 'application/json' }), body: JSON.stringify({ email: 'momA@dadamom.test', password: 'dadamom-test-1234' }) })).json();
const NOTE = '영상 줄이기 시험 ' + Date.now().toString(36);
// 실제 휴대폰은 사용자가 화면을 눌러 고르므로 소리 재생이 허용된다. 시험 브라우저도 같게.
const b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = []; let rows = [];
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route('**/env.js*', r => r.fulfill({ contentType: 'text/javascript', body: env }));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8000/index.html'); await p.waitForTimeout(2000);
  await p.locator('[data-popup-today]').click({ timeout: 1500 }).catch(() => {});
  await p.fill('#auth-email', 'momA@dadamom.test'); await p.fill('#auth-password', 'dadamom-test-1234');
  await p.click('#auth-password-submit'); await p.waitForTimeout(4500);
  await p.locator('[data-popup-today]').click({ timeout: 1500 }).catch(() => {});
  await p.evaluate(() => { location.hash = '#challenge'; }); await p.waitForTimeout(2500);
  await p.click('[data-challenge-open="cheeks"]'); await p.waitForTimeout(600);
  await p.click('[data-open-challenge-modal]'); await p.waitForTimeout(600);
  await p.fill('#entry-note', NOTE); await p.check('#entry-consent');
  await p.setInputFiles('#entry-file', big);
  await p.waitForFunction(() => /줄이는 중/.test(document.getElementById('entry-file-hint').textContent), null, { timeout: 8000 });
  ok('고르자마자 줄이기 시작', true);
  await p.waitForFunction(() => /준비됐어요|첨부됐어요$/.test(document.getElementById('entry-file-hint').textContent), null, { timeout: 40000 });
  const hint = await p.textContent('#entry-file-hint');
  ok('안내에 줄어든 크기 (A → B)', /→/.test(hint), hint);
  await p.click('#entry-submit'); await p.waitForTimeout(6000);
  rows = await (await fetch(U + '/rest/v1/challenge_entries?select=id,media_path&note=eq.' + encodeURIComponent(NOTE), { headers: h(A.access_token) })).json();
  ok('참가작 저장됨', rows.length === 1 && /\.mp4$/.test(rows[0].media_path), JSON.stringify(rows));
  const dl = await fetch(U + '/storage/v1/object/authenticated/media/' + rows[0].media_path, { headers: h(A.access_token) });
  fs.writeFileSync(got, Buffer.from(await dl.arrayBuffer()));
  const size = fs.statSync(got).size;
  ok('올라간 영상이 작아짐 (12MB 아래)', size < 12 * 1048576, (bigSize / 1048576).toFixed(1) + 'MB → ' + (size / 1048576).toFixed(1) + 'MB');
  let probe = '';
  try { execFileSync('ffmpeg', ['-hide_banner', '-i', got], { stdio: 'pipe' }); } catch (e) { probe = String(e.stderr); }
  ok('영상 트랙 720p' + (process.env.WANT ? ' (' + process.env.WANT + ')' : ''), process.env.WANT ? probe.includes(process.env.WANT) : /Video:.*(1280x720|720x1280)/.test(probe), ((probe.match(/Video:[^\n]*/) || [''])[0].match(/\d{3,4}x\d{3,4}/) || [''])[0]);
  ok('소리 트랙 있음', /Audio:/.test(probe));
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally {
  for (const r of rows) {
    await fetch(U + '/rest/v1/challenge_entries?id=eq.' + r.id, { method: 'DELETE', headers: h(A.access_token) });
    await fetch(U + '/storage/v1/object/media/' + r.media_path, { method: 'DELETE', headers: h(A.access_token) });
  }
  await b.close(); fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
