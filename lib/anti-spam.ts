import { limit } from "./db";
import { privateKey } from "./session";

export function requestIpKey(headers: Headers) {
  // Only trust proxy headers when running behind Vercel's trusted edge.
  // Local/self-hosted runs share a bucket instead of trusting spoofable headers.
  const ip = process.env.VERCEL === "1"
    ? (headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim()
    : "local";
  return privateKey(ip || "unknown");
}

export async function limitRequests(ipKey: string) {
  // Enough for a class sharing Wi-Fi. Includes invalid and unauthenticated requests.
  await limit(`requests:v2:${ipKey}`, 300, 60);
}

export async function limitAction(action: string, ipKey: string, memberId?: string, adminId?: string) {
  if (action === "adminLogin") {
    await limit(`admin:${ipKey}`, 10, 900);
  } else if (action === "register") {
    await limit(`register:${ipKey}`, 100, 900);
    if (memberId) {
      await limit(`rename:burst:${memberId}`, 1, 5);
      await limit(`rename:${memberId}`, 5, 60);
    }
  } else if (action === "join" || action === "leave") {
    // Shared bucket prevents alternating join/leave from bypassing the limit.
    await limit(`participant:burst:${memberId}`, 2, 5);
    await limit(`participant:minute:${memberId}`, 10, 60);
    await limit(`participant:quarter:${memberId}`, 30, 900);
  } else if (adminId && action !== "adminLogout") {
    // IP bucket is stable across admin re-logins; session buckets work across IP changes.
    await limit(`admin-actions:ip:${ipKey}`, 90, 60);
    await limit(`admin-actions:burst:${adminId}`, 8, 5);
    await limit(`action:${adminId}`, 45, 60);
  }
}
