import { createHash, timingSafeEqual } from "node:crypto";
import { deliverNotificationEmails } from "@/lib/email/deliver";

// F10: the scheduled job (Supabase Cron, docs/SETUP.md 8.9) calls this when
// notification emails are waiting that no action on the site has sent yet,
// for example the job's own reminders and expiry notices. It needs the
// cron secret (CRON_SECRET on Vercel, the same value in Supabase Vault).
// It only sends what is already waiting, so a repeated call does no harm.

export const dynamic = "force-dynamic";

function sameSecret(given: string, expected: string) {
  // Compare hashes, so the comparison takes the same time for any input.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!secret || !given || !sameSecret(given, secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await deliverNotificationEmails();
  return Response.json(result);
}
