// 첫 화면 속도 재기 (읽기만 함). node tests/_tmp_perf.mjs [주소] [횟수]
import { chromium, devices } from 'playwright';
const url = process.argv[2] || 'https://dadamom.co.kr/index.html#home';
const runs = +(process.argv[3] || 3);
const b = await chromium.launch();
const res = [];
for (let i = 0; i < runs; i++) {
  const c = await b.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
  const p = await c.newPage();
  const cdp = await c.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8 * 1.5, uploadThroughput: 750e3 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.goto(url, { waitUntil: 'load', timeout: 90000 });
  await p.waitForTimeout(3000);
  const m = await p.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const r = performance.getEntriesByType('resource').map(e => ({ u: e.name.replace(/\?.*/, '').split('/').slice(-2).join('/'), s: Math.round(e.startTime), e: Math.round(e.responseEnd), kb: Math.round(e.transferSize / 1024) }));
    const home = document.querySelector('#home-install, .home-hero, main');
    return { doc: Math.round(n.responseEnd), docKB: Math.round(n.transferSize / 1024), dcl: Math.round(n.domContentLoadedEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null, load: Math.round(n.loadEventEnd), r };
  });
  res.push(m);
  if (i === 0) m.r.sort((a, b) => a.s - b.s).forEach(x => console.log(`  ${x.s}-${x.e}ms ${x.kb}KB ${x.u}`));
  console.log(`run${i + 1}: 문서 ${m.doc}ms(${m.docKB}KB) 첫글자 ${m.fcp}ms 준비 ${m.dcl}ms 다열림 ${m.load}ms`);
  await c.close();
}
const med = k => res.map(x => x[k]).sort((a, b) => a - b)[Math.floor(res.length / 2)];
console.log(`중간값: 첫글자 ${med('fcp')}ms 준비 ${med('dcl')}ms 다열림 ${med('load')}ms`);
await b.close();
