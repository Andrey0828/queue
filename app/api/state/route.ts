import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, MEMBER_COOKIE, readSession } from "@/lib/session";
import { AppError, rpc } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import type { Snapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const queueId = request.nextUrl.searchParams.get("queue");
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    if ((queueId && !z.uuid().safeParse(queueId).success) || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new AppError("INVALID_INPUT");
    const member = readSession(request.cookies.get(MEMBER_COOKIE)?.value, "member");
    const admin = readSession(request.cookies.get(ADMIN_COOKIE)?.value, "admin");
    const state = await rpc<Omit<Snapshot,"isAdmin">>("queue_state", {
      p_actor: member?.sub ?? null, p_admin: Boolean(admin), p_queue_id: queueId, p_offset: offset,
    });
    return NextResponse.json({ ...state, isAdmin: Boolean(admin) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) { return errorResponse(error); }
}
