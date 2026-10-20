// 다다맘 앱 로고 후보 3개를 512px PNG 로 만든다.  node docs/로고/make_logo.js
// A: '다' 글자 (스토어 그래픽·삭제 안내 페이지와 같은 표시)  B: 엄마·아이 두 얼굴  C: 말풍선 + 하트 (커뮤니티)
const { chromium } = require('playwright');
const path = require('path');
const OUT = __dirname;
const BG = 'linear-gradient(140deg,#FF9A76 0%,#FF7A59 55%,#F2A93B 100%)';
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&display=swap">';
const wrap = (inner) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
  *{margin:0;box-sizing:border-box} body{width:512px;height:512px;background:transparent}
  .tile{width:512px;height:512px;border-radius:112px;background:${BG};display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
  .tile:before{content:'';position:absolute;inset:0;background:radial-gradient(360px 260px at 20% 10%,rgba(255,255,255,.28),transparent 60%)}
</style></head><body><div class="tile">${inner}</div></body></html>`;

const LOGOS = {
  A: wrap(`<span style="font-family:Jua;font-size:300px;line-height:1;color:#fff;position:relative;top:6px;text-shadow:0 10px 26px rgba(150,50,10,.25)">다</span>`),
  B: wrap(`<svg width="330" height="300" viewBox="0 0 330 300" style="position:relative">
      <circle cx="130" cy="120" r="92" fill="#fff"/>
      <circle cx="240" cy="190" r="62" fill="#FFF3E6" stroke="#FF7A59" stroke-width="14"/>
      <path d="M105 128 q25 24 50 0" stroke="#FF7A59" stroke-width="14" fill="none" stroke-linecap="round"/>
      <circle cx="104" cy="102" r="9" fill="#C94318"/><circle cx="156" cy="102" r="9" fill="#C94318"/>
      <path d="M222 198 q18 16 36 0" stroke="#C94318" stroke-width="11" fill="none" stroke-linecap="round"/>
      <circle cx="224" cy="178" r="7" fill="#C94318"/><circle cx="256" cy="178" r="7" fill="#C94318"/>
    </svg>`),
  C: wrap(`<svg width="320" height="300" viewBox="0 0 320 300" style="position:relative">
      <path d="M40 40 h240 a40 40 0 0 1 40 40 v120 a40 40 0 0 1 -40 40 h-120 l-64 52 v-52 h-56 a40 40 0 0 1 -40 -40 v-120 a40 40 0 0 1 40 -40z" fill="#fff"/>
      <path d="M160 202 C 100 160 92 120 118 104 C 136 93 154 102 160 116 C 166 102 184 93 202 104 C 228 120 220 160 160 202 Z" fill="#FF7A59"/>
    </svg>`),
};

(async () => {
  const b = await chromium.launch();
  for (const [k, html] of Object.entries(LOGOS)) {
    const p = await b.newPage({ viewport: { width: 512, height: 512 } });
    await p.setContent(html, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT, 'logo-' + k + '.png'), omitBackground: true });
    await p.close();
  }
  // 비교용 한 장
  const p = await b.newPage({ viewport: { width: 1200, height: 520 } });
  const fs = require('fs');
  const img = (k) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, 'logo-' + k + '.png')).toString('base64');
  await p.setContent(`<body style="margin:0;background:#FFFBF5;font-family:sans-serif;display:flex;gap:36px;justify-content:center;align-items:center;height:520px">
    ${['A', 'B', 'C'].map((k) => `<div style="text-align:center"><img src="${img(k)}" style="width:330px;height:330px"><div style="margin-top:14px;font-size:28px;font-weight:700;color:#2B2118">${k}</div></div>`).join('')}</body>`);
  await p.screenshot({ path: path.join(OUT, 'logo-비교.png') });
  await b.close();
  console.log('완료');
})();
