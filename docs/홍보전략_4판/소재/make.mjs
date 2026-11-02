// 홍보 1단계 소재 이미지 (당근 1080x1080 2종, 인스타 1080x1350 4장).
//   node docs/홍보전략_4판/소재/make.mjs   → 같은 폴더에 PNG
// 글씨 중심 + 예시 사진은 작은 액자(원본이 640px 이라 크게 쓰면 흐림). 이모지 없음. 글꼴은 앱과 같은 DadaRound.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const f = p => url.pathToFileURL(path.join(ROOT, p)).href;
const PHOTO = n => f('assets/challenge/' + n + '.jpg');

const base = (w, h, body) => `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
@font-face{font-family:D;src:url('${f('assets/fonts/DadaRoundR.woff2')}');font-weight:400}
@font-face{font-family:D;src:url('${f('assets/fonts/DadaRoundB.woff2')}');font-weight:700}
@font-face{font-family:D;src:url('${f('assets/fonts/DadaRoundEB.woff2')}');font-weight:800}
*{box-sizing:border-box;margin:0}
body{width:${w}px;height:${h}px;overflow:hidden;font-family:D,sans-serif;font-weight:700;color:#3D3027;background:#FFFBF7;word-break:keep-all;letter-spacing:-.01em}
.page{position:absolute;inset:0;padding:84px 88px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:800;color:#A34429}
.brand img{width:56px;height:56px;border-radius:16px}
.chip{display:inline-block;align-self:flex-start;padding:12px 24px;border-radius:999px;background:#FFE7D6;color:#A34429;font-size:30px;font-weight:800}
h1{font-size:92px;line-height:1.18;font-weight:800;letter-spacing:-.035em}
h1 em{font-style:normal;color:#A34429}
.sub{font-size:38px;line-height:1.5;color:#7A6A5D}
.card{background:#fff;border:2px solid #F1E2D8;border-radius:40px;padding:34px 40px}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:24px;padding:22px 0;border-top:2px solid #F1E2D8;font-size:36px}
.row:first-child{border-top:none}
.row b{font-size:44px;font-weight:800;color:#A34429;white-space:nowrap}
.row span{color:#7A6A5D}
.step{display:flex;gap:28px;align-items:center;padding:26px 0;border-top:2px solid #F1E2D8;font-size:40px}
.step:first-child{border-top:none}
.n{flex:0 0 auto;width:72px;height:72px;border-radius:50%;background:#FFE7D6;color:#A34429;font-size:36px;font-weight:800;display:flex;align-items:center;justify-content:center}
.step small{display:block;font-size:30px;color:#7A6A5D;font-weight:700;margin-top:4px}
.photo{border-radius:36px;overflow:hidden;background:#F4E9DF}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:30px;color:#7A6A5D}
.cta{padding:20px 36px;border-radius:999px;background:#A34429;color:#fff;font-size:34px;font-weight:800}
.prize{background:#EEF3E6;border:2px solid #D9E5CC;border-radius:40px;padding:34px 40px}
.prize .k{font-size:30px;color:#5C7A4B}.prize b{display:block;font-size:84px;font-weight:800;color:#3F6B49;letter-spacing:-.03em;line-height:1.15}
.small{font-size:26px;color:#9A8B7E;line-height:1.5}
</style><body><div class="page">${body}</div></body></html>`;

const BRAND = `<div class="brand"><img src="${f('icons/icon-192.png')}" alt="">다다맘</div>`;

const items = [
  // 당근 A: 볼살 4만 원
  { file: 'danggn-a.png', w: 1080, h: 1080, body: `${BRAND}
    <div style="display:flex;gap:44px;margin-top:56px;align-items:center">
      <div style="flex:1;display:flex;flex-direction:column;gap:26px">
        <span class="chip">이번 달 볼살 자랑</span>
        <h1 style="font-size:84px">볼살 사진<br>한 장으로<br><em>배민 4만 원</em></h1>
      </div>
      <div class="photo" style="width:330px;height:420px"><img src="${PHOTO('cheeks')}" style="object-position:58% 40%"></div>
    </div>
    <div class="sub" style="margin-top:38px">투표를 가장 많이 받은 아이 1명 · 배민 또는 올리브영</div>
    <div class="foot"><span>처음 참가하면 커피 한 잔</span><span class="cta">참가하기</span></div>` },
  // 당근 B: 첫 참가 커피
  { file: 'danggn-b.png', w: 1080, h: 1080, body: `${BRAND}
    <span class="chip" style="margin-top:60px">우리 아이 자랑 대회</span>
    <h1 style="margin-top:28px">처음 참가하면<br><em>커피 한 잔</em> 드려요</h1>
    <div class="card" style="margin-top:44px">
      <div class="row"><span>볼살 자랑 1위</span><b>4만 원</b></div>
      <div class="row"><span>첫걸음 · 배밀이 · 만삭 1위</span><b>2만 원</b></div>
    </div>
    <div class="foot"><span>매달 열려요 · 선착순 30명 메가커피</span><span class="cta">참가하기</span></div>` },
  // 인스타 1: 표지
  { file: 'insta-1.png', w: 1080, h: 1350, body: `${BRAND}
    <span class="chip" style="margin-top:70px">매달 열리는 자랑 대회</span>
    <h1 style="margin-top:30px">우리 아이를<br>이달의 <em>주인공</em>으로</h1>
    <div style="display:flex;gap:22px;margin-top:60px">
      <div class="photo" style="flex:1;height:420px"><img src="${PHOTO('firststep')}" style="object-position:50% 30%"></div>
      <div class="photo" style="flex:1;height:420px"><img src="${PHOTO('cheeks')}" style="object-position:58% 40%"></div>
      <div class="photo" style="flex:1;height:420px"><img src="${PHOTO('bump')}" style="object-position:50% 50%"></div>
    </div>
    <div class="foot"><span>예시 사진 · Pexels</span><span>넘겨서 보기 ›</span></div>` },
  // 인스타 2: 경품
  { file: 'insta-2.png', w: 1080, h: 1350, body: `${BRAND}
    <h1 style="margin-top:70px;font-size:80px">이번 달 경품</h1>
    <div class="prize" style="margin-top:44px"><span class="k">포동포동 볼살 자랑 1위</span><b>배민·올리브영 4만 원</b></div>
    <div class="card" style="margin-top:28px">
      <div class="row"><span>첫걸음 챌린지 1위</span><b>2만 원</b></div>
      <div class="row"><span>뒤집기·배밀이 대회 1위</span><b>2만 원</b></div>
      <div class="row"><span>만삭·D라인 자랑 1위</span><b>2만 원</b></div>
      <div class="row"><span>처음 참가 선착순 30명</span><b>커피 1잔</b></div>
    </div>
    <div class="foot"><span>배민·올리브영 중 당첨자가 골라요</span><span>매달 첫 주 발표</span></div>` },
  // 인스타 3: 참가 방법
  { file: 'insta-3.png', w: 1080, h: 1350, body: `${BRAND}
    <h1 style="margin-top:70px;font-size:80px">참가는 이렇게</h1>
    <div class="card" style="margin-top:50px">
      <div class="step"><span class="n">1</span><span>다다맘에 가입해요<small>이메일 인증번호 또는 카카오·네이버</small></span></div>
      <div class="step"><span class="n">2</span><span>사진이나 1분 영상을 올려요<small>대회마다 사진 또는 영상</small></span></div>
      <div class="step"><span class="n">3</span><span>가족·친구에게 투표를 부탁해요<small>링크 하나로 보내면 끝</small></span></div>
    </div>
    <div class="foot"><span>dadamom.co.kr</span><span class="cta">프로필 링크</span></div>` },
  // 인스타 4: 공정한 규칙
  { file: 'insta-4.png', w: 1080, h: 1350, body: `${BRAND}
    <h1 style="margin-top:70px;font-size:80px">정해진 규칙으로<br>공정하게 뽑아요</h1>
    <div class="card" style="margin-top:50px">
      <div class="step"><span class="n">1</span><span>투표를 가장 많이 받은 아이가 1위<small>한 사람이 대회마다 한 달에 한 표</small></span></div>
      <div class="step"><span class="n">2</span><span>카카오·네이버 가입은 바로 투표<small>이메일 가입은 다음 날부터 · 가족은 바로</small></span></div>
      <div class="step"><span class="n">3</span><span>사진은 회원끼리만 봐요<small>당첨 전 원본 사진을 확인해요</small></span></div>
    </div>
    <div class="foot"><span>다다맘 · 우리 아이 자랑 대회</span><span class="cta">지금 참가하기</span></div>` },
];

const b = await chromium.launch();
for (const it of items) {
  const p = await b.newPage({ viewport: { width: it.w, height: it.h } });
  // setContent(about:blank) 에서는 file:// 사진·글꼴을 못 읽어서 임시 파일로 연다
  const tmp = path.join(HERE, '_' + it.file.replace('.png', '.html'));
  fs.writeFileSync(tmp, base(it.w, it.h, it.body));
  await p.goto(url.pathToFileURL(tmp).href, { waitUntil: 'load' });
  fs.unlinkSync(tmp);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(HERE, it.file) });
  await p.close();
  console.log('ok', it.file);
}
await b.close();
