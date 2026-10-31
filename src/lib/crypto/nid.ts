import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// F8: the NID number is encrypted on the server before it is saved (plan
// section 1.5). AES-256-GCM with a key that lives only in the server's
// environment (NID_ENCRYPTION_KEY, 32 random bytes in base64), never in the
// database or the browser. A database copy alone cannot reveal any number.
//
// Stored form: v1:<iv>:<ciphertext>:<tag>, each part in base64. The request
// and tenant ids are bound to the ciphertext (additional authenticated
// data), so a value copied to another row cannot be read.

const VERSION = "v1";

export class NidKeyMissingError extends Error {
  constructor() {
    super("NID_ENCRYPTION_KEY is not set, or is not 32 bytes in base64");
  }
}

function nidKey(): Buffer {
  const raw = process.env.NID_ENCRYPTION_KEY?.trim();
  if (!raw) throw new NidKeyMissingError();
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new NidKeyMissingError();
  return key;
}

/** True when the server can encrypt NID numbers (the key is set). */
export function nidKeyReady(): boolean {
  try {
    nidKey();
    return true;
  } catch {
    return false;
  }
}

function context(requestId: string, tenantId: string) {
  return Buffer.from(`nid:${requestId}:${tenantId}`, "utf8");
}

/** Encrypts a normalised NID number (digits only) for one request and tenant. */
export function encryptNid(nid: string, requestId: string, tenantId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", nidKey(), iv);
  cipher.setAAD(context(requestId, tenantId));
  const body = Buffer.concat([cipher.update(nid, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), body.toString("base64"), tag.toString("base64")].join(":");
}

/** The NID number, or null when the value cannot be read (wrong key, row or format). */
export function decryptNid(value: string, requestId: string, tenantId: string): string | null {
  const [version, iv, body, tag] = value.split(":");
  if (version !== VERSION || !iv || !body || !tag) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", nidKey(), Buffer.from(iv, "base64"));
    decipher.setAAD(context(requestId, tenantId));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
