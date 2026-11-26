import { z } from "zod";
import { addDays, dhakaToday } from "./request";

// F11 viewing slots. The database functions repeat every check
// (add_viewing_slots, remove_viewing_slot, book_viewing, cancel_viewing),
// with the same numbers in public.viewing_constants().

/** How many days ahead visit times can be added (today included). */
export const VIEWING_DAYS_AHEAD = 14;
/** Times added at once, and times coming up per ad. */
export const VIEWING_MAX_PER_ADD = 12;
export const VIEWING_MAX_UPCOMING = 40;
/** Booking closes this many minutes before a visit starts. */
export const VIEWING_BOOK_BEFORE_MINUTES = 60;
/** The reminder goes out this many hours before a visit. */
export const VIEWING_REMIND_HOURS = 3;
/** Visits happen between these Dhaka times. */
export const VIEWING_DAY_START = "07:00";
export const VIEWING_DAY_END = "22:00";
/** Lengths of one visit, in minutes. */
export const VIEWING_MINUTES = [15, 20, 30, 45, 60] as const;
export const VIEWING_DEFAULT_MINUTES = 30;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "10:30" as minutes after midnight. */
export function minutesOfDay(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes after midnight as "10:30". */
export function timeOfDay(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The choices of the From and To lists: every 15 minutes from 7:00 to 22:00. */
export function viewingTimeOptions() {
  const out: string[] = [];
  for (let m = minutesOfDay(VIEWING_DAY_START); m <= minutesOfDay(VIEWING_DAY_END); m += 15) out.push(timeOfDay(m));
  return out;
}

/** The days a time can be added on: today and the next 14 days (Dhaka). */
export function viewingDays(now = new Date()) {
  const today = dhakaToday(now);
  return Array.from({ length: VIEWING_DAYS_AHEAD + 1 }, (_, i) => addDays(today, i));
}

/** How many visits fit between from and to (leftover minutes are dropped). */
export function slotCount(from: string, to: string, minutes: number) {
  if (!TIME.test(from) || !TIME.test(to) || !minutes) return 0;
  return Math.max(0, Math.floor((minutesOfDay(to) - minutesOfDay(from)) / minutes));
}

/** A Dhaka date and time as a moment (Dhaka is UTC+6 all year). */
export function dhakaMoment(date: string, time: string) {
  return new Date(`${date}T${time}:00+06:00`);
}

/** The start times of the visits a form would add, as moments. */
export function slotStarts(date: string, from: string, to: string, minutes: number) {
  const count = slotCount(from, to, minutes);
  const first = dhakaMoment(date, from).getTime();
  return Array.from({ length: count }, (_, i) => new Date(first + i * minutes * 60_000));
}

export const addViewingSlotsSchema = z
  .object({
    listingId: z.uuid("generic"),
    date: z.string().regex(DATE, "dateInvalid"),
    from: z.string().regex(TIME, "viewingTimeInvalid"),
    to: z.string().regex(TIME, "viewingTimeInvalid"),
    minutes: z.coerce.number().refine((m) => (VIEWING_MINUTES as readonly number[]).includes(m), "generic"),
  })
  .superRefine((v, ctx) => {
    if (!viewingDays().includes(v.date)) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "viewingDateInvalid" });
      return;
    }
    if (v.from < VIEWING_DAY_START || v.to > VIEWING_DAY_END || v.from >= v.to) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "viewingTimeInvalid" });
      return;
    }
    const count = slotCount(v.from, v.to, v.minutes);
    if (count < 1) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "viewingTimeInvalid" });
    } else if (count > VIEWING_MAX_PER_ADD) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "viewingTooMany" });
    } else if (dhakaMoment(v.date, v.from).getTime() < Date.now() + VIEWING_BOOK_BEFORE_MINUTES * 60_000) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "viewingTooSoon" });
    }
  });

export type AddViewingSlotsInput = z.input<typeof addViewingSlotsSchema>;

export const bookViewingSchema = z.object({
  requestId: z.uuid("generic"),
  slotId: z.uuid("generic"),
});

export type BookViewingInput = z.input<typeof bookViewingSchema>;
