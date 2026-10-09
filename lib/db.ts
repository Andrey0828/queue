export class AppError extends Error {
  constructor(public code: string, public status = 400, public retryAfter?: number) { super(code); }
}
export function isConfigured() {
  return Boolean(process.env.SUPABASE_URL?.startsWith("https://") &&
    process.env.SUPABASE_SECRET_KEY && (process.env.ADMIN_PASSPHRASE?.length ?? 0) >= 4 && (process.env.ADMIN_PASSPHRASE?.length ?? 0) <= 256 &&
    (process.env.SESSION_SECRET?.length ?? 0) >= 32);
}
export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!isConfigured()) throw new AppError("CONFIGURATION", 503);
  const key = process.env.SUPABASE_SECRET_KEY!;
  let response: Response;
  try {
    response = await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(args), cache: "no-store", signal: AbortSignal.timeout(12000),
    });
  } catch { throw new AppError("DATABASE_UNAVAILABLE", 503); }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const known = ["FORBIDDEN","NAME_LOCKED","INVALID_INPUT","ACTIVE_EXISTS","QUEUE_NOT_ACTIVE","STALE_QUEUE","REGISTRATION_CLOSED","LOGIN_REQUIRED","ALREADY_DONE","QUEUE_FULL","INVALID_POSITION","ENTRY_NOT_FOUND","NOT_FIRST","INVALID_ACTION","DUPLICATE_NAME"];
    if (known.includes(error.message)) throw new AppError(error.message, error.message === "STALE_QUEUE" ? 409 : 400);
    // Log only a database error code, never credentials or request payloads.
    console.error("Database RPC failed", name, error.code ?? response.status);
    throw new AppError("DATABASE_UNAVAILABLE", 503);
  }
  return response.json() as Promise<T>;
}
export async function limit(key: string, attempts: number, seconds: number) {
  const allowed = await rpc<boolean>("take_rate_limit", { p_key: key, p_limit: attempts, p_seconds: seconds });
  if (!allowed) throw new AppError("RATE_LIMIT", 429, seconds);
}
