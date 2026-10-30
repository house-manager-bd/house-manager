"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MESSAGES_READ_EVENT, watchMessages } from "@/lib/realtime";

/**
 * The member's unread messages, kept up to date while the page is open
 * (F7). Starts from the count the server rendered and asks the database
 * again after any change to the member's messages, after the thread marks
 * messages as read, and when the window gets focus.
 */
export function useUnreadCount(initial: number) {
  const [state, setState] = useState({ initial, count: initial });
  // A new server render (navigation or refresh) brings a fresh count.
  if (state.initial !== initial) setState({ initial, count: initial });

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    // Several changes arrive together (reading a thread marks each message),
    // so wait a moment and ask once.
    const recount = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const { data } = await supabase.rpc("unread_message_count");
        if (!cancelled && typeof data === "number") setState((s) => ({ ...s, count: data }));
      }, 400);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recount();
    };

    const stop = watchMessages({ onChange: recount });
    window.addEventListener(MESSAGES_READ_EVENT, recount);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stop();
      window.removeEventListener(MESSAGES_READ_EVENT, recount);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state.count;
}
