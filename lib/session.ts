import { createHmac, timingSafeEqual, createHash } from "node:crypto";

type Session = { sub: string; role: "member" | "admin"; exp: number };
export const MEMBER_COOKIE = "pq_member";
export const ADMIN_COOKIE = "pq_admin";
export const MEMBER_AGE = 60 * 60 * 24 * 180;
export const ADMIN_AGE = 60 * 60 * 12;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("CONFIGURATION");
  return value;
}
export function signSession(sub: string, role: Session["role"], maxAge: number, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub, role, exp: Math.floor(now / 1000) + maxAge })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function readSession(token: string | undefined, role: Session["role"], now = Date.now()): Session | null {
  if (!token || token.length > 1024) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const expected = createHmac("sha256", secret()).update(parts[0]).digest();
    const actual = Buffer.from(parts[1], "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Session;
    if (data.role !== role || !Number.isFinite(data.exp) || data.exp <= now / 1000 ||
      typeof data.sub !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.sub)) return null;
    return data;
  } catch { return null; }
}
export function validAdminPassphrase(value: string) {
  const expected = process.env.ADMIN_PASSPHRASE;
  if (!expected || expected.length < 16) throw new Error("CONFIGURATION");
  return timingSafeEqual(createHash("sha256").update(value).digest(), createHash("sha256").update(expected).digest());
}
export function privateKey(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}
