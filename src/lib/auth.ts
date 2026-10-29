import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile, ProfilePrivate } from "@/types/database";

export type CurrentUser = {
  id: string;
  email: string;
  /** "email" or "google" */
  provider: string;
};

/**
 * The signed-in user, or null for visitors. Cached per request, so the
 * header, layouts and pages can all call it without extra cost.
 *
 * Uses getClaims, which checks the session token's signature locally (the
 * signing keys are cached), instead of getUser, which asks the Supabase Auth
 * server on every call. The proxy has already refreshed the token.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub,
    email: claims.email ?? "",
    provider: (claims.app_metadata?.provider as string | undefined) ?? "email",
  };
});

/** The signed-in user's profile row, or null for visitors. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return data;
});

/**
 * True for team admins (profiles.is_admin, set in the SQL Editor), unless
 * banned. The database checks the same rule in public.is_admin(), so this
 * only decides what the pages show.
 */
export function isAdminProfile(profile: Pick<Profile, "is_admin" | "is_banned"> | null): boolean {
  return Boolean(profile?.is_admin && !profile.is_banned);
}

/** The signed-in user's private row (phone). Only they can read it. */
export const getCurrentPrivateProfile = cache(
  async (): Promise<ProfilePrivate | null> => {
    const user = await getCurrentUser();
    if (!user) return null;
    const supabase = await createClient();
    const { data } = await supabase
      .from("profile_private")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    return data;
  },
);
