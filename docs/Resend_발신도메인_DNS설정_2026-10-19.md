# Resend 인증 메일 발신 도메인 — DNS 추가 대기

## 승인 및 현재 상태

- 사용자가 Resend 무료 플랜 사용 및 신규 가입을 완료했고, 발신 도메인 등록을 요청했다.
- Resend 계정의 Domains에서 **auth.dadamom.co.kr**을 등록했다. 발송 지역은 화면 기본값인 Tokyo(ap-northeast-1)를 유지했다.
- 도메인 ID: 8ca6fc04-4902-4121-900d-96caebfc7b48
- 현재 화면: https://resend.com/domains/add/8ca6fc04-4902-4121-900d-96caebfc7b48
- DNS 추가·인증은 아직 완료되지 않았다. 도메인 발급 화면의 I've added the records는 사용자가 DNS를 저장한 후에 진행한다.
- 발신 주소 제안: no-reply@auth.dadamom.co.kr, 발신 이름 다다맘. Supabase에 아직 입력·저장하지 않았다.
- 기존 회원 조회/수정, SQL, 고객 메일 발송, API 키 발급·입력, 운영 SMTP 활성화는 하지 않았다.

## 가비아에서 추가할 레코드 3개

가비아의 dadamom.co.kr DNS 설정에서 추가한다. 호스트에 .dadamom.co.kr을 다시 붙이지 않는다. 각 행 확인 후 최종 저장한다. TTL은 600 사용 가능하다.

| 타입 | 가비아 호스트 | 값/위치 | TTL |
|---|---|---|---|
| TXT | resend._domainkey.auth | 아래 DKIM 공개 키 원문 | 600 |
| CNAME | rsend.auth | rsend-apne1.forge.rmta.net | 600 |
| CNAME | send.auth | send.forge.rmta.net | 600 |

DKIM TXT 값(한 줄 전체, 공백이나 따옴표를 직접 덧붙이지 않는다):

```text
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBKm91D6b1soa7yDfMcSedMJLE4Z0Jb98JgVadoZveeZRIsEyFIiDxO7IKFLMWa2vNqih7AwoXbNH6N8tcEtJfY0n7ufhYdh/I2tDN7kigYKeObsAPM4nGrPMmRLNeUBBVS19EiOqqCtaFnfR5ZDxFxBfY82ZP+4En84E5DwVHfwIDAQAB
```

- 위 값은 **실제 가입 계정의 발급 화면**과 DOM의 Copy 버튼 aria-label을 대조해 얻은 값이다. 일반 예제의 MX/SPF TXT 값으로 대신하지 않는다. 이 화면의 발송 인증 레코드는 CNAME 2개다.
- DNS 확인 기준의 전체 이름: resend._domainkey.auth.dadamom.co.kr / rsend.auth.dadamom.co.kr / send.auth.dadamom.co.kr.
- 사전 공개 DNS 조회에서 세 이름 모두 NXDOMAIN이었다. 기존 레코드를 덮어쓰는 작업이 아니다.
- 기존 A 4개, www CNAME, GitHub 소유권 인증 TXT는 유지한다. 기존 MX/SPF/DMARC를 임의로 삭제·교체하지 않는다.
- DMARC(Optional)는 이번 필수 3개에 포함하지 않았다. 루트 도메인 정책의 영향 범위를 확인한 뒤 별도 검토한다.
- Enable Receiving은 꺼진 상태로 유지했다. 수신용 메일함 구축은 범위 밖이며, 네이버/Gmail 사용자가 인증 메일을 받는 것과는 별개다.
- 증거: C:/Users/eodls/Documents/ChatGPT/어플계획/다다맘_Resend_발신도메인_DNS안내_2026-10-19.jpg

## DNS 저장 후 다음 순서

1. 공개 DNS에서 이름/종류/값 일치 확인.
2. Resend에서 I've added the records를 실행하고 발신 도메인 인증 성공 및 발송 가능 상태 확인.
3. 인증 메일의 클릭/열람 추적 설정 확인. 등록 화면에서 클릭 추적은 체크된 비활성, 열람 추적은 해제된 비활성으로 표시됐다. 인증 완료 뒤 도메인 설정에서 변경 가능 여부를 확인하며, 아직 추적 설정을 변경하지 않았다. 인증 링크는 불필요한 추적/변환을 피하는 방향으로 검토한다.
4. 사용자가 필요한 최소 발송 권한의 API 키를 발급하고, SMTP 비밀번호 칸에 직접 입력·저장한다. 키 발급·새 인증 자격증명 입력은 사용자에게 넘긴다. 채팅·문서·저장소에 API 키를 보내거나 넣지 않는다.
5. 도메인 인증과 자격증명 준비 전에는 운영 custom SMTP를 켜지 않는다. 알려진 비밀값이 없는 현재 상태에서 테스트 발송도 하지 않는다.
6. 발송 서비스 자체 테스트 및 테스트 환경에서 승인된 테스트 수신 주소로만 실제 수신·메일 링크 복귀를 검증한다. 기존 운영 회원 조회·갱신·발송은 하지 않는다. 운영 가입 테스트로 새 회원을 만들지 않는다.

## 이전 단계와의 구분

- GitHub의 dadamom.co.kr 소유권 인증은 이미 완료됐지만, 이는 **Resend 발신 도메인 인증과 별개**다.
- 이 문서는 발신 도메인 등록 및 사용자 DNS 추가 안내까지의 기록이다. 일반 고객 이메일 가입이 이미 가능해졌다고 해석하지 않는다.

## 후속: 발신 도메인 인증 완료 (같은 날)

- 사용자가 가비아에서 세 레코드를 저장한 뒤 공개 DNS를 확인했다. DKIM TXT 원문, rsend.auth CNAME, send.auth CNAME이 발급 값과 모두 일치했다. CNAME 끝의 점은 정상 FQDN 표기로 정규화해 비교했다.
- Resend의 I've added the records를 실행했다. DNS verified 이벤트 이후 서비스 검증을 기다렸고, 최종 **STATUS Verified / Domain verified: Your domain is ready to send emails**를 확인했다.
- Records 탭의 DKIM 및 CNAME 두 행 모두 Verified 확인. Receiving은 꺼진 상태 유지.
- 도메인 인증 완료는 메일 발신 자격 준비를 의미하며, Supabase SMTP 연결이나 가입 메일 수신 검증 완료를 뜻하지 않는다.
- Configuration은 읽기 전용으로 확인했다. 추적 설정은 Enable tracking metrics / Configure로 표시됐으며 별도 설정하지 않았다. TLS는 기본 Opportunistic 유지. 발송 전용 도메인 외 설정은 변경하지 않았다.
- 인증 완료 증거: C:/Users/eodls/Documents/ChatGPT/어플계획/다다맘_Resend_발신도메인_인증완료_2026-10-19.jpg

### 다음 사용자 단계: API 키 직접 발급

- Resend API keys에서 기존 키를 삭제·재사용하거나 비밀값을 열지 않았다.
- 신규 키 양식만 준비했다: 이름 dadamom-auth-smtp / Permission Sending access / Domain auth.dadamom.co.kr.
- **Add 버튼은 누르지 않았다. 새 키 생성·조회·복사·저장하지 않았다.** 사용자가 직접 최종 발급하고 비밀값을 안전한 비밀번호 관리자 등에 보관한 뒤 발급 결과 창을 닫아야 한다.
- 키 원문은 채팅·스크린샷·문서·저장소에 보내지 않는다. 다음 SMTP 비밀번호 입력·저장도 사용자가 직접 진행한다.
- 양식 준비 증거(키 원문 없음): C:/Users/eodls/Documents/ChatGPT/어플계획/다다맘_Resend_API키_직접발급준비_2026-10-19.jpg
- 현재 API 키 연결·SMTP 활성화·실제 메일 발송은 미완료이며, 회원 데이터 조회/수정·운영 로그인·SQL은 하지 않았다. 기존 사용자 변경은 보존했다.

## 후속: 사용자 키 발급 보고 및 SMTP 양식 준비 (같은 날)

- 사용자가 API 키 발급·안전 보관·결과 창 닫기 완료를 보고했다. 에이전트는 키 원문을 요청·조회·복사하지 않았다.
- 사용자 요청에 따라 운영 Supabase의 Authentication > Emails > SMTP Settings에서 **저장 전 양식만 준비**했다. 서버의 기존 custom SMTP 스위치는 꺼짐으로 확인한 뒤, 입력 항목을 표시하도록 화면의 스위치를 켰다. 최종 Save changes는 누르지 않았다.
- 준비한 비밀값 아닌 항목:
  - Sender email address: no-reply@auth.dadamom.co.kr
  - Sender name: 다다맘
  - Host: smtp.resend.com
  - Port number: 465 (기본값 유지)
  - Username: resend
- Password는 비워뒀다. **사용자가 보관한 Resend API 키를 Password에 직접 입력하고 Save changes까지 직접 실행**해야 한다. 다다맘 로그인 비밀번호나 Supabase 계정 비밀번호를 넣는 칸이 아니다.
- 사용자에게 저장 성공 후 Templates 탭으로 이동해 비밀값 입력 화면을 벗어난 다음 완료를 알려달라고 안내한다. 입력된 키나 화면을 채팅으로 보내지 않는다.
- 아직 SMTP 활성화 저장·연결 성공·실제 발송·네이버 메일 수신은 확인하지 않았다. 저장 성공과 실제 메일 도착은 별도로 검증해야 한다.
- 회원 데이터 조회·수정·SQL·로그인·고객 메일 발송은 하지 않았다. 기본 URL·Redirect URLs·인증 확인 요구·발송 제한 등 다른 설정도 바꾸지 않았다.
- 비밀값 입력 전 증거: C:/Users/eodls/Documents/ChatGPT/어플계획/다다맘_Supabase_SMTP_키입력전_2026-10-19.jpg
