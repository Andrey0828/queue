import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { POST } from "../app/api/actions/route";
import { signSession } from "../lib/session";
import { requestIpKey } from "../lib/anti-spam";

let db: PGlite;
const originalFetch = globalThis.fetch;
const member = randomUUID();
const queue = randomUUID();
const memberCookie = () => "pq_member=" + signSession(member, "member", 3600);
const adminCookie = () => "pq_admin=" + signSession(randomUUID(), "admin", 3600);
async function post(payload: unknown, cookie = "", ip = "192.0.2.1") {
  return POST(new NextRequest("https://queue-test.invalid/api/actions", {
    method: "POST", headers: { Origin: "https://queue-test.invalid", "Content-Type": "application/json", Cookie: cookie, "x-vercel-forwarded-for": ip },
    body: JSON.stringify(payload),
  }));
}
before(async () => {
  process.env.SUPABASE_URL = "https://queue-test.invalid";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";
  process.env.SESSION_SECRET = "test-session-secret-".repeat(3);
  process.env.ADMIN_PASSPHRASE = "test-only-admin";
  process.env.VERCEL = "1";
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  const signatures: Record<string, string[]> = {
    queue_command: ["p_action", "p_actor", "p_admin", "p_payload"],
    take_rate_limit: ["p_key", "p_limit", "p_seconds"],
  };
  globalThis.fetch = async (input, init) => {
    const name = String(input).split("/").at(-1)!;
    assert.ok(String(input).startsWith("https://queue-test.invalid/rest/v1/rpc/"));
    assert.ok(signatures[name]);
    const body = JSON.parse(String(init?.body));
    const keys = signatures[name];
    try {
      const result = await db.query<{ result: unknown }>(
        `select public.${name}(${keys.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
        keys.map(k => body[k] && typeof body[k] === "object" ? JSON.stringify(body[k]) : body[k]),
      );
      return Response.json(result.rows[0].result);
    } catch (error) { return Response.json({ message: (error as Error).message }, { status: 400 }); }
  };
});
beforeEach(async () => {
  await db.exec("truncate public.members, public.queues, public.entries, public.audit_log, public.rate_limits restart identity cascade;");
  await db.query("insert into public.members(id,name) values($1,'Тест Участник')", [member]);
  await db.query("insert into public.queues(id,title,starts_at) values($1,'Тестовая пара',now())", [queue]);
});
after(async () => { globalThis.fetch = originalFetch; await db.close(); });

test("parallel join/leave requests share a persistent burst budget and recover after expiry", async () => {
  const responses = await Promise.all(Array.from({length: 12}, (_, i) =>
    post({action: i % 2 ? "leave" : "join", queueId: queue}, memberCookie())));
  assert.equal(responses.filter(r => r.status === 200).length, 2);
  assert.equal(responses.filter(r => r.status === 429).length, 10);
  const rejected = responses.find(r => r.status === 429)!;
  assert.equal(rejected.headers.get("Retry-After"), "5");
  assert.equal((await rejected.json()).retryAfter, 5);
  await db.exec("update public.rate_limits set expires_at=now()-interval '1 second' where key like 'participant:burst:%'");
  assert.equal((await post({action: "join", queueId: queue}, memberCookie())).status, 200);
});

test("alternating join/leave cannot bypass the per-minute budget", async () => {
  for (let i = 0; i < 10; i++) {
    await db.exec("update public.rate_limits set expires_at=now()-interval '1 second' where key like 'participant:burst:%'");
    assert.equal((await post({action: i % 2 ? "leave" : "join", queueId: queue}, memberCookie())).status, 200);
  }
  await db.exec("update public.rate_limits set expires_at=now()-interval '1 second' where key like 'participant:burst:%'");
  const response = await post({action: "join", queueId: queue}, memberCookie());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
});

test("classmates sharing Wi-Fi each retain their own participant budget", async () => {
  for (let i = 0; i < 30; i++) {
    const id = randomUUID();
    await db.query("insert into public.members(id,name) values($1,$2)", [id, "Участник " + String.fromCharCode(1040+i)]);
    assert.equal((await post({action:"join",queueId:queue}, "pq_member="+signSession(id,"member",3600))).status,200);
  }
});

test("name changes and administrator mutations have separate burst protection", async () => {
  assert.equal((await post({action:"register",name:"Новое Имя"},memberCookie())).status,200);
  assert.equal((await post({action:"register",name:"Другое Имя"},memberCookie())).status,429);
  const cookie = adminCookie();
  for (let i = 0; i < 8; i++) {
    assert.equal((await post({action:"toggle",queueId:queue,revision:i+1},cookie)).status,200);
  }
  const response = await post({action:"toggle",queueId:queue,revision:9},cookie);
  assert.equal(response.status,429);
  assert.equal(response.headers.get("Retry-After"),"5");
  const result = await db.query<{revision:number}>("select revision from public.queues where id=$1",[queue]);
  assert.equal(result.rows[0].revision,9);
});

test("IP budget also counts malformed actions and survives session changes", async () => {
  for (let i=0;i<300;i++) assert.equal((await post({action:"invalid"})).status,400);
  const response=await post({action:"adminLogout"},adminCookie());
  assert.equal(response.status,429);
  assert.equal(response.headers.get("Retry-After"),"60");
  assert.equal((await post({action:"adminLogout"},"","192.0.2.2")).status,200);
});

test("admin password attempts return the full safe waiting interval", async () => {
  for(let i=0;i<10;i++) assert.equal((await post({action:"adminLogin",passphrase:"wrong"})).status,401);
  const response=await post({action:"adminLogin",passphrase:"test-only-admin"});
  assert.equal(response.status,429);
  assert.equal(response.headers.get("Retry-After"),"900");
});

test("untrusted local proxy headers cannot create arbitrary rate-limit buckets", () => {
  process.env.VERCEL = "0";
  try {
    assert.equal(requestIpKey(new Headers({"x-forwarded-for":"192.0.2.1"})),requestIpKey(new Headers({"x-forwarded-for":"192.0.2.2"})));
  } finally { process.env.VERCEL = "1"; }
});
