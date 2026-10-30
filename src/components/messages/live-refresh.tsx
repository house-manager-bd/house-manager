"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { watchMessages } from "@/lib/realtime";

/**
 * Reloads the page's data when a message arrives or is read in one of the
 * member's threads (F7), so lists and unread counts stay current without a
 * manual reload. Renders nothing.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 800);
    };
    const stop = watchMessages({ onChange: refresh });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [router]);

  return null;
}
