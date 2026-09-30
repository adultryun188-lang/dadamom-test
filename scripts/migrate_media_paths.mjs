#!/usr/bin/env node
/**
 * media 버킷의 기존 파일을 <사용자ID>/파일명 으로 옮긴다.
 *
 * 왜 필요한가
 *   예전 앱은 만료 10년짜리 서명 URL 을 DB 에 저장했다. 서명 URL 의 토큰은
 *   RLS 를 거치지 않으므로, 버킷을 private 으로 바꿔도 그 URL 은 계속 열린다.
 *   토큰 안에 경로가 박혀 있어서 '그 경로에 파일이 없어야' 비로소 죽는다.
 *   그래서 파일을 옮기는 것이 유일한 무효화 수단이다.
 *
 * 왜 SQL 이 아닌가
 *   Supabase 는 storage.objects 직접 조작을 트리거로 막는다.
 *     ERROR 42501: Direct deletion from storage tables is not allowed.
 *   Storage API 로만 이동할 수 있다.
 *
 * 실행
 *   export SUPABASE_URL='https://<ref>.supabase.co'
 *   export SUPABASE_SERVICE_ROLE_KEY='...'      # 저장소에 넣지 말 것
 *   node scripts/migrate_media_paths.mjs --dry-run
 *   node scripts/migrate_media_paths.mjs
 */

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry-run');

if (!URL_ || !KEY) {
  console.error('SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  process.exit(1);
}
if (!/^sb_secret_|^ey/.test(KEY)) {
  console.error('SERVICE_ROLE 키 형식이 아닌 것 같습니다. 확인해주세요.');
  process.exit(1);
}

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

async function rest(path, opts = {}) {
  const r = await fetch(URL_ + '/rest/v1/' + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(r.status + ' ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}

async function move(from, to) {
  const r = await fetch(URL_ + '/storage/v1/object/move', {
    method: 'POST', headers: H,
    body: JSON.stringify({ bucketId: 'media', sourceKey: from, destinationKey: to })
  });
  if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200));
}

const TABLES = ['community_posts', 'challenge_entries'];
let moved = 0, skipped = 0, failed = 0;

for (const table of TABLES) {
  const rows = await rest(
    `${table}?select=id,owner_id,media_path&media_path=not.is.null&media_path=neq.`
  );
  console.log(`\n[${table}] media_path 있는 행 ${rows.length}건`);

  for (const row of rows) {
    const cur = row.media_path;
    if (!cur) { skipped++; continue; }
    if (cur.includes('/')) {                      // 이미 <uid>/ 형태
      console.log(`  건너뜀 (이미 이동됨): ${cur}`);
      skipped++; continue;
    }
    if (!row.owner_id) {                          // 주인을 모르면 옮길 자리가 없다
      console.warn(`  ⚠ 소유자 없음, 수동 확인 필요: ${table}#${row.id} ${cur}`);
      failed++; continue;
    }
    const dest = `${row.owner_id}/${cur}`;
    if (DRY) {
      console.log(`  [예정] ${cur}  →  ${dest}`);
      moved++; continue;
    }
    try {
      await move(cur, dest);
      await rest(`${table}?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ media_path: dest, media_url: null })
      });
      console.log(`  이동 ${cur}  →  ${dest}`);
      moved++;
    } catch (e) {
      console.error(`  ✗ 실패 ${cur}: ${e.message}`);
      failed++;
    }
  }
}

console.log(`\n${DRY ? '[예행연습] ' : ''}이동 ${moved} · 건너뜀 ${skipped} · 실패 ${failed}`);
if (failed) {
  console.log('실패한 행은 수동 확인이 필요합니다. 옛 서명 URL 이 아직 살아 있습니다.');
  process.exit(2);
}
if (!DRY) {
  console.log('\n확인: 옛 media_url 하나를 캐시 무시로 열어 400 이 나오는지 보세요.');
  console.log("  fetch(url + '&cb=' + Date.now(), { cache: 'no-store' })");
}
