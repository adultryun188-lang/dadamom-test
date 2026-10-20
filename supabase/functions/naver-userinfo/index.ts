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
  if (p.email) { out.email = String(p.email); out.email_verified = false; }   // 네이버 연락처 이메일은 확인됐다고 단정하지 않는다
  if (p.name) out.name = String(p.name);
  if (p.mobile) out.phone_number = String(p.mobile);
  return json(out, 200);
});

function json(o: unknown, status: number) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
}
