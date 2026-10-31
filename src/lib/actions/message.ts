"use server";

import { createClient } from "@/lib/supabase/server";
import { requestIdSchema } from "@/lib/validation/request";
import { sendMessageSchema, type SendMessageInput } from "@/lib/validation/message";
import type { MessageRow } from "@/types/database";
import { dbErrorKey, fromZodError, type ActionResult } from "./result";

// F7 message threads. Each action checks the input with the shared schema,
// then calls one database function, which checks the caller and the rules
// again. Neither action revalidates pages: the thread adds the new message
// itself, and live updates reach the other pages.

/** Sends a message on a request (FR25). Returns the saved message. */
export async function sendMessage(input: SendMessageInput): Promise<ActionResult<{ message: MessageRow }>> {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_message", {
    p_request_id: parsed.data.requestId,
    p_body: parsed.data.body,
  });
  if (error || !data) {
    if (error?.message === "not_authenticated") return { ok: false, error: "loginRequired" };
    return { ok: false, error: dbErrorKey(error) };
  }
  return { ok: true, data: { message: data } };
}

/** Marks the other side's messages in one thread as read. */
export async function markThreadRead(requestId: string): Promise<ActionResult> {
  const parsed = requestIdSchema.safeParse(requestId);
  if (!parsed.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_thread_read", { p_request_id: parsed.data });
  if (error) return { ok: false, error: dbErrorKey(error) };
  return { ok: true };
}
