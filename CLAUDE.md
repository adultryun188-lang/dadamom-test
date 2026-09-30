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

## 5. 지금 하는 일

Security Foundation Sprint 1, 순서는 **P0-04 → P0-03 → P0-05**.
전부 테스트 환경에서 먼저 하고, 검증 후 승인받아 운영에 옮깁니다.

- **P0-04** `media` 버킷 비공개화, 10년짜리 서명 URL → 짧게,
  `getPublicUrl()` 폴백 제거, DB 에 전체 URL 대신 object_path 저장, 영상 업로드 비활성화
- **P0-03** `entry_votes` / `post_likes` 테이블 + 고유제약, `increment_*` RPC 제거
- **P0-05** `consent_records` 동의 원장, 체험단 PII 분리·마스킹·파기일

승인 대기 중인 운영 변경: `0002_tighten_anon_grants.sql` 적용, `<meta charset>` 반영.

## 6. 세션이 나뉘어 일할 때

이 저장소는 여러 Claude 세션이 같이 씁니다. 충돌을 막기 위해:

- 시작할 때 **`git pull --rebase origin staging`** 을 먼저 하세요.
- `index.html` 은 27만 자짜리 단일 파일입니다. 두 세션이 동시에 고치면 충돌이 큽니다.
  **한 번에 한 세션만** 이 파일을 고칩니다.
- Supabase 대시보드 작업(SQL 실행, Auth 설정)과 코드 수정은 **같은 세션이 하지 마세요.**
  DB 를 바꾼 세션이 그 변경에 맞는 마이그레이션 파일을 `supabase/migrations/` 에 반드시 남깁니다.
- 커밋 메시지는 한국어로, 무엇을 왜 바꿨는지 쓰세요.
