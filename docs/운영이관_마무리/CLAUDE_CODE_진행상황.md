# 마무리 실행서 진행 상황 — 2026-10-06 (Claude Code)

## 결론 먼저

| 항목 | 상태 |
|---|---|
운영 SQL (`0012` + 단계 C) | ❌ **미실행** — 쓰기 SQL 이 세션 안전장치에 차단됨. 붙여넣기용으로 전달 |
코드 (마무리 = 회원가입 2단계 + [C]) | ❌ **미완** — `docs/운영이관_회원가입/지시서.md` 가 **없음** |
출시점검 코드 | ❌ 미착수 (마무리가 선행 조건) |
`테스트기록_정리.sql` | ❌ 미실행 — 삭제 SQL 이라 차단. 붙여넣기용으로 전달 |
운영 상태 읽기 | ✅ 완료 (아래) |
**P0-04 storage 정책** | ✅ **확인 완료 — 정상** |

## ✅ P0-04 storage 정책 — 깨끗합니다

`execute_sql` 읽기가 열려서 직접 확인했습니다. `storage.objects` 정책은 **정확히 6개**:

| 동작 | 정책 | 범위 |
|---|---|---|
SELECT | `media read published or own` | `bucket_id='media'` + `media_can_read()` 또는 내 폴더 |
SELECT | `album own read` | `bucket_id='album'` + 내 폴더 (authenticated) |
INSERT | `media own upload` / `album own insert` | 각 버킷 + 내 폴더 |
DELETE | `media own delete` / `album own delete` | 각 버킷 + 내 폴더 |

**넓은 SELECT 정책이 없습니다.** `using (true)` 없음, `bucket_id` 조건 없는 정책 없음,
`media public read` 삭제됨. `storage.objects` RLS = **true**.

→ 다른 세션이 본 Storage 화면 경고는 `0003` 적용 **전** 상태였던 것으로 보입니다.
  **P0-04 의 읽기 차단은 제대로 서 있습니다.**

## 운영 현재 상태 (실측, 2026-10-06)

```
storage.objects RLS      : true
media 버킷 public        : false
media 허용형식           : {image/jpeg,image/png,image/webp}
media 파일 수            : 1      ← 예전 보고(10개)보다 줄었음
  그중 루트(평면경로)    : 1      ← P0-04 4단계(파일이동) 아직 안 됨
체험단 신청              : 1
benefit_applications_pii : 1
consent_records          : 2
남은 개인정보 컬럼       : 2      ← 단계 C 아직 안 됨
가입동의종류(signup_*)   : false  ← 0012 아직 안 됨
```

## 코드 — 어디까지 됐고 왜 막혔나

실행서 2-1 절이 가리키는 `docs/운영이관_회원가입/지시서.md` 가 **저장소·디스크 어디에도
없습니다.** 그 문서에 P1·P2 패치의 출처와 손작업 **[A]·[B]** 의 정확한 치환이 있습니다.

### 제가 역추적해서 찾아낸 것 (출처 확정됨)

실행서가 적은 훅 개수로 범위를 특정했습니다:

| | 범위 | 훅 | 적용 결과 |
|---|---|---|---|
P1 | `cf43755..4c4c033` | **10** (실행서와 일치) | **9 적용 / 1 거부**(#4) — 실행서와 일치 |
P2 | `6805fc1` | **2** (실행서와 일치) | **1 적용 / 1 거부**(#1) — 실행서와 일치 |

패치 두 개를 이 폴더에 보관했습니다:
`P1_cf43755..4c4c033.patch` · `P2_6805fc1.patch`

### [B] 는 운영에서 **할 일이 없습니다**

거부된 P2 훅은 테스트 전용 `socialOff`(SOCIAL_LOGIN=false) 분기의 magiclink 이메일 칸에
`value=` 를 넣는 것입니다. **운영에는 그 분기가 없고**, 운영의 해당 지점은 P2 훅 #2 가
이미 깔끔하게 처리했습니다.

### [A] 는 내용을 확보했습니다 — 넣는 방법 한 군데가 불명확합니다

거부된 P1 훅 #4 에서 추출한 **195~196줄 블록**을 `A_블록_운영용.txt` 로 보관했습니다.
`signupStepBar · signupHtml · pwRulesHtml · updateSignupStep1Ui · signupStep1Html ·
signupStep2Html · signupDoneHtml · PENDING_CONSENT_KEY · stashSignupConsents ·
flushPendingConsents · handleSignupNext · handleSignupBack · handleSignupSubmit` 전부 포함.

**지금 P1+P2 만 적용한 중간 파일은 함수 5개가 정의 없이 참조만 됩니다**
(`flushPendingConsents` `updateSignupStep1Ui` `handleSignupNext` `handleSignupBack`
`handleSignupSubmit`) — 문법은 통과하지만 런타임에서 터집니다. [A] 가 이걸 채웁니다.

[A] 를 넣을 때 필요한 세 가지 중 둘은 명확합니다:
1. `refreshAuthForms` 의 `restoreAuthDraft();` → `syncAuthButtons();` ✔ 명확
2. 블록을 `async function handleKakaoSignIn(){` **바로 위**에 삽입 ✔ 명확
3. ❓ **`authBodyHtml` 의 로그인/회원가입 `return` 을 어떻게 다시 쓰는가**

3번이 문제입니다. 테스트본은 별도 함수 `authPasswordFormHtml()` 안에서
`var tabs = …; if(authMode === 'signup') return tabs + signupHtml(); return tabs + …`
형태로 바꿉니다. 그런데 **운영본에는 `authPasswordFormHtml` 이 없습니다** — 사용성 묶음의
[B] 리팩터로 `authBodyHtml()` 안에 인라인됐고 앞에 `head + social +` 이 붙습니다.

따라서 운영판은 `head + social + tabs + signupHtml()` 같은 형태가 되어야 하는데,
**클라우드 세션이 정확히 어떻게 썼는지가 회원가입 지시서에 있고 그게 없습니다.**
추측으로 쓰면 중간 해시 `6f24da32…` 가 맞지 않고, 틀린 자리를 찾을 방법도 없습니다.
실행서 자체가 "안 맞으면 멈추고 보고" 라고 지시합니다. 그래서 멈췄습니다.

운영에는 아무것도 올리지 않았습니다. `main` 은 `93ef120` 그대로입니다.

### 필요한 것 — 둘 중 하나

1. `docs/운영이관_회원가입/지시서.md` 를 저장소에 push (가장 확실)
2. 또는 [A] 의 3번, 즉 운영판 `authBodyHtml` 의 `return` 최종 형태를 그대로 적어주기

그러면 중간 해시 `6f24da32…` → `[C]` → `53a75433…` 까지 제가 끝내고 배포하겠습니다.

## 출시점검도 해시 오라클이 없습니다

`docs/운영이관_출시점검/지시서.md` 는 테스트 해시(`9450c8e7`)만 주고 **운영 결과 해시를
주지 않습니다.** 손으로 맞출 hunk 도 하나 있습니다(`communityEmptyHtml` 의 `msg` 에
`state.communityTab === 'qna'` 한 줄). 마무리 단계가 끝난 뒤 운영 목표 해시를 받아야
같은 방식으로 검증할 수 있습니다.
