# 로컬 QA 하네스 (실제 계정·DB 없이 전체 화면 점검)

Supabase 를 메모리 스텁(`stub.js`)으로 바꿔서, 로그인 상태별로 모든 화면과 버튼을 자동으로 눌러본다.
운영·테스트 DB 어디에도 접속하지 않는다.

## 실행
```bash
pip install playwright && python3 -m playwright install chromium   # 처음 한 번 (또는 npm i playwright)
python3 tests/qa/make_qa.py                 # index.html -> tests/qa/qa.html
cd tests/qa && python3 -m http.server 8765 &
node crawl.js        # 4가지 상태(guest/newuser/member/admin) × 11화면 × 모든 버튼
node flows.js        # 가입·온보딩·글쓰기·Q&A·댓글·육아기록 등 기능 흐름 PASS/FAIL
```

## 잡는 것
- JS 런타임 오류(pageerror), console.error
- 화면에 `undefined` / `NaN` / `Invalid Date` 노출
- 390px 에서 가로 넘침, 중복 id, 깨진 이미지
- 스크린샷: `shots/`

## 못 잡는 것 (배포본에서 직접 확인)
- 실제 RLS·RPC 권한, 서명 URL, 이메일 발송, 소셜 로그인
- 화면 값과 DB 값 일치 여부 (CLAUDE.md 8절)

## 시드 계정 (스텁 안)
- `2222…` 하람이(육아 15개월·인천) — 일반 회원
- `1111…` 운영자 (`__SBSTUB.admin = true`)
- `4444…` 프로필 없는 신규 가입자
