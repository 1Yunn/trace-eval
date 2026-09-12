import { describe, it, expect } from "vitest";
import { contentHash } from "@/lib/dedupe";
import type { NormalizedTrace } from "@/lib/types";

const base = (over: Partial<NormalizedTrace> = {}): NormalizedTrace => ({
  input: "同一句话", status: "unknown", tags: [], metadata: {}, steps: [], ...over,
});

describe("contentHash", () => {
  it("is stable for same input/steps/time", () => {
    expect(contentHash(base())).toBe(contentHash(base()));
    expect(contentHash(base())).toMatch(/^[0-9a-f]{40}$/);
  });
  it("changes when input, step count or time differs", () => {
    const h = contentHash(base());
    expect(contentHash(base({ input: "另一句" }))).not.toBe(h);
    expect(contentHash(base({ steps: [{ type: "text", status: "success" }] }))).not.toBe(h);
    expect(contentHash(base({ startedAt: "2026-01-01T00:00:00.000Z" }))).not.toBe(h);
  });
});
