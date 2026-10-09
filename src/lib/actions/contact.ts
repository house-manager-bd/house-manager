"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbErrorKey, type ActionResult } from "./result";

export type RevealedContact = {
  phone: string | null;
  whatsapp: string | null;
  /** Reveals left in the last 24 hours. */
  remaining: number;
};

/**
 * Shows an ad's phone numbers to a logged-in member. Each member can open
 * the numbers of 20 different ads per 24 hours (plan FR12); the database
 * counts and logs every reveal.
 */
export async function revealContact(listingId: string): Promise<ActionResult<RevealedContact>> {
  if (!z.uuid().safeParse(listingId).success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_contact", { p_listing_id: listingId });
  if (error) {
    if (error.message === "not_authenticated") return { ok: false, error: "loginRequired" };
    return { ok: false, error: dbErrorKey(error) };
  }
  const row = data?.[0];
  if (!row) return { ok: false, error: "generic" };
  return { ok: true, data: { phone: row.contact_phone, whatsapp: row.whatsapp, remaining: row.remaining } };
}
