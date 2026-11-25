"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendNotificationEmailsLater } from "@/lib/email/deliver";
import { LISTING_PHOTOS_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import {
  aboutStepSchema,
  costsStepSchema,
  tenantsStepSchema,
  type AboutStepInput,
  type CostsStepInput,
  type TenantsStepInput,
} from "@/lib/validation/listing";
import type { Json, ListingEditable, ListingStatus } from "@/types/database";
import { dbErrorKey, fromZodError, type ActionResult, type ErrorKey } from "./result";

/** Starts a draft for a unit (or returns the user's existing draft). */
export async function startListing(unitId: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_listing_draft", { p_unit_id: unitId });
  if (error || !data) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true, data: { id: data } };
}

/** What saving a wizard step did: a draft stays a draft; a live ad stays live or waits for an admin (F10). */
export type SaveStepResult = ActionResult<{ status: ListingStatus }>;

type Contact = { contact_phone: string | null; whatsapp: string | null };

/**
 * Saves one wizard step. Drafts are updated directly (RLS allows the poster
 * to change their own draft). A live ad (F10) goes through
 * edit_live_listing, which keeps the ad type and the sublet permission, and
 * sends the ad back to review when the change sets off an automatic check
 * an admin has not seen yet.
 */
async function saveListing(listingId: string, values: ListingEditable, contact?: Contact): Promise<SaveStepResult> {
  if (!z.uuid().safeParse(listingId).success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { data: current } = await supabase.from("listings").select("status").eq("id", listingId).maybeSingle();
  if (!current) return { ok: false, error: "notAllowed" };

  if (current.status === "active") {
    // The type and the sublet permission stay as they are (the database ignores them too).
    const editable: ListingEditable = { ...values };
    delete editable.listing_type;
    delete editable.sublet_consent;
    const { data, error } = await supabase.rpc("edit_live_listing", {
      p_listing_id: listingId,
      p_values: editable as Json,
      p_contact: contact ?? null,
    });
    if (error) return listingError(error);
    revalidatePath("/[locale]/dashboard", "layout");
    revalidatePath(`/[locale]/ads/${listingId}`, "page");
    return { ok: true, data: { status: data } };
  }

  const { data, error } = await supabase
    .from("listings")
    .update(values)
    .eq("id", listingId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: dbErrorKey(error) };
  // No row back: not the poster's draft any more (or already submitted).
  if (!data) return { ok: false, error: "notADraft" };
  if (contact) {
    const { error: contactError } = await supabase.from("listing_private").update(contact).eq("listing_id", listingId);
    if (contactError) return { ok: false, error: dbErrorKey(contactError) };
  }
  return { ok: true, data: { status: "draft" } };
}

/** listing_incomplete carries the missing fields in its details. */
function listingError(error: { message?: string; details?: string | null; code?: string }): {
  ok: false;
  error: ErrorKey;
  fieldErrors?: Record<string, ErrorKey>;
} {
  if (error.message === "listing_incomplete") {
    return {
      ok: false,
      error: "listingIncomplete",
      fieldErrors: Object.fromEntries((error.details ?? "").split(",").map((f) => [f, "required"])),
    };
  }
  return { ok: false, error: dbErrorKey(error) };
}

export async function saveAboutStep(listingId: string, input: AboutStepInput): Promise<SaveStepResult> {
  const parsed = aboutStepSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  return saveListing(listingId, {
    listing_type: v.listingType,
    title: v.title,
    description: v.description ?? null,
    available_from: v.availableFrom,
    owner_name: v.postedAs === "caretaker" ? (v.ownerName ?? null) : null,
    sublet_consent: v.postedAs === "tenant_sublet" ? v.subletConsent : false,
  });
}

export async function saveCostsStep(listingId: string, input: CostsStepInput): Promise<SaveStepResult> {
  const parsed = costsStepSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  return saveListing(listingId, {
    monthly_rent: v.monthlyRent,
    rent_negotiable: v.rentNegotiable,
    advance_months: v.advanceMonths,
    service_charge: v.serviceCharge,
    electricity: v.electricity,
    water: v.water,
    gas_bill: v.gasBill,
    other_charges: v.otherCharges ?? null,
  });
}

export async function saveTenantsStep(listingId: string, input: TenantsStepInput): Promise<SaveStepResult> {
  const parsed = tenantsStepSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  return saveListing(
    listingId,
    {
      tenant_types: v.tenantTypes,
      max_occupants: v.maxOccupants,
      open_slots: v.openSlots,
      extra_rules: v.extraRules ?? null,
      agreement_required: v.agreementRequired,
    },
    { contact_phone: v.contactPhone, whatsapp: v.whatsapp },
  );
}

/**
 * Sends a finished draft in. The database runs the automatic checks (F5):
 * the ad goes live straight away ("active"), or waits for an admin
 * ("pending_review") when the poster is new or a check flagged it.
 */
export async function submitListing(
  listingId: string,
): Promise<ActionResult<{ status: "active" | "pending_review" }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_listing", { p_listing_id: listingId });
  if (error) return listingError(error);
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true, data: { status: data === "active" ? "active" : "pending_review" } };
}

/**
 * Takes an ad that waits for review, or a rejected ad, back to a draft so
 * the poster can change it. A rejected ad goes to review again when it is
 * sent in.
 */
export async function reopenListing(listingId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(listingId).success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_listing", { p_listing_id: listingId });
  if (error) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true };
}

export async function deleteDraft(listingId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // Photo rows go with the draft (on delete cascade); the files are removed
  // from storage after the draft is gone.
  const { data: photos } = await supabase
    .from("listing_photos")
    .select("storage_path")
    .eq("listing_id", listingId);
  const { error, count } = await supabase
    .from("listings")
    .delete({ count: "exact" })
    .eq("id", listingId)
    .eq("status", "draft");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (!count) {
    // F10: a draft that has requests (a live ad taken back to edit) stays.
    const { data: hasRequests } = await supabase.rpc("listing_has_requests", { p_listing_id: listingId });
    return { ok: false, error: hasRequests ? "draftHasRequests" : "notADraft" };
  }
  if (photos?.length) {
    await supabase.storage.from(LISTING_PHOTOS_BUCKET).remove(photos.map((p) => p.storage_path));
  }
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true };
}

// F10: managing ads -------------------------------------------------------------

const listingId = z.uuid();

async function listingCall(
  fn: "pause_listing" | "resume_listing" | "mark_listing_rented",
  id: string,
): Promise<ActionResult> {
  if (!listingId.safeParse(id).success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_listing_id: id });
  if (error) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]/dashboard", "layout");
  revalidatePath(`/[locale]/ads/${id}`, "page");
  return { ok: true };
}

/** Takes a live ad out of search and stops new requests; its link, requests and threads stay. */
export async function pauseListing(id: string) {
  return listingCall("pause_listing", id);
}

export async function resumeListing(id: string) {
  return listingCall("resume_listing", id);
}

/**
 * A tenant was found outside the site: the ad becomes rented and every
 * open request is declined with the "filled" reason (each member is told).
 */
export async function markListingRented(id: string): Promise<ActionResult> {
  const result = await listingCall("mark_listing_rented", id);
  if (result.ok) sendNotificationEmailsLater();
  return result;
}

/** 30 more days, in an ad's last 7 days or up to 30 days after it expired. */
export async function renewListing(id: string): Promise<ActionResult<{ expiresAt: string }>> {
  if (!listingId.safeParse(id).success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("renew_listing", { p_listing_id: id });
  if (error || !data) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]/dashboard", "layout");
  revalidatePath(`/[locale]/ads/${id}`, "page");
  return { ok: true, data: { expiresAt: data } };
}

/**
 * Re-list (FR37): a rented or expired ad becomes a new draft with its
 * details filled in, and its photos are copied into the draft. Storage
 * files cannot be copied from SQL, so the server copies them here; a photo
 * that cannot be copied (for example one posted by someone else) is left
 * out, and the poster adds new ones in the wizard.
 */
export async function relistListing(id: string): Promise<ActionResult<{ id: string; photosCopied: number }>> {
  if (!listingId.safeParse(id).success) return { ok: false, error: "generic" };
  const supabase = await createClient();
  const [{ data: claims }, { data: draftId, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("relist_listing", { p_listing_id: id }),
  ]);
  if (error || !draftId) return { ok: false, error: dbErrorKey(error) };
  const userId = claims?.claims.sub;

  let copied = 0;
  const [{ data: existing }, { data: photos }] = await Promise.all([
    supabase.from("listing_photos").select("id").eq("listing_id", draftId),
    supabase
      .from("listing_photos")
      .select("storage_path, width, height, content_hash")
      .eq("listing_id", id)
      .order("sort_order"),
  ]);
  // A second click returns the same draft; its photos are already there.
  if (userId && !existing?.length && photos?.length) {
    const bucket = supabase.storage.from(LISTING_PHOTOS_BUCKET);
    for (const photo of photos) {
      const ext = photo.storage_path.endsWith(".jpg") ? "jpg" : "webp";
      const to = `${userId}/${draftId}/${crypto.randomUUID()}.${ext}`;
      const { error: copyError } = await bucket.copy(photo.storage_path, to);
      if (copyError) continue;
      const { error: addError } = await supabase.rpc("add_listing_photo", {
        p_listing_id: draftId,
        p_path: to,
        p_width: photo.width ?? 0,
        p_height: photo.height ?? 0,
        p_hash: photo.content_hash,
      });
      if (addError) {
        await bucket.remove([to]);
        continue;
      }
      copied++;
    }
  }

  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true, data: { id: draftId, photosCopied: copied } };
}
