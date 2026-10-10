import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const alice = randomUUID();
const bob = randomUUID();
const claire = randomUUID();
async function command(action: string, payload: Record<string, unknown> = {}, actor: string | null = null, admin = true) {
  const result = await db.query<{ result: { ok: boolean; queueId?: string } }>("select public.queue_command($1, $2::uuid, $3, $4::jsonb) as result", [action, actor, admin, JSON.stringify(payload)]);
  return result.rows[0].result;
}
async function snapshot(actor: string | null = null, admin = true, queue: string | null = null) {
  const result = await db.query<{ result: import("../lib/types").Snapshot }>("select public.queue_state($1::uuid,$2,$3::uuid,0) as result", [actor,admin,queue]);
  return result.rows[0].result;
}
async function active() { const s = await snapshot(); return { queueId: s.queue!.id, revision: s.queue!.revision }; }
before(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(await readFile(new URL("../supabase/schema.sql", import.meta.url),"utf8"));
});
beforeEach(async () => {
  await db.exec("truncate public.members, public.queues, public.entries, public.audit_log, public.rate_limits restart identity cascade;");
  for (const [id,name] of [[alice,"Иванов Алексей"],[bob,"Петров Борис"],[claire,"Смирнова Мария"]]) await command("register",{name},id,false);
  await command("create",{title:"Математический анализ",startsAt:"2026-10-05T09:00:00Z",note:"Аудитория 214"});
});
after(async () => { await db.close(); });

test("registration, repeated join and state privacy", async () => {
  await command("join", await active(), alice, false);
  await command("join", await active(), alice, false);
  await command("join", await active(), bob, false);
  const state = await snapshot(alice,false);
  assert.equal(state.entries.length,2);
  assert.deepEqual(state.entries.map(e=>e.position),[1,2]);
  assert.equal(state.entries[0].isMe,true);
  assert.equal(state.entries[1].isMe,false);
  assert.deepEqual(state.audit,[]);
  assert.ok(!JSON.stringify(state.entries).includes(alice));
});
test("move shifts the intermediate entries; swap only exchanges two entries", async () => {
  for (const id of [alice,bob,claire]) await command("join",await active(),id,false);
  let s = await snapshot();
  await command("move",{...await active(),entryId:s.entries[2].id,position:1});
  s = await snapshot();
  assert.deepEqual(s.entries.map(e=>e.name),["Смирнова Мария","Иванов Алексей","Петров Борис"]);
  await command("swap",{...await active(),entryId:s.entries[0].id,otherId:s.entries[2].id});
  s = await snapshot();
  assert.deepEqual(s.entries.map(e=>e.name),["Петров Борис","Иванов Алексей","Смирнова Мария"]);
  assert.deepEqual(s.entries.map(e=>e.position),[1,2,3]);
});
test("leaving compacts positions and rejoining puts participant last", async () => {
  for (const id of [alice,bob,claire]) await command("join",await active(),id,false);
  await command("leave",await active(),bob,false);
  assert.deepEqual((await snapshot()).entries.map(e=>e.position),[1,2]);
  await command("join",await active(),bob,false);
  assert.equal((await snapshot()).entries[2].name,"Петров Борис");
});
test("closed registration and participant permission checks", async () => {
  await command("toggle",await active());
  await assert.rejects(command("join",await active(),alice,false),/REGISTRATION_CLOSED/);
  await assert.rejects(command("toggle",await active(),alice,false),/FORBIDDEN/);
  await assert.rejects(command("create",{title:"Чужая пара"},alice,false),/FORBIDDEN/);
  await command("add",{...await active(),name:"Добавлен Администратором"});
  assert.equal((await snapshot()).entries.length,1);
});
test("stale administrator updates roll back without affecting positions", async () => {
  const old = await active();
  await command("join",old,alice,false);
  await assert.rejects(command("finish",old),/STALE_QUEUE/);
  assert.equal((await snapshot()).queue?.status,"open");
  assert.equal((await snapshot()).entries.length,1);
});
test("names are normalized, duplicate names cannot claim a second place", async () => {
  await command("join",await active(),alice,false);
  const another = randomUUID();
  await command("register",{name:"иванов   алексей"},another,false);
  await assert.rejects(command("join",await active(),another,false),/DUPLICATE_NAME/);
  await assert.rejects(command("register",{name:"Другое Имя"},alice,false),/NAME_LOCKED/);
  assert.equal((await snapshot()).entries.length,1);
});
test("complete only first, archive remains intact, create next queue", async () => {
  await command("join",await active(),alice,false);
  await command("join",await active(),bob,false);
  const s = await snapshot();
  const archiveId = s.queue!.id;
  await assert.rejects(command("complete",{...await active(),entryId:s.entries[1].id}),/NOT_FIRST/);
  await command("complete",{...await active(),entryId:s.entries[0].id});
  await assert.rejects(command("join",await active(),alice,false),/ALREADY_DONE/);
  await command("finish",await active());
  let current = await snapshot();
  assert.equal(current.queue,null);
  assert.equal(current.history[0].completed,1);
  assert.equal(current.history[0].total,2);
  const archived = await snapshot(alice,false,archiveId);
  assert.equal(archived.queue?.status,"finished");
  assert.equal(archived.entries.length,2);
  await assert.rejects(command("join",{queueId:archiveId},alice,false),/QUEUE_NOT_ACTIVE/);
  await command("create",{title:"Программирование",startsAt:"2026-10-06T09:00:00Z"});
  await command("join",await active(),alice,false);
  current = await snapshot();
  assert.equal(current.entries.length,1);
  assert.equal(current.history.length,1);
});
test("remove, edit and one-active-queue invariant", async () => {
  await command("join",await active(),alice,false);
  await command("join",await active(),bob,false);
  await command("remove",{...await active(),entryId:(await snapshot()).entries[0].id});
  assert.equal((await snapshot()).entries[0].position,1);
  await command("edit",{...await active(),title:"Новое название",startsAt:"2026-10-06T10:30:00Z",note:"302"});
  assert.equal((await snapshot()).queue?.title,"Новое название");
  await assert.rejects(command("create",{title:"Вторая пара",startsAt:"2026-10-06T10:30:00Z"}),/ACTIVE_EXISTS/);
});
test("rate limit is persisted and resets after expiry", async () => {
  const hit = async () => (await db.query<{ allowed: boolean }>("select public.take_rate_limit('test',2,60) as allowed")).rows[0].allowed;
  assert.equal(await hit(),true); assert.equal(await hit(),true); assert.equal(await hit(),false);
  await db.exec("update public.rate_limits set expires_at=now()-interval '1 second'");
  assert.equal(await hit(),true);
});
test("anonymous and authenticated roles cannot read tables or invoke privileged RPCs", async () => {
  for (const role of ["anon","authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query("select * from public.entries"),/permission denied/);
      await assert.rejects(db.query("select public.queue_state(null,false,null,0)"),/permission denied/);
      await assert.rejects(db.query("select public.queue_command('finish',null,true,'{}')"),/permission denied/);
    } finally { await db.exec("reset role"); }
  }
  await db.exec("set role service_role");
  try { assert.equal((await snapshot()).queue?.title,"Математический анализ"); }
  finally { await db.exec("reset role"); }
});
test("schema can be applied again without deleting existing queues", async () => {
  await command("join",await active(),alice,false);
  const migration = await readFile(new URL("../supabase/migrations/20261009_registration_opening.sql", import.meta.url),"utf8");
  await db.exec(migration);
  await db.exec(migration);
  assert.equal((await snapshot()).queue?.registration_open,true);
  await db.exec(await readFile(new URL("../supabase/schema.sql", import.meta.url),"utf8"));
  assert.equal((await snapshot()).entries.length,1);
});


test("scheduled registration uses database time and respects manual closure", async () => {
  await db.exec("update public.queues set starts_at=now()+interval '1 hour'");
  assert.equal((await snapshot()).queue?.registration_open,false);
  await assert.rejects(command("join",await active(),alice,false),/REGISTRATION_NOT_STARTED/);
  // Administrative additions are still possible before opening.
  await command("add",{...await active(),name:"Добавлен Заранее"});
  await command("toggle",await active());
  await db.exec("update public.queues set starts_at=now()-interval '1 second'");
  assert.equal((await snapshot()).queue?.registration_open,false);
  await assert.rejects(command("join",await active(),alice,false),/REGISTRATION_CLOSED/);
  await command("toggle",await active());
  assert.equal((await snapshot()).queue?.registration_open,true);
  await command("join",await active(),alice,false);
  assert.equal((await snapshot()).entries.length,2);
});

test("editing opening time preserves places and gates new joins", async () => {
  await command("join",await active(),alice,false);
  await command("edit",{...await active(),title:"Поздняя запись",startsAt:new Date(Date.now()+3600000).toISOString()});
  assert.equal((await snapshot()).queue?.registration_open,false);
  assert.equal((await snapshot()).entries.length,1);
  await assert.rejects(command("join",await active(),bob,false),/REGISTRATION_NOT_STARTED/);
  await command("leave",await active(),alice,false);
  await command("edit",{...await active(),title:"Ранняя запись",startsAt:new Date(Date.now()-60000).toISOString()});
  assert.equal((await snapshot()).queue?.registration_open,true);
  await command("join",await active(),bob,false);
});


test("comments are public, survive completion and archive, and reset on rejoin", async () => {
  const text = "Лабораторная № 3\n<script>alert(1)</script>";
  await command("join",{...await active(),comment:text},alice,false);
  await command("join",{...await active(),comment:"Повтор запроса"},alice,false);
  assert.equal((await snapshot(null,false)).entries[0].comment,text);
  const migration = await readFile(new URL("../supabase/migrations/20261010_entry_comments.sql",import.meta.url),"utf8");
  await db.exec(migration); await db.exec(migration);
  assert.equal((await snapshot()).entries[0].comment,text);
  await command("leave",await active(),alice,false);
  await command("join",await active(),alice,false);
  assert.equal((await snapshot()).entries[0].comment,"");
  await command("join",{...await active(),comment:"Б".repeat(200)},bob,false);
  await assert.rejects(command("join",{...await active(),comment:"Б".repeat(201)},claire,false),/INVALID_INPUT/);
  const state = await snapshot();
  await command("complete",{...await active(),entryId:state.entries[0].id});
  await command("complete",{...await active(),entryId:state.entries[1].id});
  await command("finish",await active());
  const archived = await snapshot(null,false,state.queue!.id);
  assert.equal(archived.entries.find(e=>e.name==="Петров Борис")?.comment,"Б".repeat(200));
});
