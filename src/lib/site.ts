/**
 * The live site's address (NEXT_PUBLIC_SITE_URL), without a trailing slash.
 * Canonical links, share previews and structured data always point here,
 * also on preview deployments, so search engines treat the live site as the
 * original.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  // Vercel always knows the production address, also on previews.
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  "http://localhost:3000"
).replace(/\/+$/, "");

/** The project Gmail, shown to members who need to reach the team. */
export const SUPPORT_EMAIL = "housemanagerbd@gmail.com";

/** An absolute address on the live site, for structured data. */
export function absoluteUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The address of the deployment itself: a preview's own branch address, or
 * the live site everywhere else. Used for email links (F9), the sitemap and
 * robots.txt (F12), so testers stay on the preview. Only Vercel's own
 * variables are read, never a request header.
 */
export function deploymentUrl(): string {
  if (process.env.VERCEL_ENV === "preview") {
    const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (host) return `https://${host}`;
  }
  return SITE_URL;
}

/**
 * Only the live site may be indexed. Previews share the dev database with
 * production and show test data, so robots.txt closes them (F12). Vercel also
 * sends "X-Robots-Tag: noindex" on preview addresses.
 */
export function isLiveDeployment() {
  const env = process.env.VERCEL_ENV;
  return env === undefined || env === "production";
}
