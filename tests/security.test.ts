import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { actionSchema } from "../lib/validation";
import { readSession, signSession, validAdminPassphrase } from "../lib/session";

process.env.SESSION_SECRET = "test-only-".repeat(8);
process.env.ADMIN_PASSPHRASE = "test-only-administrator-passphrase";

test("signed sessions reject tampering, expired sessions and role escalation", () => {
  const id = randomUUID();
  const token = signSession(id,"member",60,100000);
  assert.equal(readSession(token,"member",101000)?.sub,id);
  assert.equal(readSession(token,"admin",101000),null);
  assert.equal(readSession(token,"member",161000),null);
  const [payload,sig] = token.split(".");
  const changed = JSON.parse(Buffer.from(payload,"base64url").toString()); changed.role="admin";
  assert.equal(readSession(`${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${sig}`,"admin",101000),null);
  assert.equal(readSession(`${token}.extra`,"member",101000),null);
  assert.equal(readSession("malformed","member"),null);
});
test("admin phrase comparison and rotation of session secret", () => {
  assert.equal(validAdminPassphrase("wrong"),false);
  assert.equal(validAdminPassphrase(process.env.ADMIN_PASSPHRASE!),true);
  const token = signSession(randomUUID(),"admin",60);
  const old = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "different-secret".repeat(4);
  assert.equal(readSession(token,"admin"),null);
  process.env.SESSION_SECRET = old;
});
test("input validates dates, names, revision and target positions", () => {
  assert.equal(actionSchema.safeParse({action:"register",name:"<script>alert(1)</script>"}).success,false);
  assert.equal(actionSchema.safeParse({action:"register",name:"Иванов   Алексей"}).success,true);
  assert.equal(actionSchema.safeParse({action:"create",title:"Пара",startsAt:"invalid"}).success,false);
  assert.equal(actionSchema.safeParse({action:"move",queueId:randomUUID(),entryId:randomUUID(),position:-1,revision:1}).success,false);
  assert.equal(actionSchema.safeParse({action:"finish",queueId:randomUUID()}).success,false);
  assert.equal(actionSchema.safeParse({action:"adminLogin",passphrase:"x".repeat(300)}).success,false);
});


test("join comments are optional, trimmed and bounded", () => {
  const base = {action:"join",queueId:randomUUID()};
  assert.deepEqual(actionSchema.parse(base),{...base,comment:""});
  assert.deepEqual(actionSchema.parse({...base,comment:"  Работа № 3  "}),{...base,comment:"Работа № 3"});
  assert.equal(actionSchema.safeParse({...base,comment:"а".repeat(200)}).success,true);
  assert.equal(actionSchema.safeParse({...base,comment:"а".repeat(201)}).success,false);
  assert.equal(actionSchema.safeParse({...base,comment:123}).success,false);
});
