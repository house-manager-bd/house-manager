"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/request-origin";
import { safeNextPath } from "@/lib/utils";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SignupInput,
} from "@/lib/validation/auth";
import { authErrorKey, fromZodError, type ActionResult } from "./result";

/** Where to go after the auth callback has created a session. */
function callbackUrl(origin: string, next: string) {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function login(
  input: LoginInput,
  next?: string | null,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: authErrorKey(error) };

  // Without an explicit destination, open the dashboard in the language the
  // person saved, so the choice follows them across devices (FR5).
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_locale")
    .eq("id", data.user.id)
    .maybeSingle();
  const locale = profile?.preferred_locale ?? (await getLocale());

  redirect(safeNextPath(next, `/${locale}/dashboard`));
}

export async function signup(
  input: SignupInput,
): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { fullName, email, password, mode } = parsed.data;
  const locale = await getLocale();
  const origin = await getRequestOrigin();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the handle_new_user trigger to fill in the profile.
      data: { full_name: fullName, locale, default_mode: mode },
      emailRedirectTo: callbackUrl(origin, `/${locale}/dashboard`),
    },
  });

  if (error) return { ok: false, error: authErrorKey(error) };

  // With email confirmation on, Supabase hides whether the email is taken
  // and returns a user without identities instead of an error.
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, error: "userExists" };
  }

  // Email confirmation off (early dev testing): a session exists already.
  if (data.session) redirect(`/${locale}/dashboard`);

  return { ok: true, data: { needsConfirmation: true } };
}

export async function signInWithGoogle(next?: string | null) {
  const locale = await getLocale();
  const origin = await getRequestOrigin();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl(origin, safeNextPath(next, `/${locale}/dashboard`)),
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    redirect(`/${locale}/login?error=generic`);
  }
  redirect(data.url);
}

export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const locale = await getLocale();
  const origin = await getRequestOrigin();
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl(origin, `/${locale}/reset-password`),
  });

  // Do not reveal whether the email has an account. Only report rate limits.
  if (error && authErrorKey(error) === "rateLimited") {
    return { ok: false, error: "rateLimited" };
  }
  return { ok: true };
}

export async function updatePassword(
  input: ResetPasswordInput,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "linkInvalid" };

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: authErrorKey(error) };
  return { ok: true };
}

export async function logout() {
  const locale = await getLocale();
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}`);
}
