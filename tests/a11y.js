// 주요 화면 접근성 검사(axe-core, cdnjs). 스텁 로그인. 심각·중대 위반만 출력.  node tests/a11y.js [BASE]  (로컬 서버 필요)
const { chromium } = require(process.cwd() + '/node_modules/playwright');
const fs = require('fs');
const STUB = fs.readFileSync('tests/supabase-stub.js', 'utf8');
const BASE = process.argv[2] || 'http://localhost:8000';
const AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.route('**/supabase-js@2**', (r) => r.fulfill({ contentType: 'application/javascript', body: STUB }));
  const agg = {};
  const run = async (label) => {
    await p.addStyleTag({ content: '#test-banner{display:none !important}' }).catch(() => {});
    await p.addScriptTag({ url: AXE });
    const res = await p.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, sample: v.nodes.slice(0, 12).map((x) => x.target.join(' ') + ' :: ' + (x.failureSummary || '').split('\n')[1]) }));
    });
    for (const v of res) {
      const k = v.id;
      agg[k] = agg[k] || { impact: v.impact, help: v.help, screens: [], sample: v.sample };
      agg[k].screens.push(label + '(' + v.n + ')'); agg[k].sample = agg[k].sample.concat(v.sample.map((s) => label + ' | ' + s));
    }
  };
  await p.goto(BASE + '/index.html#onboarding', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  await run('onboarding');
  await p.evaluate(() => {
    const S = window.__SBSTUB, now = new Date().toISOString();
    S.store.profiles.push({ id: 'u1', onboarded: true, nickname: '하람이', kid_type: 'parenting', birth_month: '2025-07', region: '인천', interests: ['이유식'] });
    S.store.community_posts.push({ id: 'p1', owner_id: 'u2', author: '남', text: '[질문] 이유식 거부할 때 어떻게 하세요?', status: 'approved', likes: 2, comments: 1, created_at: now });
    S.signIn('u1', 'a@b.test');
  });
  await p.waitForTimeout(1500);
  for (const h of ['home', 'community', 'challenge', 'growth', 'my', 'benefit', 'outing']) {
    await p.evaluate((x) => { location.hash = '#' + x; }, h); await p.waitForTimeout(1500);
    await run(h);
  }
  for (const h of ['#/', '#/p/p1', '#/write', '#/my']) {
    await p.goto(BASE + '/community.html' + h, { waitUntil: 'load' }); await p.waitForTimeout(2000);
    await run('web' + h);
  }
  for (const [k, v] of Object.entries(agg)) {
    console.log('\n[' + v.impact + '] ' + k + ' — ' + v.help);
    console.log('  화면: ' + v.screens.join(', '));
    v.sample.forEach((s) => console.log('  예: ' + s.slice(0, 200)));
  }
  if (!Object.keys(agg).length) console.log('심각·중대 위반 없음');
  await b.close();
})();
