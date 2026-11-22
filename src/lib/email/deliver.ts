import "server-only";
import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import nodemailer from "nodemailer";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import type { Database } from "@/types/database";
import { getEmailConfig, siteUrlForEmails } from "./config";
import { renderNotificationEmail } from "./notification-email";

// F9: sends the notification emails waiting in the outbox
// (public.notification_emails) through SMTP: the project Gmail for now
// (docs/SETUP.md 8.8). It runs after the response of every action that can
// cause a notification, so the member never waits for it, and each run also
// picks up emails an earlier run could not send.
//
// The database hands out each email once (claim_notification_emails), even
// with several runs at the same moment, and only to a caller with the email
// worker secret. That call runs without a member's session; the app has no
// Supabase secret key.

const BATCH = 20;
const MAX_BATCHES = 3;
/** Errors that will hit every email of the run (wrong password, Gmail unreachable). */
const STOP_CODES = new Set(["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ETLS"]);

let warnedMissingConfig = false;

export type DeliveryResult = { sent: number; failed: number; skipped: boolean };

function errorText(error: unknown) {
  const e = error as { code?: string; responseCode?: number; message?: string };
  return [e.code, e.responseCode, e.message].filter(Boolean).join(" ").slice(0, 300) || "send failed";
}

export async function deliverNotificationEmails(): Promise<DeliveryResult> {
  const config = getEmailConfig();
  if (!config) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.info("F9: notification emails are off (SMTP_USER, SMTP_PASSWORD or EMAIL_WORKER_SECRET missing; docs/SETUP.md 8.8)");
    }
    return { sent: 0, failed: 0, skipped: true };
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const siteUrl = siteUrlForEmails();
  let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
  let sent = 0;
  let failed = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data: rows, error } = await supabase.rpc("claim_notification_emails", {
        p_secret: config.workerSecret,
        p_limit: BATCH,
      });
      if (error) {
        console.error("F9: could not claim notification emails:", error.message);
        break;
      }
      if (!rows || rows.length === 0) break;

      transport ??= nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: { user: config.user, pass: config.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });

      const sentIds: string[] = [];
      const failedIds: string[] = [];
      let lastError: string | null = null;
      let stop = false;

      for (const row of rows) {
        if (stop) {
          failedIds.push(row.notification_id);
          continue;
        }
        try {
          const mail = renderNotificationEmail(row, siteUrl);
          await transport.sendMail({
            from: { name: mail.fromName, address: config.from },
            to: row.email,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
          });
          sentIds.push(row.notification_id);
        } catch (e) {
          failedIds.push(row.notification_id);
          lastError = errorText(e);
          if (STOP_CODES.has((e as { code?: string }).code ?? "")) stop = true;
        }
      }

      const { error: finishError } = await supabase.rpc("finish_notification_emails", {
        p_secret: config.workerSecret,
        p_sent: sentIds,
        p_failed: failedIds,
        p_error: lastError,
      });
      if (finishError) console.error("F9: could not record sent emails:", finishError.message);
      if (lastError) console.error("F9: some notification emails failed:", lastError);

      sent += sentIds.length;
      failed += failedIds.length;
      if (stop || rows.length < BATCH) break;
    }
  } finally {
    transport?.close();
  }

  return { sent, failed, skipped: false };
}

/**
 * Sends waiting notification emails after the current response is finished.
 * Call it in every server action whose database function can write a
 * notification (a request step, an offer, a moderation decision, a report).
 */
export function sendNotificationEmailsLater() {
  after(async () => {
    try {
      await deliverNotificationEmails();
    } catch (e) {
      console.error("F9: sending notification emails stopped:", e);
    }
  });
}
