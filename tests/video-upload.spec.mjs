// 영상 올리기(30초·50MB) → 실제 테스트 DB. node tests/video-upload.spec.mjs
// momA 가 앱에서 5초 영상으로 볼살 챌린지 참가 → DB·저장소 확인, 35초 영상은 막힘, 저장소는 50MB 넘는 영상을 거절. 만든 것은 지운다.
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dadamom-vid-'));
const mk = (name, sec) => { const f = path.join(dir, name); execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=pink:s=320x240:d=${sec}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', f]); return f; };
const short = mk('short5.mp4', 5), long = mk('long35.mp4', 35);
const h = (t, x = {}) => ({ apikey: K, Authorization: 'Bearer ' + (t || K), ...x });
const A = await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: h(null, { 'Content-Type': 'application/json' }), body: JSON.stringify({ email: 'momA@dadamom.test', password: 'dadamom-test-1234' }) })).json();
const NOTE = '영상 올리기 시험 ' + Date.now().toString(36);
const b = await chromium.launch(); const errs = [];
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
  await p.setInputFiles('#entry-file', long); await p.waitForTimeout(1500);
  ok('35초 영상: 안내 + 제출 잠김', (await p.textContent('#entry-file-hint')).includes('30초까지') && await p.isDisabled('#entry-submit'), await p.textContent('#entry-file-hint'));
  await p.setInputFiles('#entry-file', short); await p.waitForTimeout(1500);
  ok('5초 영상: 첨부됨 표시 + 제출 가능', (await p.textContent('#entry-file-hint')).includes('5초') && !(await p.isDisabled('#entry-submit')), await p.textContent('#entry-file-hint'));
  await p.click('#entry-submit'); await p.waitForTimeout(5000);
  const rows = await (await fetch(U + '/rest/v1/challenge_entries?select=id,media_path,status,challenge_key&note=eq.' + encodeURIComponent(NOTE), { headers: h(A.access_token) })).json();
  ok('DB 에 영상 참가작 (검수 대기, 볼살)', rows.length === 1 && /\.mp4$/.test(rows[0].media_path) && rows[0].status === 'pending' && rows[0].challenge_key === 'cheeks', JSON.stringify(rows));
  ok('목록에 내 영상 카드(▶) 보임', await p.locator('#entries video').count() >= 1);
  // 저장소: 50MB 넘는 영상은 거절
  const big = Buffer.alloc(51 * 1024 * 1024);
  const up = await fetch(U + '/storage/v1/object/media/' + A.user.id + '/too-big-test.mp4', { method: 'POST', headers: h(A.access_token, { 'Content-Type': 'video/mp4' }), body: big });
  ok('저장소가 50MB 넘는 영상 거절', !up.ok, 'HTTP ' + up.status);
  const gif = await fetch(U + '/storage/v1/object/media/' + A.user.id + '/x-test.gif', { method: 'POST', headers: h(A.access_token, { 'Content-Type': 'image/gif' }), body: Buffer.from('GIF89a') });
  ok('저장소가 허용 안 된 종류(gif) 거절', !gif.ok, 'HTTP ' + gif.status);
  for (const r of rows) {
    await fetch(U + '/rest/v1/challenge_entries?id=eq.' + r.id, { method: 'DELETE', headers: h(A.access_token) });
    await fetch(U + '/storage/v1/object/media/' + r.media_path, { method: 'DELETE', headers: h(A.access_token) });
  }
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
} catch (e) { failed++; console.log('FAIL 실행 중단: ' + e.message.split('\n')[0]); }
finally { await b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
