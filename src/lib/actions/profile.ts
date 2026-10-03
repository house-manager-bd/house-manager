"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeBdPhone } from "@/lib/phone";
import { localeSchema, modeSchema } from "@/lib/validation/auth";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";
import type { AppLocale, AppMode } from "@/types/database";
import { fromZodError, type ActionResult } from "./result";

async function requireUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { supabase, userId } = await requireUserId();
  if (!userId) return { ok: false, error: "generic" };

  const { fullName, phone, locale, mode } = parsed.data;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, preferred_locale: locale, default_mode: mode })
    .eq("id", userId);
  if (profileError) return { ok: false, error: "generic" };

  const { error: phoneError } = await supabase
    .from("profile_private")
    .update({ phone: phone === "" ? null : normalizeBdPhone(phone) })
    .eq("user_id", userId);
  if (phoneError) return { ok: false, error: "generic" };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Seek or host. Decides which menus the person sees. */
export async function setMode(mode: AppMode): Promise<ActionResult> {
  const parsed = modeSchema.safeParse(mode);
  if (!parsed.success) return fromZodError(parsed.error);

  const { supabase, userId } = await requireUserId();
  if (!userId) return { ok: false, error: "generic" };

  const { error } = await supabase
    .from("profiles")
    .update({ default_mode: parsed.data })
    .eq("id", userId);
  if (error) return { ok: false, error: "generic" };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Saves the language choice on the account (the cookie covers this device). */
export async function setPreferredLocale(locale: AppLocale): Promise<ActionResult> {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return fromZodError(parsed.error);

  const { supabase, userId } = await requireUserId();
  if (!userId) return { ok: true }; // Visitors only use the cookie.

  await supabase
    .from("profiles")
    .update({ preferred_locale: parsed.data })
    .eq("id", userId);
  return { ok: true };
}

/**
 * Saves the public URL of an avatar the browser just uploaded, or removes it.
 * The URL must point inside the user's own folder in the avatars bucket.
 */
export async function setAvatar(avatarUrl: string | null): Promise<ActionResult> {
  const { supabase, userId } = await requireUserId();
  if (!userId) return { ok: false, error: "generic" };

  if (avatarUrl !== null) {
    const expectedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${userId}/`;
    if (!avatarUrl.startsWith(expectedPrefix) || avatarUrl.length > 500) {
      return { ok: false, error: "uploadFailed" };
    }
  }

  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId);
  if (error) return { ok: false, error: "generic" };

  // Delete the previous uploaded file (not a Google photo) to save storage.
  const marker = "/storage/v1/object/public/avatars/";
  const old = current?.avatar_url;
  if (old && old !== avatarUrl && old.includes(marker)) {
    const path = old.split(marker)[1]?.split("?")[0];
    if (path?.startsWith(`${userId}/`)) {
      await supabase.storage.from("avatars").remove([path]);
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
