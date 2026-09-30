# 다다맘 TEST — 작업 규칙

이 파일은 이 저장소에서 작업하는 모든 Claude 세션이 자동으로 읽습니다.
**작업을 시작하기 전에 이 파일과 `README.md`, `docs/RUNBOOK.md`, `docs/PROMOTION.md` 를 먼저 읽으세요.**

---

## 0. 절대 규칙 — 어길 수 없는 것

1. **운영 앱(`adultryun188-lang/dadamom-app`)과 운영 Supabase(`hjqchbpxwviengdzvado`)는 직접 수정하거나 배포하지 않는다.**
   승인 없이 운영에 나가는 변경은 없습니다. 예외 없습니다.
2. **운영 데이터와 실제 사용자 정보는 쓰지 않는다.** 테스트 데이터만 씁니다.
3. **운영 키·비밀키를 코드나 저장소에 넣지 않는다.**
   `service_role` 키, `sb_secret_*`, 운영 프로젝트 ref 가 들어가면 배포 워크플로가 빌드를 실패시킵니다.
4. 작업 브랜치는 **`staging`** 입니다. `main` 에 직접 커밋하지 않습니다.
5. 운영 이관은 **`docs/PROMOTION.md` 절차 + 사용자 승인** 을 거칩니다.

## 1. 환경

| | 운영 (건드리지 않음) | 테스트 (이 저장소) |
|---|---|---|
| 앱 | https://adultryun188-lang.github.io/dadamom-app/ | https://adultryun188-lang.github.io/dadamom-test/ |
| 저장소 | `dadamom-app` (`main`) | `dadamom-test` (`staging`) |
| Supabase ref | `hjqchbpxwviengdzvado` | `srxdtddrtnhtlbbviyvs` |
| 소셜 로그인 | 카카오·구글 연결됨 | **없음** (`ENV.SOCIAL_LOGIN=false`) |

운영 `index.html` 기준선: 커밋 `9cd1644`,
SHA-256 `14655ed7262aefa03533cd1a8e3dbb28f6210ab582a4e354f9300e8486e7427d`.
테스트본은 이 기준선에서 **4군데만** 다릅니다 — ①`env.js` 참조 ②TEST 배너 ③PWA + `<meta charset>` ④`SOCIAL_LOGIN` 분기.
이 4가지 외의 차이가 생기면 운영 이관이 어려워집니다. 되도록 늘리지 마세요.

## 2. 테스트 계정

비밀번호 전부 `dadamom-test-1234` — 테스트 전용입니다.

- `admin@dadamom.test` — 운영자
- `momA@dadamom.test` — 육아 15개월·인천
- `momB@dadamom.test` — 임신 28주·서울
- `dadC@dadamom.test` — 육아 7개월·경기 (차단·신고 상대역)

## 3. 개발·배포

```bash
./scripts/build.sh dev      # env.js 생성 (개발)
./scripts/serve.sh          # http://localhost:8000
./scripts/verify_schema.sh  # 테스트 DB 스키마가 운영과 같은지
node tests/e2e.spec.js      # 320/360/390/430px + 안드로이드/아이폰
```

`env.js` 는 빌드 생성물이라 `.gitignore` 에 있습니다. 커밋하지 마세요.
`staging` 에 push 하면 GitHub Actions 가 `config/env.staging.js` 로 `env.js` 를 만들고
키 검사를 통과한 뒤 GitHub Pages 에 배포합니다.

## 4. 이미 밟은 지뢰 — 다시 밟지 마세요

- **`auth.users` 를 SQL 로 직접 만들 때** 토큰 컬럼 8개(`confirmation_token`, `recovery_token`,
  `email_change_token_new`, `email_change_token_current`, `email_change`, `phone_change`,
  `phone_change_token`, `reauthentication_token`)를 **NULL 로 두면 로그인이 500 으로 실패**합니다.
  인증 서버가 문자열로 읽기 때문입니다. 반드시 빈 문자열 `''` 로 넣으세요.
- **RLS 정책 안에서 다른 테이블을 직접 참조하면** 호출 역할에 그 테이블 SELECT 권한이 필요합니다.
  anon 에게 `permission denied` 가 나서 비로그인 열람이 깨집니다.
  `security definer` 함수(`is_blocked()` 처럼)로 감싸세요.
- **`INSERT ... RETURNING`** 은 새 행이 SELECT 정책을 통과해야 합니다.
  `status='pending'` 기본값 + "승인글만 보임" 정책이면 42501 이 납니다.
  `.select()` 를 빼고 uuid 를 클라이언트에서 만드세요.
- **파괴적 SQL 은 `begin; ... rollback;`** 으로 먼저 리허설하세요.
- `index.html` 에 `<meta charset="utf-8">` 이 없으면 GitHub Pages 밖에서는 한글이 전부 깨집니다.
- **서명 URL 은 버킷을 private 으로 바꿔도 죽지 않습니다.** 토큰이 RLS 를 거치지 않기 때문입니다.
  토큰 안에 경로가 박혀 있어서 **파일을 옮기거나 지워야만** 무효화됩니다.
  확인할 때는 반드시 캐시를 무시하세요 — CDN 이 캐싱해서 잠시 200 이 나옵니다.
- **`storage.objects` 를 SQL 로 직접 지울 수 없습니다.** Supabase 트리거가 막습니다
  (`42501 Direct deletion from storage tables is not allowed`). security definer 함수 안에서도 막힙니다.
  파일 삭제는 클라이언트가 Storage API 로 해야 합니다.
- RLS 정책을 좁힐 때 **검수자(`is_admin()`)를 빼먹지 마세요.** 대기 중인 글의 사진을
  못 보면 승인/반려를 판단할 수 없습니다.
- **함수 권한을 `from anon` 으로만 회수하면 막히지 않습니다.** PostgreSQL 은 함수
  EXECUTE 를 기본으로 `PUBLIC` 에 주고, `anon` 은 그 PUBLIC 권한을 상속합니다.
  `revoke execute on function f() from public, anon;` 처럼 **`public` 을 같이** 써야 합니다.
  0002 가 이 실수를 해서, 적용된 뒤에도 비로그인이 `increment_votes` 를 호출해
  숫자를 바꿀 수 있었습니다 (2026-09-30 실측: votes 11 → 18). 0005 에서 drop 으로 정리했습니다.
- **PostgREST 의 PATCH/DELETE 는 RLS 가 0행으로 막아도 HTTP 204 를 줍니다.**
  응답 코드만 보고 "성공했다/막혔다"를 판단하면 안 됩니다. 값을 다시 읽어 확인하세요.
- **RPC 파라미터 이름이 틀리면 조용히 실패합니다.** `sb.rpc('increment_likes', {p_id:...})`
  는 함수가 `post_id` 를 받으므로 404 (PGRST202) 였고, 코드가 `.catch(function(){})` 로
  삼켜서 아무 표시가 없었습니다. 좋아요·응원이 서버에 저장된 적이 없었습니다.
  RPC 를 쓰면 실패를 반드시 눈에 보이게 하세요.
- **살아있는 증감 함수를 테스트에서 호출할 때 `delta` 를 0 으로 두세요.**
  "함수가 제거됐는지" 확인하려고 `delta=1` 로 부르면, 아직 남아있는 환경에서는
  실제로 숫자가 올라가 테스트가 DB 를 더럽힙니다.

## 5. 지금 하는 일

Security Foundation Sprint 1, 순서는 **P0-04 → P0-03 → P0-05**.
전부 테스트 환경에서 먼저 하고, 검증 후 승인받아 운영에 옮깁니다.

- ~~**P0-04**~~ **완료 (테스트 환경)** — `media` 비공개, 서명 URL 10분, 공개 URL 폴백 제거,
  `media_path` 저장, 업로드는 `<uid>/` 폴더로만, 이미지 전용(25MB).
  운영 이관은 `docs/PROMOTION.md` 의 특별 절차 + `scripts/migrate_media_paths.mjs` 필수.
- **P0-03** 진행 중 — `0005_reactions.sql` 과 `index.html` 수정은 작성 완료.
  **테스트 DB 에 아직 적용하지 않았습니다.** 다음 순서로 진행합니다.
  1. `tests/0005_rehearsal.sql` 리허설 (SQL Editor, begin…rollback)
  2. `supabase/migrations/0005_reactions.sql` 적용
  3. `node tests/reactions.spec.mjs` 로 중복·타인·비로그인 차단 검증
  4. `staging` push → 배포된 주소로 `BASE_URL=... STUB=0 node tests/e2e.spec.js`
  DB 가 먼저입니다. 코드만 배포하면 반응 버튼이 실패합니다.
- **P0-05** `consent_records` 동의 원장, 체험단 PII 분리·마스킹·파기일

승인 대기 중인 운영 변경: `0002_tighten_anon_grants.sql` 적용, `<meta charset>` 반영.
단 **0002 만 적용해도 숫자 조작은 막히지 않습니다** — 4번 지뢰 목록의 PUBLIC 권한 항목과
`docs/PROMOTION.md` 의 P0-03 절을 보세요. 0005 를 같이 적용해야 닫힙니다.

## 6. 세션이 나뉘어 일할 때

이 저장소는 여러 Claude 세션이 같이 씁니다. 충돌을 막기 위해:

- 시작할 때 **`git pull --rebase origin staging`** 을 먼저 하세요.
- `index.html` 은 27만 자짜리 단일 파일입니다. 두 세션이 동시에 고치면 충돌이 큽니다.
  **한 번에 한 세션만** 이 파일을 고칩니다.
- Supabase 대시보드 작업(SQL 실행, Auth 설정)과 코드 수정은 **같은 세션이 하지 마세요.**
  DB 를 바꾼 세션이 그 변경에 맞는 마이그레이션 파일을 `supabase/migrations/` 에 반드시 남깁니다.
- 커밋 메시지는 한국어로, 무엇을 왜 바꿨는지 쓰세요.

## 7. 멈추지 말 것 — 테스트 환경에서는 그냥 하세요

2026-09-30 에 P0-03 한 건이 4시간 넘게 걸렸습니다. **실제 작업은 30분**이었고,
나머지는 전부 "물어보고 기다리는" 시간이었습니다. 다음은 **묻지 말고 그냥 하세요.**

- 테스트 프로젝트(`srxdtddrtnhtlbbviyvs`)의 스키마·정책·시드 변경
- `staging` 브랜치 커밋과 push
- 테스트 계정으로 하는 모든 조작 (글 등록, 좋아요, 업로드, 삭제)
- 리허설 SQL 실행, 검증 스크립트 실행
- 마이그레이션 파일·테스트·문서 추가
- 사소한 정리 (임시 파일 삭제, 의존성 커밋 여부 같은 판단)

**물어봐야 하는 것은 이 셋뿐입니다.**
1. 운영(`dadamom-app` / `hjqchbpxwviengdzvado`)에 닿는 모든 것
2. 되돌릴 수 없고 판단이 갈리는 것 (실데이터 삭제 등)
3. 사용자에게 보이는 기능·문구가 달라지는 제품 결정

애매하면 **가장 합리적인 해석으로 진행하고, 무엇을 가정했는지 결과에 한 줄로 적으세요.**
막히면 멈추지 말고 **막힌 것만 남겨두고 나머지를 끝낸 뒤** 한꺼번에 보고하세요.

## 8. UI 를 건드렸으면 배포본에서 직접 눌러보세요

`tests/e2e.spec.js` 는 Supabase 스텁으로 돕니다. **33개가 전부 통과해도 못 잡는 버그가 있습니다.**

실제 사례 (2026-09-30):
좋아요 버튼 핸들러가 `renderCommunity()` 만 부르고 `renderHome()` 을 안 불렀습니다.
좋아요 버튼은 커뮤니티와 홈 피드 **양쪽에** 있습니다. 홈에서 누르면
DB 에는 저장되는데 화면 숫자와 `aria-pressed` 가 그대로였습니다.
사용자 눈에는 "눌러도 안 먹는 버튼"입니다. 자동 테스트는 전부 통과했습니다.

그래서 UI 를 고쳤으면 마지막에 반드시:

1. `staging` push 후 배포본(`https://adultryun188-lang.github.io/dadamom-test/`)을 연다
2. 서비스워커·캐시를 지우고 새 빌드가 왔는지 확인한다
3. **고친 버튼을 실제로 누른다.** 화면 값과 DB 값을 둘 다 읽어 일치하는지 본다
4. 같은 버튼이 여러 화면에 있으면 **화면마다** 눌러본다

```js
// 배포본 콘솔에서 — 화면과 DB 를 같이 확인
const el = document.querySelector('[data-postlike]');
el.click(); await new Promise(s=>setTimeout(s,3000));
// 화면: el.innerText, el.getAttribute('aria-pressed')
// DB  : GET /rest/v1/community_posts?select=likes&id=eq.<id>
```

## 9. 푸시가 막히면

이 컴퓨터에는 GitHub 자격증명이 저장돼 있지 않을 수 있습니다.
비대화형 세션은 로그인 창을 띄울 수 없어 `git push` 가 실패합니다.

- 한 번만 대화형 터미널에서 `git push origin staging` 을 돌리면 이후로는 저장됩니다.
- 그전까지는 **커밋까지 끝내고** "push 만 남았다"고 알리세요. 다른 세션이 대신 올릴 수 있습니다.
- push 가 막혔다고 나머지 작업을 멈추지는 마세요.
