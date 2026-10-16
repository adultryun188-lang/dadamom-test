// 로컬 PostgreSQL(PGlite) 전용. Supabase 접속·실제 계정·비밀키를 사용하지 않는다.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
export const A = '10000000-0000-0000-0000-000000000001';
export const B = '10000000-0000-0000-0000-000000000002';
export const C = '10000000-0000-0000-0000-000000000003';
export const migration = name => fs.readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
export async function fixture(patched = true) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth, public to authenticated, anon;
    create table public.profiles(id uuid primary key references auth.users on delete cascade, nickname text);
    create table public.album_photos(id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users on delete cascade);
    create table public.consent_records(
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references auth.users on delete cascade default auth.uid(),
      kind text not null, granted boolean not null, doc_version text not null default 'v1',
      scope text, subject_id uuid, created_at timestamptz not null default now()
    );
    alter table public.consent_records enable row level security;
    create policy cr_select on public.consent_records for select to authenticated using(owner_id=auth.uid());
    create policy cr_insert on public.consent_records for insert to authenticated with check(owner_id=auth.uid());
    grant select,insert on public.consent_records to authenticated;
    insert into auth.users values ('${A}'),('${B}'),('${C}');
    insert into public.profiles values ('${A}','가족A'),('${B}','가족B'),('${C}','비구성원');
  `);
  await db.exec(await migration('0016_family_share.sql'));
  if (patched) await db.exec(await migration('0017_family_consent_withdrawal.sql'));
  async function user(uid, sql, args = []) {
    await db.exec('begin; set local role authenticated;');
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      const result = await db.query(sql, args);
      await db.exec('commit'); return result.rows;
    } catch (e) { await db.exec('rollback'); throw e; }
  }
  const consent = uid => user(uid, "insert into public.consent_records(kind,granted) values('family_share',true)");
  async function create() {
    await consent(A);
    return (await user(A, 'select public.create_family() as value'))[0].value;
  }
  async function join(uid, code) {
    await consent(uid);
    return user(uid, 'select public.join_family($1)', [code]);
  }
  const write = (uid, fid, rid, deleted = false) => user(uid,
    "insert into public.family_records(family_id,kind,rid,body,deleted) values($1,'care',$2,'{\"type\":\"feed\",\"ts\":123}', $3)", [fid,rid,deleted]);
  return { db, user, consent, create, join, write };
}
