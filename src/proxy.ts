import createIntlMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/proxy";

const handleI18n = createIntlMiddleware(routing);

// Pages that need a signed-in user, written without the locale prefix.
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];
// Pages a signed-in user should not see again.
const GUEST_ONLY = ["/login", "/signup", "/forgot-password"];

function splitLocale(pathname: string) {
  const [, first, ...rest] = pathname.split("/");
  if ((routing.locales as readonly string[]).includes(first)) {
    return { locale: first, path: "/" + rest.join("/") };
  }
  return { locale: null, path: pathname };
}

function matches(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  // Bangla is the default. A first-time visitor's browser language is
  // ignored (most browsers in Bangladesh send English), but a language the
  // person chose before is remembered in the NEXT_LOCALE cookie.
  const headers = new Headers(request.headers);
  headers.delete("accept-language");
  const i18nRequest = new NextRequest(request, { headers });

  const response = handleI18n(i18nRequest);

  // next-intl is redirecting (for example "/" to "/bn"); nothing else to do.
  if (response.headers.has("location")) return response;

  const userId = await updateSession(request, response);
  const { locale, path } = splitLocale(request.nextUrl.pathname);
  const lang = locale ?? routing.defaultLocale;

  if (!userId && matches(path, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${lang}/login`;
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname);
    return redirectWithCookies(url, response);
  }

  if (userId && matches(path, GUEST_ONLY)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${lang}/dashboard`;
    url.search = "";
    return redirectWithCookies(url, response);
  }

  return response;
}

// Keep refreshed session cookies when we redirect.
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() === "cache-control") redirect.headers.set(key, value);
  });
  return redirect;
}

export const config = {
  // Skip API routes, the auth callback, Next.js internals and files with an
  // extension (images, fonts, robots.txt and so on).
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
