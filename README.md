# 다다맘 TEST

다다맘의 **테스트 전용 앱**입니다. 운영 앱·운영 데이터와 완전히 분리돼 있습니다.

|  | 운영 | 테스트 (이 저장소) |
|---|---|---|
| 앱 주소 | https://adultryun188-lang.github.io/dadamom-app/ | https://adultryun188-lang.github.io/dadamom-test/ |
| 저장소 | `adultryun188-lang/dadamom-app` (`main`) | `adultryun188-lang/dadamom-test` (`staging`) |
| Supabase | `hjqchbpxwviengdzvado` | `srxdtddrtnhtlbbviyvs` |
| 앱 이름 | 다다맘 | 다다맘 TEST |
| 화면 표시 | 없음 | 상단에 빨간 **TEST** 띠 |

> **이 저장소에서 운영 앱이나 운영 DB를 건드리지 않습니다.**
> 검증이 끝난 변경만 `docs/PROMOTION.md` 절차로, 승인을 받은 뒤 운영에 옮깁니다.

---

## 로컬에서 실행하기

```bash
git clone https://github.com/adultryun188-lang/dadamom-test.git
cd dadamom-test
git checkout staging

./scripts/build.sh dev     # env.js 생성 (개발 환경)
./scripts/serve.sh         # http://localhost:8000
```

브라우저에서 `http://localhost:8000` 을 엽니다.
서비스워커는 `localhost` 또는 `https` 에서만 동작하므로 파일을 직접 열지(`file://`) 마세요.

포트를 바꾸려면 `./scripts/serve.sh 8080` 처럼 넘깁니다.

## 휴대폰에 설치하기 (PWA)

1. 휴대폰 브라우저로 https://adultryun188-lang.github.io/dadamom-test/ 접속
2. **Android Chrome** — 주소창 오른쪽 메뉴(⋮) → `앱 설치` 또는 `홈 화면에 추가`
3. **iPhone Safari** — 아래 공유 버튼 → `홈 화면에 추가`
   (iOS 는 Safari 에서만 설치됩니다. Chrome 앱에서는 안 됩니다.)
4. 홈 화면에 **다다맘 TEST** 아이콘이 생깁니다. 운영 앱과 아이콘·이름이 다릅니다.

설치한 앱을 지우려면 아이콘을 길게 눌러 삭제하면 됩니다.

## 환경 분리

| 환경 | 설정 파일 | Supabase | TEST 띠 |
|---|---|---|---|
| development | `config/env.development.js` | 테스트 프로젝트 | 표시 |
| staging | `config/env.staging.js` | 테스트 프로젝트 | 표시 |
| production | `config/env.production.example.js` (값 없음) | — | 숨김 |

`scripts/build.sh` 가 고른 설정을 `env.js` 로 복사합니다. **`env.js` 는 커밋하지 않습니다**(`.gitignore`).

### 키에 대해

- `SUPABASE_ANON_KEY` 는 **브라우저에 노출되는 것을 전제로 설계된 공개 키**입니다. RLS 정책이 실제 보호막입니다.
- `service_role` / `secret` 키는 **이 저장소 어디에도 넣지 않습니다.** 필요할 때 Supabase 대시보드에서만 사용합니다.
- 운영 키는 이 저장소에 없습니다.

## DB 마이그레이션

`supabase/migrations/` 에 번호순으로 들어 있습니다. Supabase SQL Editor 에 붙여넣어 순서대로 실행합니다.

| 파일 | 내용 |
|---|---|
| `0001_baseline_20260929.sql` | 2026-09-29 운영 스키마 스냅샷. 테스트 DB 최초 1회만 실행 |

각 마이그레이션은 `begin; … commit;` 으로 감싸여 있어, 중간에 실패하면 아무것도 적용되지 않습니다.
적용 전에는 `begin; … rollback;` 으로 바꿔 리허설하는 것을 권합니다.

## 테스트 데이터

`supabase/seed/` 의 SQL 을 SQL Editor 에서 실행하면 테스트 계정과 가상 게시물이 만들어집니다.
**운영 데이터는 절대 복사하지 않습니다.** 전부 지어낸 값입니다.

## 폴더 구조

```
index.html                  앱 본체 (운영본에서 3군데만 수정)
env.js                      빌드로 생성, 커밋 안 함
config/                     환경별 설정
manifest.webmanifest        PWA 설치 정보
sw.js                       서비스워커
offline.html                오프라인 화면
icons/                      앱 아이콘 (TEST 표시 포함)
supabase/migrations/        DB 스키마·RLS·함수
supabase/seed/              테스트 데이터
scripts/                    빌드·실행
tests/                      권한 테스트, E2E
docs/RUNBOOK.md             배포와 롤백
docs/PROMOTION.md           테스트 → 운영 이관 절차
```
