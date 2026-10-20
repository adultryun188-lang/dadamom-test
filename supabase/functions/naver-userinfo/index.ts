// 네이버 프로필 응답을 Supabase(OAuth userinfo)가 읽는 평평한 모양으로 바꿔 준다. 테스트 프로젝트에 배포 (2026-10-20).
// 네이버 /v1/nid/me 는 {resultcode, message, response:{id, email, mobile, ...}} 처럼 한 단계 안쪽에 담아 준다.
// Supabase 인증 서버가 사용자의 네이버 access token 을 Authorization 헤더로 보내면, 그 토큰으로 네이버에 묻고 결과만 돌려준다.
// 비밀값을 갖고 있지 않고, 아무것도 저장하지 않는다. 토큰·응답 원문을 로그에 남기지 않는다. verify_jwt = false (네이버 토큰을 받으므로).
Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/.test(auth)) return json({ error: 'missing_token' }, 401);
  let r: Response;
  try {
    r = await fetch('https://openapi.naver.com/v1/nid/me', { headers: { Authorization: auth } });
  } catch (_e) {
    return json({ error: 'naver_unreachable' }, 502);
  }
  if (!r.ok) return json({ error: 'naver_' + r.status }, r.status === 401 ? 401 : 502);
  const body = await r.json().catch(() => null);
  const p = body && body.resultcode === '00' && body.response;
  if (!p || !p.id) return json({ error: 'naver_bad_response' }, 502);
  const out: Record<string, unknown> = { sub: String(p.id) };
  if (p.email) {
    out.email = String(p.email);
    // @naver.com 은 그 네이버 계정 자체의 메일이라 본인 것이 확실하다. 다른 주소(연락처 이메일)는 확인됐다고 단정하지 않는다 —
    // 확인됨으로 넘기면 같은 이메일의 기존 계정에 자동 연결되므로, 남의 주소를 적어 둔 사람이 그 계정을 가로챌 수 있다.
    out.email_verified = /@naver\.com$/i.test(out.email as string);
  }
  if (p.name) out.name = String(p.name);
  // Supabase 는 휴대전화를 `phone` 키로만 읽는다 (`phone_number` 는 버려짐). 확인됨(phone_verified)은 주지 않는다 — 로그인 전화번호로 쓰지 않고 정보로만 둔다.
  if (p.mobile) out.phone = String(p.mobile);
  return json(out, 200);
});

function json(o: unknown, status: number) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
}
