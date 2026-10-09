"use server";

import { revalidatePath } from "next/cache";
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
import type { ListingEditable } from "@/types/database";
import { dbErrorKey, fromZodError, type ActionResult } from "./result";

/** Starts a draft for a unit (or returns the user's existing draft). */
export async function startListing(unitId: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_listing_draft", { p_unit_id: unitId });
  if (error || !data) return { ok: false, error: dbErrorKey(error) };
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true, data: { id: data } };
}

async function updateDraft(listingId: string, values: ListingEditable): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .update(values)
    .eq("id", listingId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: dbErrorKey(error) };
  // No row back: not the poster's draft any more (or already submitted).
  if (!data) return { ok: false, error: "notADraft" };
  return { ok: true };
}

export async function saveAboutStep(listingId: string, input: AboutStepInput): Promise<ActionResult> {
  const parsed = aboutStepSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  return updateDraft(listingId, {
    listing_type: v.listingType,
    title: v.title,
    description: v.description ?? null,
    available_from: v.availableFrom,
    owner_name: v.postedAs === "caretaker" ? (v.ownerName ?? null) : null,
    sublet_consent: v.postedAs === "tenant_sublet" ? v.subletConsent : false,
  });
}

export async function saveCostsStep(listingId: string, input: CostsStepInput): Promise<ActionResult> {
  const parsed = costsStepSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  return updateDraft(listingId, {
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

export async function saveTenantsStep(listingId: string, input: TenantsStepInput): Promise<ActionResult> {
  const parsed = tenantsStepSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const result = await updateDraft(listingId, {
    tenant_types: v.tenantTypes,
    max_occupants: v.maxOccupants,
    open_slots: v.openSlots,
    extra_rules: v.extraRules ?? null,
    agreement_required: v.agreementRequired,
  });
  if (!result.ok) return result;

  const supabase = await createClient();
  const { error } = await supabase
    .from("listing_private")
    .update({ contact_phone: v.contactPhone, whatsapp: v.whatsapp })
    .eq("listing_id", listingId);
  if (error) return { ok: false, error: dbErrorKey(error) };
  return { ok: true };
}

export async function submitListing(
  listingId: string,
): Promise<ActionResult<{ missing: string[] }>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_listing", { p_listing_id: listingId });
  if (error) {
    if (error.message === "listing_incomplete") {
      return {
        ok: false,
        error: "listingIncomplete",
        fieldErrors: Object.fromEntries((error.details ?? "").split(",").map((f) => [f, "required"])),
      };
    }
    return { ok: false, error: dbErrorKey(error) };
  }
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true, data: { missing: [] } };
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
  if (!count) return { ok: false, error: "notADraft" };
  if (photos?.length) {
    await supabase.storage.from(LISTING_PHOTOS_BUCKET).remove(photos.map((p) => p.storage_path));
  }
  revalidatePath("/[locale]/dashboard", "layout");
  return { ok: true };
}
