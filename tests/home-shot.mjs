// 홈 화면을 테스트 계정으로 찍는다 (눈으로 확인용). node tests/home-shot.mjs [base] [out-dir]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://localhost:8000/';
const out = process.argv[3] || 'test-results';
const env = fs.readFileSync(new URL('../config/env.staging.js', import.meta.url), 'utf8');
const U = env.match(/SUPABASE_URL:\s*'([^']+)'/)[1], K = env.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)[1];
assert.equal(new URL(U).hostname, 'srxdtddrtnhtlbbviyvs.supabase.co', 'STOP: 테스트 DB가 아님');
const ref = new URL(U).hostname.split('.')[0];
const login = async e => (await (await fetch(U + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: K, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: 'dadamom-test-1234' }) })).json());
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
let bad = 0;
for (const [who, email] of [['momA', 'momA@dadamom.test'], ['momB', 'momB@dadamom.test']]) {
  const s = await login(email);
  const c = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 384, height: 800 }, serviceWorkers: 'block' });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([s, r]) => { localStorage.setItem('sb-' + r + '-auth-token', JSON.stringify(s)); localStorage.setItem('dadamom.installHint', 'off'); }, [s, ref]);
  await p.goto(base + 'index.html#home'); await p.waitForTimeout(5000);
  await p.locator('[data-popup-today]').click({ timeout: 1500 }).catch(() => {});
  await p.waitForTimeout(500);
  const hs = await p.evaluate(() => ({ hscroll: document.documentElement.scrollWidth > innerWidth, split: getComputedStyle(document.getElementById('home-split')).gridTemplateColumns.split(' ').length, missions: document.querySelectorAll('#home-missions .hs2-row').length, prize: !document.getElementById('home-prize').hidden }));
  console.log(who, JSON.stringify(hs), errs.length ? 'ERR ' + errs.join(' / ') : 'no errors');
  if (hs.hscroll || hs.split !== 2 || errs.length) bad++;
  await p.screenshot({ path: `${out}/home-${who}.png` });
  // 누르면 제대로 가는지: 기록하기 → 육아기록, 경품 칸 → 챌린지, 미션 첫 줄 → 그 화면
  for (const [sel, want] of [['.hs2-btn', '#growth'], ['#home-prize', '#challenge'], ['#home-missions .hs2-row', who === 'momB' ? '#prep' : '#growth']]) {
    await p.evaluate(() => { location.hash = '#home'; }); await p.waitForTimeout(700);
    await p.locator(sel).first().click(); await p.waitForTimeout(900);
    const h = await p.evaluate(() => location.hash);
    console.log('  ' + who + ' ' + sel + ' → ' + h + (h === want ? '' : '  (기대 ' + want + ')'));
    if (h !== want) bad++;
  }
  await c.close();
}
await b.close();
process.exit(bad ? 1 : 0);
