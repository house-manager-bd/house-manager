"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NOTIFICATIONS_READ_EVENT, watchNotifications } from "@/lib/realtime";

/**
 * The member's unread notifications, kept up to date while the page is open
 * (F9). Starts from the count the server rendered and asks the database
 * again after any change to the member's notifications (a new one, or one
 * read in another tab), after a page marks some as read, and when the
 * window gets focus.
 */
export function useNotificationCount(userId: string, initial: number) {
  const [state, setState] = useState({ initial, count: initial });
  // A new server render (navigation or refresh) brings a fresh count.
  if (state.initial !== initial) setState({ initial, count: initial });

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    // Marking all as read changes many rows at once, so wait a moment and ask once.
    const recount = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const { data } = await supabase.rpc("unread_notification_count");
        if (!cancelled && typeof data === "number") setState((s) => ({ ...s, count: data }));
      }, 400);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recount();
    };

    const stop = watchNotifications({ userId, onChange: recount });
    window.addEventListener(NOTIFICATIONS_READ_EVENT, recount);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stop();
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, recount);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  return state.count;
}
