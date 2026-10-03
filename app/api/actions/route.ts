import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { actionSchema } from "@/lib/validation";
import { ADMIN_AGE, ADMIN_COOKIE, MEMBER_AGE, MEMBER_COOKIE, cookieOptions, privateKey, readSession, signSession, validAdminPassphrase } from "@/lib/session";
import { AppError, limit, rpc } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("BAD_ORIGIN", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("INVALID_INPUT");
    if (Number(request.headers.get("content-length")) > 4096) throw new AppError("INVALID_INPUT", 413);
    const body = await request.text();
    if (body.length > 4096) throw new AppError("INVALID_INPUT", 413);
    let json: unknown;
    try { json = JSON.parse(body); } catch { throw new AppError("INVALID_INPUT"); }
    const parsed = actionSchema.safeParse(json);
    if (!parsed.success) throw new AppError("INVALID_INPUT");
    const input = parsed.data;
    const member = readSession(request.cookies.get(MEMBER_COOKIE)?.value, "member");
    const admin = readSession(request.cookies.get(ADMIN_COOKIE)?.value, "admin");
    const ip = (request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    const ipKey = privateKey(ip);
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });

    if (input.action === "adminLogin") {
      await limit(`admin:${ipKey}`, 10, 900);
      if (!validAdminPassphrase(input.passphrase)) throw new AppError("WRONG_PASSPHRASE", 401);
      response.cookies.set(ADMIN_COOKIE, signSession(randomUUID(), "admin", ADMIN_AGE), cookieOptions(ADMIN_AGE));
      return response;
    }
    if (input.action === "adminLogout") {
      response.cookies.set(ADMIN_COOKIE, "", cookieOptions(0));
      return response;
    }
    if (input.action === "register") {
      await limit(`register:${ipKey}`, 100, 900);
      const id = member?.sub ?? randomUUID();
      if (member) await limit(`rename:${id}`, 5, 60);
      await rpc("queue_command", { p_action: "register", p_actor: id, p_admin: false, p_payload: { name: input.name } });
      response.cookies.set(MEMBER_COOKIE, signSession(id, "member", MEMBER_AGE), cookieOptions(MEMBER_AGE));
      return response;
    }
    const isParticipantAction = input.action === "join" || input.action === "leave";
    if (isParticipantAction && !member) throw new AppError("LOGIN_REQUIRED", 401);
    if (!isParticipantAction && !admin) throw new AppError("FORBIDDEN", 403);
    await limit(`action:${isParticipantAction ? member!.sub : admin!.sub}`, 45, 60);
    await rpc("queue_command", { p_action: input.action, p_actor: member?.sub ?? null, p_admin: Boolean(admin), p_payload: input });
    return response;
  } catch (error) { return errorResponse(error); }
}
