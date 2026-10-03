import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

/**
 * Finishes every email link and Google sign-in:
 * - Google and the default email templates send `?code=...` (PKCE).
 * - The recommended email templates (docs/SETUP.md, section 8) send
 *   `?token_hash=...&type=...`, which also works when the email is opened
 *   in a different browser, such as the Gmail app on a phone.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const fallbackLocale = routing.defaultLocale;
  const next = safeNextPath(searchParams.get("next"), `/${fallbackLocale}/dashboard`);
  const locale = (routing.locales as readonly string[]).find((l) =>
    next.startsWith(`/${l}`),
  ) ?? fallbackLocale;

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }

  if (!ok) {
    return NextResponse.redirect(`${origin}/${locale}/login?error=linkInvalid`);
  }

  // A brand new Google account has no mode yet. Save the language the person
  // was using, so their profile starts in that language.
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await supabase
      .from("profiles")
      .update({ preferred_locale: locale as "bn" | "en" })
      .eq("id", data.user.id)
      .is("default_mode", null);
  }

  // A password reset link always opens the reset page.
  const destination = type === "recovery" ? `/${locale}/reset-password` : next;
  return NextResponse.redirect(`${origin}${destination}`);
}
