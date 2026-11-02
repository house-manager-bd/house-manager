import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { MessageRow } from "@/types/database";

// F7 live updates in the browser, through Supabase Realtime (Postgres
// Changes on public.messages). Realtime checks the messages read policy for
// every change and every listener, so a member only receives changes in their
// own threads. Pages still work without it: they also reload on focus and
// every few seconds while the connection is down.

export type MessageChange = RealtimePostgresChangesPayload<MessageRow>;

/**
 * Listens to new and changed messages: in one thread (requestId), or in all
 * of the member's threads. `onLive` reports whether the connection is up.
 * Returns a function that stops listening.
 */
export function watchMessages({
  requestId,
  onChange,
  onLive,
}: {
  requestId?: string;
  onChange: (change: MessageChange) => void;
  onLive?: (live: boolean) => void;
}): () => void {
  const supabase = createClient();
  let channel: RealtimeChannel | null = null;
  let stopped = false;

  void (async () => {
    // The member's session token must reach Realtime before joining, or the
    // policy check runs as a visitor and nothing arrives.
    await supabase.realtime.setAuth().catch(() => undefined);
    if (stopped) return;
    // A fresh topic per listener, so a quick remount never reuses a channel
    // that is still closing.
    const topic = `messages-${requestId ?? "all"}-${Math.random().toString(36).slice(2, 10)}`;
    channel = supabase
      .channel(topic)
      .on<MessageRow>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          ...(requestId ? { filter: `request_id=eq.${requestId}` } : {}),
        },
        onChange,
      )
      .subscribe((status) => onLive?.(status === "SUBSCRIBED"));
  })();

  return () => {
    stopped = true;
    onLive?.(false);
    if (channel) void supabase.removeChannel(channel);
  };
}

/**
 * F8: listens to changes of the member's requests (a new request, an offer,
 * an acceptance, a decline or a withdrawal): one request (requestId), or all
 * of them.
 * Realtime checks the rental_requests read policy for every change and every
 * listener. Returns a function that stops listening.
 */
export function watchRequests({
  requestId,
  onChange,
}: {
  requestId?: string;
  onChange: () => void;
}): () => void {
  const supabase = createClient();
  let channel: RealtimeChannel | null = null;
  let stopped = false;

  void (async () => {
    await supabase.realtime.setAuth().catch(() => undefined);
    if (stopped) return;
    const topic = `requests-${requestId ?? "all"}-${Math.random().toString(36).slice(2, 10)}`;
    channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rental_requests",
          ...(requestId ? { filter: `id=eq.${requestId}` } : {}),
        },
        onChange,
      )
      .subscribe();
  })();

  return () => {
    stopped = true;
    if (channel) void supabase.removeChannel(channel);
  };
}

/** Sent by the thread after it marks messages as read, so the menu badge updates at once. */
export const MESSAGES_READ_EVENT = "hm:messages-read";
