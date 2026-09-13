import { describe, it, expect } from "vitest";
import { serializeTrace, buildJudgeMessages, MAX_STEPS, MAX_FIELD_CHARS } from "@/lib/scoring/prompt";
import type { TraceDetail } from "@/lib/repo";
import type { Rubric } from "@/lib/types";

const detail = (n: number, big = false): TraceDetail => ({
  trace: { id: "t", input: "任务", status: "success", tags: [], stepCount: n, createdAt: "" },
  steps: Array.from({ length: n }, (_, i) => ({
    idx: i, parentIdx: null, type: i % 2 ? "tool_result" : "tool_call",
    name: "read_file", input: big ? "x".repeat(MAX_FIELD_CHARS + 10) : `{"p":${i}}`,
    output: "ok", status: "success",
  })),
});
const rubric = {
  id: "r", name: "x", version: 1, passThreshold: 4,
  dimensions: [{ key: "task_completion", name: "任务完成度", weight: 1, scale: 5 }],
  promptTemplate: "维度 {{RUBRIC}}\n轨迹 {{TRACE}}", isDefault: true, createdAt: "",
} as Rubric;

describe("serializeTrace", () => {
  it("renders task and every step", () => {
    const md = serializeTrace(detail(3));
    expect(md).toContain("任务");
    expect(md).toContain("[0]");
    expect(md).toContain("[2]");
    expect(md).toContain("read_file");
  });

  it("notes truncation beyond 200 steps", () => {
    const md = serializeTrace(detail(MAX_STEPS + 5));
    expect(md).toContain("5");
    expect(md).toMatch(/截断/);
    expect(md).toContain(`[${MAX_STEPS - 1}]`);
    expect(md).not.toContain(`[${MAX_STEPS}]`);
  });

  it("truncates oversized fields", () => {
    const md = serializeTrace(detail(1, true));
    expect(md).toMatch(/已截断/);
    expect(md).not.toContain("x".repeat(MAX_FIELD_CHARS + 10));
  });
});

describe("buildJudgeMessages", () => {
  it("fills rubric and trace placeholders", () => {
    const msgs = buildJudgeMessages(rubric, detail(1));
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("任务完成度");
    expect(msgs[1].content).toContain("[0]");
    expect(msgs[1].content).not.toContain("{{TRACE}}");
  });
});
