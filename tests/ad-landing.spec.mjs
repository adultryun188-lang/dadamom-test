// 광고 링크로 처음 온 사람(비로그인·새 기기)이 대회 화면과 경품을 보는지, 가입 경로(from)가 남는지.
//   node tests/ad-landing.spec.mjs [base]
import { chromium, devices } from 'playwright';
const base = process.argv[2] || 'http://localhost:8000/';
const b = await chromium.launch();
let bad = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); if (!c) bad++; };
for (const [code, path] of [['dg-a', 'community.html?from=dg-a#/challenge?c=cheeks'], ['dg-b', 'community.html?from=dg-b#/challenge'], ['ig-bio', 'community.html?from=ig-bio#/challenge'], ['friend', 'index.html?from=friend#challenge']]) {
  const c = await b.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + path); await p.waitForTimeout(5000);
  const r = await p.evaluate(() => ({ hash: location.hash, text: document.body.innerText, from: localStorage.getItem('dadamom.from') }));
  ok(code + ': 대회 화면에 머묾', /challenge/.test(r.hash), r.hash);
  ok(code + ': 경품이 보임', /이번 달 경품|1위에게/.test(r.text) && r.text.includes('4만 원'));
  ok(code + ': 가입 경로가 기기에 남음', r.from === code, String(r.from));
  ok(code + ': 오류 없음', errs.length === 0, errs.join(' / '));
  await c.close();
}
await b.close();
console.log(bad ? `\n${bad}개 실패` : '\n광고 착지 통과');
process.exit(bad ? 1 : 0);
