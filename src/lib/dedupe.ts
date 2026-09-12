import { createHash } from "node:crypto";
import type { NormalizedTrace } from "@/lib/types";

export function contentHash(t: NormalizedTrace): string {
  const basis = `${t.input}\n${t.steps.length}\n${t.startedAt ?? ""}`;
  return createHash("sha1").update(basis).digest("hex");
}
