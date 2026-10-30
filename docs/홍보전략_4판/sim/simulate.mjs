// 다다맘 홍보 예산 시뮬레이션 (4판). 외부 패키지 없음.
// 실행: node simulate.mjs   → 같은 폴더에 결과.json, 결과.md
// 가정 출처: 01_자료수집.md, 03_기획.md 6-1·6-3절. [추정] 표시는 이 스크립트에서 정한 값.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const N = 10000, SEED = 20261030;
const OUT = dirname(fileURLToPath(import.meta.url));

// ── 난수 (시드 고정) ──
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(SEED);
// 삼각분포: 나쁨·좋음을 양 끝, 중간을 꼭짓점으로 씀
function tri(a, m, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (hi === lo) return lo;
  const u = rand(), f = (m - lo) / (hi - lo);
  return u < f ? lo + Math.sqrt(u * (hi - lo) * (m - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - m));
}

// ── 가정표: [나쁨, 중간, 좋음, 이름, 출처] ──
const P = {
  meta_cpm:   [15000, 10000, 8000, '메타 노출 1,000번 값(원)', '01 0-2·03 6-3'],
  meta_ctr:   [0.007, 0.009, 0.0125, '메타 클릭률', '01 5절·03 6-3'],
  land:       [0.70, 0.80, 0.90, '클릭 → 화면 도착 비율', '03 6-3 [추정]'],
  meta_cvr:   [0.05, 0.075, 0.11, '메타 화면 → 가입', '01 5절·03 6-3'],
  learn_pen:  [0.40, 0.20, 0.10, '메타 학습 중 비용 증가분', '[추정] 학습 기간 성과 불안정'],
  dg_cpc:     [600, 300, 150, '당근 클릭 1번 값(원)', '01 1절·03 6-3'],
  dg_ctr:     [0.005, 0.01, 0.02, '당근 클릭률(노출 계산용)', '[추정] 공개 자료 없음'],
  dg_cvr:     [0.04, 0.07, 0.10, '당근 화면 → 가입', '03 6-3'],
  dg_burn:    [0.60, 0.80, 1.00, '당근 하루 예산 소진율', '03 6-3 [추정]'],
  blog_cost:  [60000, 40000, 30000, '후기단 1명 값(원)', '03 6-3 [확인 필요]'],
  blog_tail:  [0, 1, 3, '후기 글 1편이 3개월 동안 데려오는 가입', '03 6-3 [추정]'],
  cafe_clk:   [20, 60, 150, '맘카페 배너 1곳 한 달 클릭', '[추정] 공개 자료 없음'],
  cafe_cvr:   [0.04, 0.07, 0.10, '맘카페 화면 → 가입', '[추정] 당근과 같게'],
  nv_cpc:     [1200, 500, 200, '네이버 검색광고 클릭 값(원)', '[추정] 최소 70원(01)'],
  nv_ctr:     [0.01, 0.02, 0.04, '네이버 검색광고 클릭률', '[추정]'],
  nv_cvr:     [0.05, 0.08, 0.12, '네이버 화면 → 가입', '[추정] 찾는 사람이라 조금 높게'],
  ig_su:      [0, 4, 15, '나노 제작자 1명이 데려오는 가입', '[추정] 01 "추정 불가"'],
  entry:      [0.20, 0.35, 0.50, '가입자 중 참가작 올리는 비율', '03 6-3 [추정]'],
  share:      [0.30, 0.50, 0.70, '참가자 중 응원 링크 보내는 비율', '03 6-3 [추정]'],
  per_link:   [1, 2, 4, '링크 1번에 들어오는 사람', '03 6-3 [추정]'],
  link_cvr:   [0.10, 0.20, 0.30, '링크로 온 사람 → 가입', '03 6-3 [추정]'],
  link_entry: [0.10, 0.30, 0.50, '링크 가입자 중 참가 비율(가입자 비율 대비)', '[추정] 응원하러 온 사람'],
  fam_inv:    [0.05, 0.10, 0.15, '가족 공유 초대 비율', '03 6-3 [추정]'],
  fam_size:   [1.2, 1.5, 2.0, '초대 1건당 가입', '03 6-3 [추정]'],
  r7:         [0.11, 0.18, 0.25, '7일 재방문', '01 0-3·03 6-3'],
  mod_cap:    [30, 60, 100, '하루 검수 처리량', '03 6-3 [확인 필요]'],
};
for (const [k, [b, m, g]] of Object.entries(P)) {
  assert.ok(Math.min(b, g) <= m && m <= Math.max(b, g), `${k}: 중간값이 범위 밖`);
  if (k.endsWith('ctr') || k.endsWith('cvr') || ['land', 'entry', 'share', 'link_cvr', 'link_entry', 'fam_inv', 'r7', 'dg_burn'].includes(k))
    for (const v of [b, m, g]) assert.ok(v >= 0 && v <= 1, `${k}: 확률이 0~1 밖`);
}

// ── 예산안 (월, 원). 03 6-1절 그대로 ──
// other = 경품·추첨·예비 (사람을 데려오지 않는 돈)
const PLANS = {
  p20: { label: '기존 20만 원안', total: 200000, days: 20, halfStart: false, meta: 6000, dg: 0, blog: 0, cafe: 0, cafeN: 0, cafeStart: 99, nv: 0, ig: 0, igN: 0, other: 80000 },
  min: { label: '최소안 120만', total: 1200000, days: 30, halfStart: true, meta: 20000, dg: 5000, blog: 300000, cafe: 0, cafeN: 0, cafeStart: 99, nv: 0, ig: 0, igN: 0, other: 150000 },
  rec: { label: '권장안 300만', total: 3000000, days: 30, halfStart: true, meta: 50000, dg: 10000, blog: 800000, cafe: 50000, cafeN: 3, cafeStart: 15, nv: 0, ig: 0, igN: 0, other: 350000 },
  agg: { label: '공격안 600만', total: 6000000, days: 30, halfStart: true, meta: 100000, dg: 20000, blog: 1200000, cafe: 100000, cafeN: 5, cafeStart: 15, nv: 200000, ig: 500000, igN: 5, other: 400000 },
};
for (const p of Object.values(PLANS))
  assert.equal(p.meta * p.days + p.dg * p.days + p.blog + p.cafe + p.nv + p.ig + p.other, p.total, `${p.label}: 항목 합 ≠ 합계`);

const CH = ['meta', 'dg', 'blog', 'cafe', 'nv', 'ig', 'link', 'fam'];

// ── 한 번 돌리기: 가정값(x) 하나로 한 달을 하루씩 계산 ──
function run(plan, x) {
  const f = {}; for (const c of CH) f[c] = { imp: 0, clk: 0, su: 0, ent: 0 };
  let spent = 0, cumLand = 0, learnDone = false, learnDay = null;
  let cumSu = 0, cumEnt = 0, d14 = null, day30ent = null, overDays = 0;
  const nBlog = plan.blog ? Math.floor(plan.blog / x.blog_cost) : 0;
  spent += plan.blog + plan.cafe + plan.ig + plan.other; // 정액
  for (let d = 1; d <= plan.days; d++) {
    const half = plan.halfStart && d <= 3 ? 0.5 : 1;
    const day = { su: 0, ent: 0 };
    const add = (c, imp, clk, su, ent) => { f[c].imp += imp; f[c].clk += clk; f[c].su += su; f[c].ent += ent; day.su += su; day.ent += ent; };
    // 메타: 랜딩 페이지 조회 50번을 7일 안에 못 채우면 학습 제한으로 계속 비쌈
    if (plan.meta) {
      const s = plan.meta * half; spent += s;
      const cpm = x.meta_cpm * (learnDone ? 1 : 1 + x.learn_pen);
      const imp = s / cpm * 1000, clk = imp * x.meta_ctr, land = clk * x.land, su = land * x.meta_cvr;
      add('meta', imp, clk, su, su * x.entry);
      cumLand += land;
      if (!learnDone && d <= 7 && cumLand >= 50) { learnDone = true; learnDay = d; }
    }
    if (plan.dg) { // 당근: 예산이 다 안 쓰이는 날이 있음
      const s = plan.dg * half * x.dg_burn; spent += s;
      const clk = s / x.dg_cpc, su = clk * x.land * x.dg_cvr;
      add('dg', clk / x.dg_ctr, clk, su, su * x.entry);
    }
    if (plan.nv) {
      const s = plan.nv / plan.days * half; spent += s;
      const clk = s / x.nv_cpc, su = clk * x.land * x.nv_cvr;
      add('nv', clk / x.nv_ctr, clk, su, su * x.entry);
    }
    if (plan.cafeN && d >= plan.cafeStart) {
      const clk = plan.cafeN * x.cafe_clk / 30, su = clk * x.land * x.cafe_cvr;
      add('cafe', 0, clk, su, su * x.entry);
    }
    if (plan.igN && d >= 5) { // 제작자 글은 5일째부터, 본인 참가작 1개씩은 5일째에
      const su = plan.igN * x.ig_su / (plan.days - 4);
      add('ig', 0, 0, su, su * x.entry + (d === 5 ? plan.igN : 0));
    }
    if (nBlog) { // 후기단: 1~10일에 나눠 참가(가입 1 + 참가작 1), 글이 데려오는 가입은 15일부터 (3개월 몫의 1/3)
      if (d <= 10) add('blog', 0, 0, nBlog / 10, nBlog / 10);
      if (d >= 15) { const su = nBlog * x.blog_tail / 3 / (plan.days - 14); add('blog', 0, 0, su, su * x.entry); }
    }
    // 응원 링크 (한 단계만 퍼진다고 봄 — 보수적)
    const linkVisit = day.ent * x.share * x.per_link, linkSu = linkVisit * x.link_cvr;
    add('link', 0, linkVisit, linkSu, linkSu * x.entry * x.link_entry);
    // 가족 공유: 그날 가입한 사람 중 일부가 가족을 부름 (가족은 참가하지 않는다고 봄)
    add('fam', 0, 0, day.su * x.fam_inv * x.fam_size, 0);
    if (day.ent > x.mod_cap) overDays++;
    cumSu += day.su; cumEnt += day.ent;
    if (day30ent === null && cumEnt >= 30) day30ent = d;
    if (d === 14) d14 = { su: cumSu, ent: cumEnt };
  }
  const su = cumSu, ret = su * x.r7;
  const adSpent = spent - plan.blog - plan.cafe - plan.ig - plan.other;
  const paidSu = f.meta.su + f.dg.su + f.nv.su;
  // 자체 점검
  for (const c of CH) {
    assert.ok(f[c].su <= f[c].clk + 1e-9 || f[c].clk === 0, `${c}: 가입 > 클릭`);
    assert.ok(f[c].clk <= f[c].imp + 1e-9 || f[c].imp === 0, `${c}: 클릭 > 노출`);
  }
  assert.ok(ret <= su && cumEnt <= su + plan.igN + 1e-9, '재방문·참가작이 가입보다 많음');
  assert.ok(spent <= plan.total + 1, `${plan.label}: 쓴 돈 > 예산`);
  return {
    su, ent: cumEnt, ret, spent, unspent: plan.total - spent,
    cpa: plan.total / su, cpaAd: paidSu ? adSpent / paidSu : null, cpr: plan.total / ret,
    imp: Object.values(f).reduce((a, c) => a + c.imp, 0), clk: Object.values(f).reduce((a, c) => a + c.clk, 0),
    d14su: d14 ? d14.su : null, d14ent: d14 ? d14.ent : null, day30ent, learnDay, learnLimited: plan.meta > 0 && !learnDone,
    overDays, nBlog, ch: Object.fromEntries(CH.map(c => [c, f[c].su])),
  };
}

const sample = () => Object.fromEntries(Object.entries(P).map(([k, [b, m, g]]) => [k, tri(b, m, g)]));
const mid = () => Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v[1]]));
const q = (arr, p) => { const s = arr.filter(v => v !== null && Number.isFinite(v)).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const pct3 = arr => ({ p10: q(arr, 0.1), p50: q(arr, 0.5), p90: q(arr, 0.9) });

// ── 몬테카를로: 예산안끼리 같은 가정값을 써서 비교를 공정하게 ──
const draws = Array.from({ length: N }, sample);
const result = { meta: { N, SEED, 분포: '삼각분포(나쁨·중간·좋음 = 끝·꼭짓점·끝), 가정끼리 독립', 생성: new Date().toISOString() }, 가정: P, 예산안: {} };
const KEYS = ['su', 'ent', 'ret', 'cpa', 'cpaAd', 'cpr', 'imp', 'clk', 'unspent', 'd14su', 'd14ent'];
for (const [id, plan] of Object.entries(PLANS)) {
  const runs = draws.map(x => run(plan, x));
  const out = { 이름: plan.label, 합계: plan.total };
  for (const k of KEYS) out[k] = pct3(runs.map(r => r[k]));
  out.채널별가입_중간 = Object.fromEntries(CH.map(c => [c, q(runs.map(r => r.ch[c]), 0.5)]));
  out.후기단인원_중간 = q(runs.map(r => r.nBlog), 0.5);
  out.참가작30개_도달일 = pct3(runs.map(r => r.day30ent)); // 도달 못 한 회차(null)는 빼고 셈
  out.참가작30개_못넘는확률 = runs.filter(r => r.day30ent === null).length / N;
  out.메타학습제한확률 = runs.filter(r => r.learnLimited).length / N;
  out.메타학습종료일_중간 = q(runs.map(r => r.learnDay), 0.5);
  out.검수초과일있는확률 = runs.filter(r => r.overDays > 0).length / N;
  out.목표_14일가입120 = runs.filter(r => r.d14su >= 120).length / N;
  out.목표_14일참가작60 = runs.filter(r => r.d14ent >= 60).length / N;
  out.가입1명값_16000이하 = runs.filter(r => r.cpa <= 16000).length / N;
  out.가입1명값_40000초과 = runs.filter(r => r.cpa > 40000).length / N;
  for (const k of ['참가작30개_못넘는확률', '메타학습제한확률', '검수초과일있는확률', '목표_14일가입120', '목표_14일참가작60', '가입1명값_16000이하', '가입1명값_40000초과'])
    assert.ok(out[k] >= 0 && out[k] <= 1, `${k} 확률 범위`);
  for (const k of ['su', 'ent', 'ret']) assert.ok(out[k].p10 <= out[k].p50 && out[k].p50 <= out[k].p90, `${k} 분위수 순서`);
  assert.ok(out.ent.p50 <= out.su.p50 + plan.igN && out.ret.p50 <= out.su.p50 && out.su.p50 <= out.clk.p50 + out.후기단인원_중간 * 2 + plan.igN * 20, '깔때기 순서');
  // 가정끼리 같이 나빠지는 경우(독립 가정의 한계를 보완하는 양 끝)
  for (const [name, idx] of [['모두나쁨', 0], ['모두좋음', 2]]) {
    const r = run(plan, Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v[idx]])));
    out[name] = { su: r.su, ent: r.ent, ret: r.ret, cpa: r.cpa, cpr: r.cpr };
  }
  assert.ok(out.모두나쁨.su <= out.su.p10 && out.su.p90 <= out.모두좋음.su, '양 끝이 분위수 밖에 있어야 함');
  result.예산안[id] = out;
}

// ── 민감도: 다른 가정은 중간에 두고 하나만 나쁨/좋음으로 (권장안) ──
const base = run(PLANS.rec, mid());
const tornado = Object.entries(P).map(([k, [b, , g]]) => {
  const lo = run(PLANS.rec, { ...mid(), [k]: b }), hi = run(PLANS.rec, { ...mid(), [k]: g });
  return { 가정: k, 이름: P[k][3], 나쁨_가입: lo.su, 좋음_가입: hi.su, 나쁨_재방문1명값: lo.cpr, 좋음_재방문1명값: hi.cpr, 폭_재방문1명값: Math.abs(lo.cpr - hi.cpr), 폭_가입: Math.abs(hi.su - lo.su) };
}).sort((a, b) => b.폭_재방문1명값 - a.폭_재방문1명값);
result.민감도 = { 기준_권장안_모두중간: { 가입: base.su, 참가작: base.ent, 재방문: base.ret, 가입1명값: base.cpa, 재방문1명값: base.cpr }, 순위: tornado };

// ── 합당성 판단 규칙 ──
// 가입 1명 값: 01의 업계 범위 8천~4만 원, 03 목표 1.6만(1단계)·2만(2단계)
// 재방문 1명 값 기준선 = 목표 1.6만 ÷ 앱 평균 7일 재방문 12%(01) ≈ 13.3만 원
const REF_CPR = Math.round(16000 / 0.12);
const verdictCpa = v => v < 8000 ? '쌈' : v <= 20000 ? '합당' : '비쌈';
const verdictCpr = v => v < REF_CPR / 2 ? '쌈' : v <= REF_CPR ? '합당' : '비쌈';
for (const o of Object.values(result.예산안)) o.판단 = { 가입1명값: verdictCpa(o.cpa.p50), 재방문1명값: verdictCpr(o.cpr.p50) };
result.판단기준 = { 가입1명값: '8천 미만 쌈 / 8천~2만 합당 / 2만 초과 비쌈 (01 업계 범위·03 목표)', 재방문1명값: `기준선 ${REF_CPR}원(1.6만 ÷ 12%) 이하 합당, 절반 미만 쌈, 넘으면 비쌈` };

writeFileSync(join(OUT, '결과.json'), JSON.stringify(result, null, 1));

// ── 결과.md ──
const w = v => v === null ? '—' : Math.round(v).toLocaleString('ko-KR');
const man = v => v === null ? '—' : (v / 10000).toFixed(1) + '만';
const pc = v => (v * 100).toFixed(0) + '%';
const ids = Object.keys(PLANS), R = result.예산안;
const row = (label, fn) => `| ${label} | ${ids.map(i => fn(R[i])).join(' | ')} |`;
const tri3 = (o, f = w) => `${f(o.p10)} / **${f(o.p50)}** / ${f(o.p90)}`;
const md = [
  '# 시뮬레이션 결과 (자동 생성)', '',
  `\`node simulate.mjs\` 로 만든 파일입니다. 몬테카를로 ${N.toLocaleString()}회, 시드 ${SEED}, 삼각분포. 값은 **10% / 50% / 90%** (10%는 "열 번 중 한 번은 이보다 나쁨").`, '',
  '모든 숫자는 [추정]입니다. 가정 자체가 01·03의 범위이고, 실제 단가는 집행 1주 뒤에 바꿔 넣어야 합니다.', '',
  '## 1. 한 달 결과', '',
  `| | ${ids.map(i => R[i].이름).join(' | ')} |`, `|---|${ids.map(() => '---').join('|')}|`,
  row('노출', o => tri3(o.imp)), row('클릭', o => tri3(o.clk)),
  row('가입', o => tri3(o.su)), row('참가작', o => tri3(o.ent)), row('7일 재방문 회원', o => tri3(o.ret)),
  row('가입 1명 값 (총예산 ÷ 가입)', o => tri3(o.cpa, man)),
  row('광고만 본 가입 1명 값 (메타·당근·검색)', o => tri3(o.cpaAd, man)),
  row('재방문 회원 1명 값', o => tri3(o.cpr, man)),
  row('못 쓴 돈 (첫 3일 절반 + 당근 미소진)', o => man(o.unspent.p50)),
  row('후기단 인원 (중간)', o => w(o.후기단인원_중간)),
  row('메타 학습 제한 확률', o => pc(o.메타학습제한확률)),
  row('참가작 30개(대회 3개 × 10) 도달일 (중간)', o => o.참가작30개_도달일.p50 ? o.참가작30개_도달일.p50 + '일째' : '도달 못 함'),
  row('한 달 안에 참가작 30개 못 넘을 확률', o => pc(o.참가작30개_못넘는확률)),
  row('14일째 누적 가입', o => tri3(o.d14su)), row('14일째 누적 참가작', o => tri3(o.d14ent)),
  row('모두 나쁨일 때 가입 / 가입 1명 값', o => `${w(o.모두나쁨.su)} / ${man(o.모두나쁨.cpa)}`),
  row('모두 좋음일 때 가입 / 가입 1명 값', o => `${w(o.모두좋음.su)} / ${man(o.모두좋음.cpa)}`),
  row('14일째 가입 120 달성 확률', o => pc(o.목표_14일가입120)),
  row('14일째 참가작 60 달성 확률', o => pc(o.목표_14일참가작60)),
  row('가입 1명 값 1.6만 이하 확률', o => pc(o.가입1명값_16000이하)),
  row('가입 1명 값 4만 초과 확률', o => pc(o.가입1명값_40000초과)),
  row('검수 처리량 넘는 날이 있을 확률', o => pc(o.검수초과일있는확률)),
  row('판단: 가입 1명 값', o => o.판단.가입1명값), row('판단: 재방문 1명 값', o => o.판단.재방문1명값), '',
  '## 2. 채널별 가입 (중간값)', '',
  `| 채널 | ${ids.map(i => R[i].이름).join(' | ')} |`, `|---|${ids.map(() => '---').join('|')}|`,
  ...[['meta', '메타'], ['dg', '당근'], ['blog', '블로그 후기단(본인+글)'], ['cafe', '맘카페 배너'], ['nv', '네이버 검색'], ['ig', '인스타 제작자'], ['link', '응원 링크'], ['fam', '가족 공유']]
    .map(([c, n]) => row(n, o => w(o.채널별가입_중간[c]))), '',
  '## 3. 민감도 (권장안, 다른 가정은 중간에 고정하고 하나만 나쁨↔좋음)', '',
  `모두 중간일 때: 가입 ${w(base.su)} · 참가작 ${w(base.ent)} · 재방문 ${w(base.ret)} · 가입 1명 값 ${man(base.cpa)} · 재방문 1명 값 ${man(base.cpr)}`, '',
  '| 순위 | 가정 | 가입 (나쁨 → 좋음) | 재방문 1명 값 (나쁨 → 좋음) |', '|---|---|---|---|',
  ...tornado.slice(0, 12).map((t, i) => `| ${i + 1} | ${t.이름} | ${w(t.나쁨_가입)} → ${w(t.좋음_가입)} | ${man(t.나쁨_재방문1명값)} → ${man(t.좋음_재방문1명값)} |`), '',
  '가입 수만 기준으로 줄 세우면: ' + [...tornado].sort((a, b) => b.폭_가입 - a.폭_가입).slice(0, 5).map((t, i) => `${i + 1}) ${t.이름} ±${w(t.폭_가입 / 2)}`).join(' · '), '',
  '## 4. 판단 기준', '', `- 가입 1명 값: ${result.판단기준.가입1명값}`, `- 재방문 1명 값: ${result.판단기준.재방문1명값}`, '',
  '## 5. 모델이 단순화한 것', '',
  '- 가정끼리 독립으로 뽑았습니다. 실제로는 소재가 나쁘면 클릭률과 가입률이 같이 나빠지므로 **나쁜 쪽 꼬리는 이 표보다 두껍습니다.**',
  '- 응원 링크는 한 단계만 퍼진다고 봤습니다(링크로 온 사람이 다시 링크를 보내는 것은 뺌).',
  '- 경품·추첨이 가입률을 올리는 효과는 가입률 범위 안에 들어 있다고 봤습니다(따로 더하지 않음).',
  '- 하루 숫자는 기대값으로 계산했습니다(우연한 들쭉날쭉함은 뺌).',
  '- 공격안의 네이버 검색광고·제작자는 03에서는 3단계지만, 여기서는 "표 금액을 한 달에 다 쓴다"로 계산했습니다.',
  '- 후기단은 1명 = 가입 1 + 참가작 1 (계약 조건), 1~10일에 나눠 들어온다고 봤습니다.', '',
].join('\n');
writeFileSync(join(OUT, '결과.md'), md);
console.log(md);
