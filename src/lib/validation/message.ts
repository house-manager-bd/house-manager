import { z } from "zod";
import { requiredText } from "./common";

// F7 message threads. The database function send_message repeats every
// check, and also decides who may write and when (message_send_block).

/** Longest message, in characters (the database checks the same). */
export const MESSAGE_BODY_MAX = 1000;
/** Messages a seeker may add before the landlord side answers (send_message). */
export const SEEKER_WAIT_LIMIT = 3;
/** Messages loaded at once on the thread page. */
export const THREAD_PAGE_SIZE = 100;

export const sendMessageSchema = z.object({
  requestId: z.uuid("generic"),
  body: requiredText(1, MESSAGE_BODY_MAX),
});

export type SendMessageInput = z.input<typeof sendMessageSchema>;
