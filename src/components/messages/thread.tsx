"use client";

import {
  ArrowDown,
  Ban,
  Check,
  CheckCheck,
  CircleAlert,
  CircleX,
  History,
  Hourglass,
  Lock,
  Send,
  SendHorizontal,
  ShieldCheck,
  Star,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { markThreadRead, sendMessage } from "@/lib/actions/message";
import type { ErrorKey } from "@/lib/actions/result";
import { dhakaDay, formatDate, formatNumber, formatTime } from "@/lib/format";
import { MESSAGES_READ_EVENT, watchMessages, type MessageChange } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";
import { MESSAGE_BODY_MAX, SEEKER_WAIT_LIMIT, THREAD_PAGE_SIZE } from "@/lib/validation/message";
import type { DeclineReason, MessageRow, MessageSendBlock, ThreadSide } from "@/types/database";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";

export type ThreadPerson = { id: string; full_name: string; avatar_url: string | null };

/** Steps of the request, shown between the messages at the time they happened. */
export type ThreadEvent =
  | { kind: "sent"; at: string }
  | { kind: "shortlisted"; at: string }
  | { kind: "declined"; at: string; reason: DeclineReason | null; note: string | null }
  | { kind: "withdrawn"; at: string }
  | { kind: "expired"; at: string };

type Shown = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  /** Still on its way to the server. */
  pending?: boolean;
  /** The message the seeker wrote in the request form. */
  fromRequest?: boolean;
};

type Item =
  | { type: "day"; key: string; day: string }
  | { type: "unread"; key: string }
  | { type: "event"; key: string; event: ThreadEvent }
  | { type: "message"; key: string; message: Shown; groupStart: boolean };

/** Errors from sending that mean the thread is closed for this member now. */
const BLOCKING_ERRORS: Partial<Record<ErrorKey, MessageSendBlock>> = {
  threadClosed: "thread_closed",
  threadPaused: "thread_paused",
  memberBanned: "member_banned",
  waitForReply: "wait_for_reply",
  accountBanned: "banned",
};

/** Realtime sends timestamps as Postgres writes them; make them ISO 8601 for Date. */
function isoTime(value: string) {
  let s = value.includes("T") ? value : value.replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  return s;
}

function timeKey(value: string) {
  return Date.parse(isoTime(value));
}

/** Adds or updates messages by id and keeps them oldest first. */
function merge(list: MessageRow[], incoming: MessageRow[]) {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) {
    if (!m?.id) continue;
    byId.set(m.id, { ...byId.get(m.id), ...m });
  }
  return [...byId.values()].sort(
    (a, b) => timeKey(a.created_at) - timeKey(b.created_at) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

/**
 * The message thread of one request (F7, FR25): messages and the request's
 * steps in order, live updates through Supabase Realtime, and the box to
 * write a message. The database decides who may write (send_message); the
 * notices here only explain it.
 */
export function Thread({
  requestId,
  meId,
  side,
  seekerId,
  counterpartId,
  initialMessages,
  initialHasMore,
  people: initialPeople,
  requestMessage,
  requestSentAt,
  events,
  sendBlock,
  messagesLeft,
}: {
  requestId: string;
  meId: string;
  side: ThreadSide;
  seekerId: string;
  /** The person named at the top: the ad's poster for the seeker, the seeker for the landlord side. */
  counterpartId: string | null;
  initialMessages: MessageRow[];
  initialHasMore: boolean;
  people: ThreadPerson[];
  requestMessage: string | null;
  requestSentAt: string;
  events: ThreadEvent[];
  sendBlock: MessageSendBlock | null;
  messagesLeft: number | null;
}) {
  const t = useTranslations("Thread");
  const tErrors = useTranslations("Errors");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [people, setPeople] = useState<Record<string, ThreadPerson>>(() =>
    Object.fromEntries(initialPeople.map((p) => [p.id, p])),
  );
  const [pending, setPending] = useState<Shown[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [block, setBlock] = useState<MessageSendBlock | null>(sendBlock);
  const [left, setLeft] = useState<number | null>(messagesLeft);
  const [newBelow, setNewBelow] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  // "Today" and "Yesterday" are worked out from when the page opened.
  const [now] = useState(() => Date.now());
  // The "new messages" line stays where the member stopped reading.
  const [firstUnreadId] = useState(
    () => initialMessages.find((m) => (m.sender_id === seekerId) !== (side === "seeker") && !m.read_at)?.id ?? null,
  );

  // Props from a refresh (after shortlisting, withdrawing, or a send that
  // found the thread closed) bring the server's latest rules.
  const [lastProps, setLastProps] = useState({ sendBlock, messagesLeft });
  if (lastProps.sendBlock !== sendBlock || lastProps.messagesLeft !== messagesLeft) {
    setLastProps({ sendBlock, messagesLeft });
    setBlock(sendBlock);
    setLeft(messagesLeft);
  }

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef(messages);
  const liveRef = useRef(false);
  const autoScrollRef = useRef(false);
  const keepFromBottomRef = useRef<number | null>(null);
  const markTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const askedPeopleRef = useRef(new Set<string>());
  const pendingSeqRef = useRef(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const fromOtherSide = useCallback((senderId: string) => (senderId === seekerId) !== (side === "seeker"), [seekerId, side]);

  // An answer from the landlord side lifts the seeker's limit of messages.
  const landlordAnswered = side === "seeker" && messages.some((m) => m.sender_id !== seekerId);
  const capLeft = landlordAnswered ? null : left;
  const activeBlock: MessageSendBlock | null =
    block === "wait_for_reply" && landlordAnswered
      ? null
      : (block ?? (side === "seeker" && capLeft === 0 ? "wait_for_reply" : null));

  const isNearBottom = useCallback(() => {
    const el = bottomRef.current;
    return !el || el.getBoundingClientRect().top - window.innerHeight < 160;
  }, []);
  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    setNewBelow(false);
  };

  /** Marks the other side's messages as read while the member is looking. */
  const markRead = useCallback(() => {
    clearTimeout(markTimerRef.current);
    markTimerRef.current = setTimeout(async () => {
      if (document.visibilityState !== "visible") return;
      const result = await markThreadRead(requestId);
      if (result.ok) window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
    }, 300);
  }, [requestId]);

  /** Takes in new or changed messages (live, or from a catch-up load). */
  const receive = useCallback(
    (rows: MessageRow[]) => {
      if (!rows.length) return;
      const known = new Set(messagesRef.current.map((m) => m.id));
      const fresh = rows.filter((m) => !known.has(m.id));
      const freshFromThem = fresh.filter((m) => fromOtherSide(m.sender_id));
      if (fresh.length) {
        if (isNearBottom()) autoScrollRef.current = true;
        else if (freshFromThem.length) setNewBelow(true);
      }
      setMessages((list) => merge(list, rows));
      if (rows.some((m) => fromOtherSide(m.sender_id) && !m.read_at)) markRead();
    },
    [fromOtherSide, markRead, isNearBottom],
  );

  /** Loads the latest messages again: fills any gap while the connection was down. */
  const catchUp = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) receive(data);
  }, [supabase, requestId, receive]);

  // Live updates, with reloads on focus and every 15 seconds while the
  // connection is down.
  useEffect(() => {
    const stop = watchMessages({
      requestId,
      onChange: (change: MessageChange) => {
        if (change.eventType === "INSERT" || change.eventType === "UPDATE") {
          const row = change.new as MessageRow;
          receive([{ ...row, created_at: isoTime(row.created_at), read_at: row.read_at ? isoTime(row.read_at) : null }]);
        }
      },
      onLive: (live) => {
        const wasLive = liveRef.current;
        liveRef.current = live;
        if (live && !wasLive) void catchUp();
      },
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    const poll = setInterval(() => {
      if (!liveRef.current && document.visibilityState === "visible") void catchUp();
    }, 15000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      stop();
      clearInterval(poll);
      clearTimeout(markTimerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [requestId, receive, catchUp]);

  // Opening the thread reads the other side's messages.
  useEffect(() => {
    if (initialMessages.some((m) => fromOtherSide(m.sender_id) && !m.read_at)) markRead();
  }, [initialMessages, fromOtherSide, markRead]);

  // Start at the "new messages" line, or at the latest message. After a
  // frame, because navigation first scrolls the page to the top.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const unread = firstUnreadId ? document.getElementById("thread-unread") : null;
        if (unread) unread.scrollIntoView({ block: "center" });
        else bottomRef.current?.scrollIntoView({ block: "end" });
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [firstUnreadId]);

  // Names and photos of caretakers who write for the first time.
  useEffect(() => {
    const unknown = [...new Set(messages.map((m) => m.sender_id))].filter(
      (id) => !people[id] && !askedPeopleRef.current.has(id),
    );
    if (!unknown.length) return;
    unknown.forEach((id) => askedPeopleRef.current.add(id));
    void supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", unknown)
      .then(({ data }) => {
        if (data?.length) setPeople((p) => ({ ...p, ...Object.fromEntries(data.map((x) => [x.id, x])) }));
      });
  }, [messages, people, supabase]);

  const shownCount = messages.length + pending.length;
  useLayoutEffect(() => {
    if (keepFromBottomRef.current !== null) {
      // Earlier messages were added above: keep the same messages in view.
      window.scrollTo({ top: document.documentElement.scrollHeight - keepFromBottomRef.current });
      keepFromBottomRef.current = null;
    } else if (autoScrollRef.current) {
      autoScrollRef.current = false;
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [shownCount]);

  async function loadEarlier() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingEarlier(true);
    const { data, error: loadError } = await supabase
      .from("messages")
      .select("*")
      .eq("request_id", requestId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(THREAD_PAGE_SIZE + 1);
    setLoadingEarlier(false);
    if (loadError || !data) return setError("generic");
    keepFromBottomRef.current = document.documentElement.scrollHeight - window.scrollY;
    setHasMore(data.length > THREAD_PAGE_SIZE);
    setMessages((list) => merge(list, data.slice(0, THREAD_PAGE_SIZE)));
  }

  async function send() {
    const body = draft.trim();
    if (!body || activeBlock) return;
    if (body.length > MESSAGE_BODY_MAX) return setError("textTooLong");
    setError(null);
    const temp: Shown = {
      id: `pending-${++pendingSeqRef.current}`,
      sender_id: meId,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
      pending: true,
    };
    setPending((p) => [...p, temp]);
    setDraft("");
    autoScrollRef.current = true;

    const result = await sendMessage({ requestId, body });
    setPending((p) => p.filter((x) => x.id !== temp.id));
    if (!result.ok) {
      // Give the text back, unless a new one was started meanwhile.
      setDraft((d) => (d.trim() ? d : body));
      const blocking = BLOCKING_ERRORS[result.error];
      if (blocking) {
        setBlock(blocking);
        // The request or the ad changed: show its current state.
        router.refresh();
      } else {
        setError(result.error);
      }
      return;
    }
    setMessages((list) => merge(list, [result.data.message]));
    if (side === "seeker") setLeft((l) => (l === null ? null : Math.max(0, l - 1)));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on computers; on phones it makes a new line. Never while a
    // Bangla keyboard is still composing a letter.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    event.preventDefault();
    void send();
  }

  // Grow the box with the text, up to about six lines.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  // Everything in time order, with a line for each new day.
  const items = useMemo(() => {
    const oldestLoaded = messages[0]?.created_at;
    const visibleEvents = events.filter((e) => !hasMore || !oldestLoaded || timeKey(e.at) >= timeKey(oldestLoaded));
    type Entry = { at: number; order: number; item: Item };
    const entries: Entry[] = [];
    visibleEvents.forEach((event, i) =>
      entries.push({ at: timeKey(event.at), order: 0, item: { type: "event", key: `e-${event.kind}-${i}`, event } }),
    );
    if (requestMessage && !hasMore) {
      entries.push({
        at: timeKey(requestSentAt),
        order: 1,
        item: {
          type: "message",
          key: "request-message",
          groupStart: true,
          message: {
            id: "request-message",
            sender_id: seekerId,
            body: requestMessage,
            created_at: requestSentAt,
            read_at: null,
            fromRequest: true,
          },
        },
      });
    }
    messages.forEach((m) =>
      entries.push({ at: timeKey(m.created_at), order: 2, item: { type: "message", key: m.id, groupStart: true, message: m } }),
    );
    entries.sort((a, b) => a.at - b.at || a.order - b.order);
    // Messages still being sent come last, whatever this device's clock says.
    pending.forEach((m) =>
      entries.push({ at: Number.MAX_SAFE_INTEGER, order: 3, item: { type: "message", key: m.id, groupStart: true, message: m } }),
    );

    const out: Item[] = [];
    let lastDay = "";
    let prev = null as Item | null;
    for (const { item } of entries) {
      const at = item.type === "event" ? item.event.at : item.type === "message" ? item.message.created_at : "";
      const day = item.type === "message" && item.message.pending ? lastDay || dhakaDay(new Date(now)) : dhakaDay(isoTime(at));
      if (day !== lastDay) {
        out.push({ type: "day", key: `d-${day}`, day });
        lastDay = day;
        prev = null;
      }
      if (item.type === "message" && item.message.id === firstUnreadId) {
        out.push({ type: "unread", key: "unread" });
        prev = null;
      }
      if (item.type === "message") {
        const p: Item | null = prev;
        const sameSender: boolean =
          p?.type === "message" &&
          p.message.sender_id === item.message.sender_id &&
          timeKey(item.message.created_at) - timeKey(p.message.created_at) < 10 * 60 * 1000;
        const withStart: Item = { ...item, groupStart: !sameSender };
        out.push(withStart);
        prev = withStart;
      } else {
        out.push(item);
        prev = item;
      }
    }
    return out;
  }, [messages, pending, events, hasMore, requestMessage, requestSentAt, seekerId, firstUnreadId, now]);

  const lastMineId = [...messages].reverse().find((m) => m.sender_id === meId)?.id;
  const nameOf = (id: string) => people[id]?.full_name?.trim() || t("member");
  const todayDay = dhakaDay(new Date(now));
  const yesterdayDay = dhakaDay(new Date(now - 24 * 60 * 60 * 1000));

  function dayLabel(day: string) {
    if (day === todayDay) return t("today");
    if (day === yesterdayDay) return t("yesterday");
    return formatDate(day, locale);
  }

  function eventView(event: ThreadEvent): { icon: LucideIcon; text: string; note?: string | null } {
    switch (event.kind) {
      case "sent":
        return {
          icon: Send,
          text: side === "seeker" ? t("eventSentYou") : t("eventSent", { name: nameOf(seekerId) }),
        };
      case "shortlisted":
        return { icon: Star, text: side === "seeker" ? t("eventShortlistedYou") : t("eventShortlisted") };
      case "declined":
        return {
          icon: CircleX,
          text: event.reason ? t("eventDeclined", { reason: tEnum(`declineReason.${event.reason}`) }) : t("eventDeclinedNoReason"),
          note: event.note,
        };
      case "withdrawn":
        return { icon: Undo2, text: side === "seeker" ? t("eventWithdrawnYou") : t("eventWithdrawn") };
      case "expired":
        return { icon: Hourglass, text: t("eventExpired") };
    }
  }

  const blockText: Record<MessageSendBlock, string> = {
    not_authenticated: tErrors("notAllowed"),
    not_allowed: tErrors("notAllowed"),
    banned: tErrors("accountBanned"),
    thread_closed: t("closedNote"),
    thread_paused: t("pausedNote"),
    member_banned: t("memberBannedNote"),
    wait_for_reply: t("waitNote", { limit: SEEKER_WAIT_LIMIT }),
  };

  const counter = draft.length > MESSAGE_BODY_MAX - 100;

  return (
    <section aria-label={t("messagesLabel")} className="flex flex-col">
      {hasMore && (
        <div className="flex justify-center pb-4">
          <Button variant="outline" size="sm" onClick={loadEarlier} disabled={loadingEarlier}>
            <History aria-hidden />
            {loadingEarlier ? t("loadingEarlier") : t("loadEarlier")}
          </Button>
        </div>
      )}

      <ol role="log" aria-live="polite" aria-label={t("messagesLabel")} className="flex flex-col gap-1">
        {items.map((item) => {
          if (item.type === "day") {
            return (
              <li key={item.key} className="flex justify-center py-3">
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground" suppressHydrationWarning>
                  {dayLabel(item.day)}
                </span>
              </li>
            );
          }
          if (item.type === "unread") {
            return (
              <li key={item.key} id="thread-unread" className="flex items-center gap-3 py-2 text-xs font-semibold text-amber-800">
                <span className="h-px flex-1 bg-accent/60" aria-hidden />
                {t("newMessages")}
                <span className="h-px flex-1 bg-accent/60" aria-hidden />
              </li>
            );
          }
          if (item.type === "event") {
            const view = eventView(item.event);
            const Icon = view.icon;
            return (
              <li key={item.key} className="flex justify-center py-2">
                <div className="flex max-w-[90%] flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
                  <span className="flex flex-wrap items-center justify-center gap-x-1.5">
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    <span>{view.text}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={isoTime(item.event.at)} suppressHydrationWarning>
                      {formatTime(isoTime(item.event.at), locale)}
                    </time>
                  </span>
                  {view.note && <span className="break-words whitespace-pre-line text-foreground">{t("eventNote", { note: view.note })}</span>}
                </div>
              </li>
            );
          }

          const m = item.message;
          const mine = m.sender_id === meId;
          const mySide = !fromOtherSide(m.sender_id);
          const showName = item.groupStart && !mine && m.sender_id !== counterpartId;
          return (
            <li
              key={item.key}
              className={cn("flex flex-col", mySide ? "items-end" : "items-start", item.groupStart ? "pt-2" : "")}
            >
              {showName && <span className="px-1 pb-0.5 text-xs font-medium text-muted-foreground">{nameOf(m.sender_id)}</span>}
              {m.fromRequest && <span className="px-1 pb-0.5 text-xs text-muted-foreground">{t("withRequest")}</span>}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-[75%]",
                  mine
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : mySide
                      ? "rounded-br-md bg-primary/10 text-foreground"
                      : "rounded-bl-md bg-muted text-foreground",
                  m.pending && "opacity-70",
                )}
              >
                {m.body}
              </div>
              <span className="flex items-center gap-1 px-1 pt-0.5 text-[11px] text-muted-foreground">
                {m.pending ? (
                  t("sending")
                ) : (
                  <time dateTime={isoTime(m.created_at)} suppressHydrationWarning>
                    {formatTime(isoTime(m.created_at), locale)}
                  </time>
                )}
                {!m.pending && m.id === lastMineId && (
                  <>
                    <span aria-hidden>·</span>
                    {m.read_at ? (
                      <span className="flex items-center gap-0.5 text-primary">
                        <CheckCheck className="size-3.5" aria-hidden />
                        {t("seen")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5">
                        <Check className="size-3.5" aria-hidden />
                        {t("delivered")}
                      </span>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
        {shownCount === 0 && !requestMessage && (
          <li className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</li>
        )}
      </ol>

      <div className="sticky bottom-0 z-10 mt-4 flex flex-col gap-2 bg-linear-to-t from-surface from-80% to-surface/0 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {newBelow && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute -top-8 left-1/2 -translate-x-1/2 shadow-md"
            onClick={() => scrollToBottom()}
          >
            <ArrowDown aria-hidden />
            {t("newBelow")}
          </Button>
        )}
        <FormError error={error} />
        {activeBlock ? (
          <p className="flex items-start gap-2 rounded-xl border bg-muted/60 px-3 py-3 text-sm text-muted-foreground">
            {activeBlock === "thread_closed" ? (
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : activeBlock === "banned" || activeBlock === "member_banned" ? (
              <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span>{blockText[activeBlock]}</span>
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
          >
            <label htmlFor="thread-message" className="sr-only">
              {t("composeLabel")}
            </label>
            <textarea
              id="thread-message"
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MESSAGE_BODY_MAX}
              rows={1}
              placeholder={t("placeholder")}
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
            <Button type="submit" size="icon" className="shrink-0 rounded-full" disabled={!draft.trim()} aria-label={t("send")}>
              <SendHorizontal aria-hidden />
            </Button>
          </form>
        )}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
          <span className="flex items-start gap-1.5">
            <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
            {side === "seeker" ? t("safetySeeker") : t("safetyLandlord")}
          </span>
          {!activeBlock && side === "seeker" && capLeft !== null && capLeft > 0 && (
            <span className="font-medium text-amber-800">{t("leftNote", { count: capLeft })}</span>
          )}
          {!activeBlock && counter && (
            <span className={draft.length >= MESSAGE_BODY_MAX ? "text-destructive" : undefined}>
              {formatNumber(draft.length, locale)}/{formatNumber(MESSAGE_BODY_MAX, locale)}
            </span>
          )}
        </div>
      </div>
      <div ref={bottomRef} aria-hidden />
    </section>
  );
}
