import { createHash, timingSafeEqual } from "node:crypto";
import { runResultsMissingCheck } from "@/lib/data/notifications";

// The scheduled "No results TXT N days after acquisition" check, run by the server's hourly timer
// (frontends/deploy/results-check): POST with "Authorization: Bearer <ADMIN_CRON_SECRET>". Without ADMIN_CRON_SECRET on
// this server the route does not exist (404); a missing or wrong secret is 401. Answers how many orders were claimed,
// emailed and left for the next run.
export const dynamic = "force-dynamic";

const digest = (text: string) => createHash("sha256").update(text).digest();
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.ADMIN_CRON_SECRET?.trim();
  if (!secret) return new Response("Not found", { status: 404, headers: noStore });
  const given = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? "";
  if (!given || !timingSafeEqual(digest(given), digest(secret))) return new Response("Unauthorized", { status: 401, headers: noStore });
  try {
    return Response.json(await runResultsMissingCheck(), { headers: noStore });
  } catch (error) {
    console.error(`[notifications] results_missing: check failed (${error instanceof Error ? error.message : error})`);
    return Response.json({ error: "The results check failed; see the server log." }, { status: 500, headers: noStore });
  }
}
