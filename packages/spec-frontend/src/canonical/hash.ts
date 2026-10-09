import { createHash } from "node:crypto";

/** Exact input identity; strings encode as UTF-8 without normalization. */
export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
