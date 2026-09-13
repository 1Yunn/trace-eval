import { describe, it, expect, vi } from "vitest";
import { scoreOne, JudgeError } from "@/lib/scoring/judge";
import type { JudgeModelClient } from "@/lib/scoring/judge";
import type { TraceDetail } from "@/lib/repo";
import { DEFAULT_RUBRIC_DRAFT, DEFAULT_PROMPT_TEMPLATE } from "@/lib/rubric-defaults";
import type { Rubric } from "@/lib/types";

const detail: TraceDetail = {
  trace: { id: "t", input: "任务", status: "success", tags: [], stepCount: 1, createdAt: "" },
  steps: [{ idx: 0, parentIdx: null, type: "tool_call", name: "x", input: "{}", output: "", status: "success" }],
};
const rubric: Rubric = {
  id: "r", name: DEFAULT_RUBRIC_DRAFT.name, version: 1,
  dimensions: DEFAULT_RUBRIC_DRAFT.dimensions, passThreshold: 4,
  promptTemplate: DEFAULT_PROMPT_TEMPLATE, isDefault: true, createdAt: "",
};
const valid = (over = {}) =>
  JSON.stringify({
    scores: DEFAULT_RUBRIC_DRAFT.dimensions.map((d, i) => ({
      dimension_key: d.key, score: i === 0 ? 4 : 3, rationale: "r",
    })),
    overall_score: 1, passed: true, summary: "s", issues: [], ...over,
  });

const mockClient = (impl: (...args: any[]) => any): JudgeModelClient =>
  ({ model: "mock", chat: vi.fn(impl) });

describe("scoreOne", () => {
  it("parses json and recomputes weighted score / passed", async () => {
    const client = mockClient(async () => ({ content: valid(), usage: { input: 9, output: 8 } }));
    const r = await scoreOne(client, rubric, detail);
    // 0.3*4 + 0.3*3 + 0.2*3 + 0.1*3 + 0.1*3 = 3.3
    expect(r.output.overall_score).toBe(3.3);
    expect(r.output.passed).toBe(false);
    expect(r.tokenInput).toBe(9);
  });

  it("extracts json from markdown fences", async () => {
    const client = mockClient(async () => ({ content: "```json\n" + valid() + "\n```" }));
    const r = await scoreOne(client, rubric, detail);
    expect(r.output.scores).toHaveLength(5);
  });

  it("retries once with repair message on bad json", async () => {
    let n = 0;
    const client = mockClient(async () => (n++ === 0 ? { content: "not json" } : { content: valid() }));
    const r = await scoreOne(client, rubric, detail);
    expect(r.output.summary).toBe("s");
    expect(client.chat).toHaveBeenCalledTimes(2);
  });

  it("throws parse error after second failure", async () => {
    const client = mockClient(async () => ({ content: "still bad" }));
    await expect(scoreOne(client, rubric, detail)).rejects.toMatchObject({ kind: "parse" });
  });

  it("surfaces 401 as config error", async () => {
    const client = mockClient(async () => { const e: any = new Error("401"); e.status = 401; throw e; });
    await expect(scoreOne(client, rubric, detail)).rejects.toMatchObject({ kind: "config" });
  });

  it("falls back to plain text when endpoint rejects response_format", async () => {
    const client = mockClient(async (_m, jsonMode) => {
      if (jsonMode) {
        const e: any = new Error("400 response_format json_object is not supported");
        e.status = 400;
        throw e;
      }
      return { content: valid() };
    });
    const r = await scoreOne(client, rubric, detail);
    expect(r.output.overall_score).toBe(3.3);
    expect(client.chat).toHaveBeenCalledTimes(2);
  });

  it("retries transient network error then succeeds", async () => {
    let n = 0;
    const client = mockClient(async () => {
      if (n++ === 0) throw new Error("fetch failed");
      return { content: valid() };
    });
    const r = await scoreOne(client, rubric, detail);
    expect(r.output.overall_score).toBe(3.3);
    expect(client.chat).toHaveBeenCalledTimes(2);
  });
});
