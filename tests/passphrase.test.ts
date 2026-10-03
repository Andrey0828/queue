import { test } from "node:test";
import assert from "node:assert/strict";
import { isConfigured } from "../lib/db";
import { signSession, validAdminPassphrase } from "../lib/session";

test("four-character admin phrase configures the app and permits only the correct phrase", () => {
  const saved = { ...process.env };
  try {
    process.env.SUPABASE_URL = "https://queue-test.invalid";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test_only";
    process.env.SESSION_SECRET = "test-session-secret-".repeat(3);
    process.env.ADMIN_PASSPHRASE = "тест";
    assert.equal(isConfigured(), true);
    assert.equal(validAdminPassphrase("тест"), true);
    assert.equal(validAdminPassphrase("иной"), false);

    for (const value of ["", "а", "аб", "абв"]) {
      process.env.ADMIN_PASSPHRASE = value;
      assert.equal(isConfigured(), false);
      assert.throws(() => validAdminPassphrase(value), /CONFIGURATION/);
    }

    process.env.ADMIN_PASSPHRASE = "x".repeat(256);
    assert.equal(isConfigured(), true);
    process.env.ADMIN_PASSPHRASE = "x".repeat(257);
    assert.equal(isConfigured(), false);

    process.env.ADMIN_PASSPHRASE = "тест";
    process.env.SESSION_SECRET = "x".repeat(31);
    assert.equal(isConfigured(), false);
    assert.throws(() => signSession("test", "admin", 60), /CONFIGURATION/);
    process.env.SESSION_SECRET = "x".repeat(32);
    assert.equal(isConfigured(), true);
  } finally {
    for (const key of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SESSION_SECRET", "ADMIN_PASSPHRASE"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
