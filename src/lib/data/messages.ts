import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { THREAD_PAGE_SIZE } from "@/lib/validation/message";
import type { MessageRow, MessageThreadRow, ThreadCountRow, ThreadInfoRow } from "@/types/database";

// Loaders for F7 message threads. They run as the signed-in member; only the
// seeker and the ad's landlord side can read a thread (admins cannot).

export type ThreadPerson = { id: string; full_name: string; avatar_url: string | null };

export type Thread = {
  info: ThreadInfoRow;
  /** Oldest first: the latest THREAD_PAGE_SIZE messages. */
  messages: MessageRow[];
  /** True when older messages exist (the thread loads them on request). */
  hasMore: boolean;
  /** Everyone who wrote in the thread, for names and photos. */
  people: ThreadPerson[];
};

/** One request's thread, or null when the member is not on the request. */
export async function getThread(requestId: string): Promise<Thread | null> {
  const supabase = await createClient();
  const [{ data: info }, { data: rows }] = await Promise.all([
    supabase.rpc("thread_info", { p_request_id: requestId }).maybeSingle(),
    supabase
      .from("messages")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(THREAD_PAGE_SIZE + 1),
  ]);
  if (!info) return null;

  const latest = rows ?? [];
  const hasMore = latest.length > THREAD_PAGE_SIZE;
  const messages = latest.slice(0, THREAD_PAGE_SIZE).reverse();

  // The seeker and the poster are known from the header; other senders are
  // caretakers of the building.
  const people: ThreadPerson[] = [
    { id: info.tenant_id, full_name: info.seeker_name, avatar_url: info.seeker_avatar },
  ];
  if (info.poster_id) {
    people.push({ id: info.poster_id, full_name: info.poster_name ?? "", avatar_url: info.poster_avatar });
  }
  const others = [...new Set(messages.map((m) => m.sender_id))].filter((id) => !people.some((p) => p.id === id));
  if (others.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", others);
    people.push(...(profiles ?? []));
  }

  return { info, messages, hasMore, people };
}

/** Every thread of the member that has messages, newest first (the Messages page). */
export async function getMessageThreads(): Promise<MessageThreadRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("message_threads");
  return data ?? [];
}

/** Unread messages across all of the member's threads, for the menu badge. Cached per request. */
export const getUnreadMessageCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("unread_message_count");
  return typeof data === "number" ? data : 0;
});

/** Message and unread counts per request on one ad, for its landlord's requests page. */
export async function getListingThreadCounts(listingId: string): Promise<Map<string, ThreadCountRow>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("listing_thread_counts", { p_listing_id: listingId });
  return new Map((data ?? []).map((row) => [row.request_id, row]));
}
