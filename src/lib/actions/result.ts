import type { ZodError } from "zod";
import type messages from "../../../messages/en.json";

export type ErrorKey = keyof (typeof messages)["Errors"];

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: ErrorKey; fieldErrors?: Record<string, ErrorKey> };

export function fromZodError(error: ZodError): {
  ok: false;
  error: ErrorKey;
  fieldErrors: Record<string, ErrorKey>;
} {
  const fieldErrors: Record<string, ErrorKey> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message as ErrorKey;
  }
  const first = Object.values(fieldErrors)[0] ?? "generic";
  return { ok: false, error: first, fieldErrors };
}

/** Maps Supabase Auth error codes to our translated messages. */
export function authErrorKey(error: { code?: string; status?: number } | null): ErrorKey {
  switch (error?.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "user_already_exists":
    case "email_exists":
      return "userExists";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rateLimited";
    case "same_password":
      return "samePassword";
    case "weak_password":
      return "weakPassword";
    default:
      return error?.status === 429 ? "rateLimited" : "generic";
  }
}
