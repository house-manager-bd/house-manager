import "server-only";
import { headers } from "next/headers";

/**
 * The address the request came from, for building links in auth emails and
 * OAuth redirects. Works on localhost, Vercel previews and the live site.
 */
export async function getRequestOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;

  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto =
      h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
