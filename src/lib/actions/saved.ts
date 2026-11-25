"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorKey, type ActionResult } from "./result";

/**
 * Saves a live ad for the member, or removes it from their saved ads
 * (FR30, F10). At most 200 saved ads. Returns whether it is saved now.
 */
export async function setListingSaved(listingId: string, saved: boolean): Promise<ActionResult<{ saved: boolean }>> {
  if (!z.uuid().safeParse(listingId).success || typeof saved !== "boolean") return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_listing_saved", { p_listing_id: listingId, p_saved: saved });
  if (error) {
    if (error.message === "not_authenticated") return { ok: false, error: "loginRequired" };
    return { ok: false, error: dbErrorKey(error) };
  }
  revalidatePath("/[locale]/dashboard/saved", "page");
  return { ok: true, data: { saved: Boolean(data) } };
}
