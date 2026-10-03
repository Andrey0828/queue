import { z } from "zod";

export const personName = z.string().trim().transform(s => s.replace(/\s+/g, " ")).pipe(
  z.string().min(2).max(80).regex(/^[\p{L}\p{M} .’'\-]+$/u),
);
const queueId = z.uuid();
const revision = z.number().int().min(1);
const details = { title: z.string().trim().min(2).max(100), startsAt: z.iso.datetime({ offset: true }), note: z.string().trim().max(300).default("") };
const adminBase = { queueId, revision };
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register"), name: personName }),
  z.object({ action: z.literal("adminLogin"), passphrase: z.string().min(1).max(256) }),
  z.object({ action: z.literal("adminLogout") }),
  z.object({ action: z.literal("join"), queueId }),
  z.object({ action: z.literal("leave"), queueId }),
  z.object({ action: z.literal("create"), ...details }),
  z.object({ action: z.literal("edit"), ...adminBase, ...details }),
  z.object({ action: z.literal("add"), ...adminBase, name: personName }),
  z.object({ action: z.literal("move"), ...adminBase, entryId: z.uuid(), position: z.number().int().min(1).max(200) }),
  z.object({ action: z.literal("swap"), ...adminBase, entryId: z.uuid(), otherId: z.uuid() }),
  z.object({ action: z.literal("remove"), ...adminBase, entryId: z.uuid() }),
  z.object({ action: z.literal("complete"), ...adminBase, entryId: z.uuid() }),
  z.object({ action: z.literal("toggle"), ...adminBase }),
  z.object({ action: z.literal("finish"), ...adminBase }),
]);
