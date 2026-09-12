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
  it("covers full content and is independent of key insertion order", () => {
    // 相同 input/步骤数/startedAt，但步骤内容不同 → 哈希不同
    const stepA = base({
      startedAt: "2026-01-01T00:00:00.000Z",
      steps: [{ type: "text", status: "success", input: "a" }],
    });
    const stepB = base({
      startedAt: "2026-01-01T00:00:00.000Z",
      steps: [{ type: "text", status: "success", input: "b" }],
    });
    expect(contentHash(stepA)).not.toBe(contentHash(stepB));

    // agent 不同 → 哈希不同
    expect(contentHash(base({ agent: "agent-a" }))).not.toBe(
      contentHash(base({ agent: "agent-b" })),
    );

    // deep-equal 但 metadata 键插入顺序不同（含嵌套对象）→ 哈希相同
    const m1: Record<string, unknown> = {};
    m1.z = { y: 1, x: [1, 2, { b: 2, a: 1 }] };
    m1.a = "v";
    const m2: Record<string, unknown> = {};
    m2.a = "v";
    m2.z = { x: [1, 2, { a: 1, b: 2 }], y: 1 };
    expect(contentHash(base({ metadata: m1 }))).toBe(contentHash(base({ metadata: m2 })));
  });
});
