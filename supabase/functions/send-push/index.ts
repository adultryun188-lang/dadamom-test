// send-push — push_queue 의 안 보낸 알림을 Firebase(FCM v1)로 보낸다.
// pg_cron(push_kick) 이 2분마다 부른다. 여러 번 불려도 안전하다(보낸 줄은 sent_at 으로 표시).
// 비밀값 FCM_SERVICE_ACCOUNT : Firebase 서비스 계정 JSON 통째로 (Supabase Edge Function Secrets 에 사장님이 넣음).
// 밤 9시~아침 8시(한국)에는 보내지 않고 쌓아 둔다.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function b64url(buf: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof buf === "string" ? new TextEncoder().encode(buf) : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + claim + "." + b64url(sig) }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  return j.access_token;
}

type Row = { id: number; user_id: string; kind: string; title: string; body: string; link: string };
type Tok = { token: string; user_id: string; platform: string; prefs: Record<string, boolean> };

function message(t: Tok, r: Row) {
  const data = { title: r.title, body: r.body, link: r.link, kind: r.kind };
  // 웹은 data 만 보내고 sw.js 가 직접 띄운다(두 번 뜨지 않게). 앱은 notification 이 있어야 꺼져 있을 때도 뜬다.
  if (t.platform === "web") return { token: t.token, data };
  return { token: t.token, notification: { title: r.title, body: r.body }, data, android: { priority: "HIGH" } };
}

Deno.serve(async () => {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!raw) return new Response(JSON.stringify({ skipped: "FCM_SERVICE_ACCOUNT 없음" }), { status: 503 });
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  if (kstHour < 8 || kstHour >= 21) return new Response(JSON.stringify({ skipped: "밤 시간" }));

  const sa = JSON.parse(raw);
  const { data: rows, error } = await sb.from("push_queue").select("id,user_id,kind,title,body,link")
    .is("sent_at", null).order("id").limit(200);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!rows?.length) return new Response(JSON.stringify({ sent: 0 }));

  const users = [...new Set(rows.map((r) => r.user_id))];
  const { data: toks } = await sb.from("push_tokens").select("token,user_id,platform,prefs").in("user_id", users);
  const at = await accessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  let sent = 0, failed = 0;
  const dead: string[] = [];

  for (const r of rows as Row[]) {
    for (const t of (toks ?? []) as Tok[]) {
      if (t.user_id !== r.user_id || t.prefs?.[r.kind] === false) continue;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer " + at, "Content-Type": "application/json" },
        body: JSON.stringify({ message: message(t, r) }),
      });
      if (res.ok) { sent++; continue; }
      failed++;
      const txt = await res.text();
      // 앱을 지웠거나 알림을 끈 기기 — 다시 보내지 않게 지운다
      if (res.status === 404 || /UNREGISTERED|registration-token-not-registered|not a valid FCM registration token/.test(txt)) dead.push(t.token);
      else console.warn("fcm", res.status, txt.slice(0, 300));
    }
  }
  await sb.from("push_queue").update({ sent_at: new Date().toISOString() }).in("id", rows.map((r) => r.id));
  if (dead.length) await sb.from("push_tokens").delete().in("token", dead);
  return new Response(JSON.stringify({ rows: rows.length, sent, failed, removed: dead.length }));
});
