// 휴대폰 실기기 에뮬레이션으로 가로 넘침(옆으로 밀림)을 잡는다.
//   node tests/overflow.mjs [BASE_URL]   기본 http://localhost:8000
// 페이지마다 문서 폭과, 화면 오른쪽 밖으로 나가는 요소를 출력한다. 넘침이 있으면 종료 코드 1.
import { chromium, devices } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8000';
const PAGES = ['community.html#/', 'community.html#/brand', 'community.html#/b/all', 'community.html#/challenge', 'community.html#/outing',
  'community.html#/my', 'community.html#/write', 'community.html#/p/7bd0cf22-beb4-4263-a131-0cccf7468e4a', 'community.html#/b/notice', 'index.html#home', '404.html', 'delete-account.html'];
// 280·300px: 큰 글씨 설정을 켠 휴대폰은 같은 화면에 글자가 커서 더 좁은 화면처럼 동작한다
const PHONES = ['Galaxy S9+', 'Pixel 7', 'iPhone SE', 'iPhone 13', '좁게 300', '좁게 280'];
const custom = (w) => ({ ...devices['Galaxy S9+'], viewport: { width: w, height: 640 } });

const browser = await chromium.launch();
let bad = 0;
for (const name of PHONES) {
  const ctx = await browser.newContext(name.startsWith('좁게') ? custom(Number(name.split(' ')[1])) : { ...devices[name] });
  const page = await ctx.newPage();
  for (const p of PAGES) {
    await page.goto(BASE + '/' + p, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const sw = document.documentElement.scrollWidth;
      const over = [];
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width && b.right > vw + 1) {
          // 가로 스크롤 상자 안에 있는 건 의도된 것
          let q = el.parentElement, scroller = false;
          while (q && q !== document.body) { const o = getComputedStyle(q).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scroller = true; break; } q = q.parentElement; }
          if (!scroller) over.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + ' →' + Math.round(b.right));
        }
      }
      return { vw, sw, over: over.slice(0, 6) };
    });
    const ok = r.sw <= r.vw && !r.over.length;
    if (!ok) bad++;
    console.log((ok ? 'OK  ' : 'BAD ') + name.padEnd(11) + ' ' + p.padEnd(26) + ' 화면 ' + r.vw + ' / 문서 ' + r.sw + (r.over.length ? '  넘침: ' + r.over.join(', ') : ''));
  }
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
