import "server-only";

// F9 email settings, from environment variables (docs/SETUP.md 8.8). Secrets
// live only on Vercel and in .env.local, never in the repo.

export type EmailConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  /** The sender address (the project Gmail unless EMAIL_FROM says otherwise). */
  from: string;
  /** Lets the server claim emails from the outbox (its SHA-256 hash is in the database). */
  workerSecret: string;
};

/**
 * The email settings, or null when any required value is missing (then
 * notifications still appear in the app; emails simply wait, and are
 * skipped once they are 24 hours old).
 */
export function getEmailConfig(): EmailConfig | null {
  const user = process.env.SMTP_USER?.trim();
  // Google shows app passwords in groups of four; the spaces do not matter.
  const password = process.env.SMTP_PASSWORD?.replace(/\s+/g, "");
  const workerSecret = process.env.EMAIL_WORKER_SECRET?.trim();
  if (!user || !password || !workerSecret) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number.isInteger(port) && port > 0 ? port : 465,
    user,
    password,
    from: process.env.EMAIL_FROM?.trim() || user,
    workerSecret,
  };
}

/**
 * The site address that email links point to. A preview deployment links to
 * its own branch address, so testers stay on the preview; everything else
 * uses NEXT_PUBLIC_SITE_URL. Only Vercel's own variables are used, never a
 * request header, so nobody can make the emails link somewhere else.
 */
export function siteUrlForEmails(): string {
  if (process.env.VERCEL_ENV === "preview") {
    const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (host) return `https://${host}`;
  }
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}
