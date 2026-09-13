import { describe, it, expect } from "vitest";
import { JudgeOutputSchema } from "@/lib/schema";

const baseOutput = {
  scores: [{ dimension_key: "task_completion", score: 4, rationale: "ok" }],
  overall_score: 4, passed: true, summary: "s",
};

describe("JudgeOutputSchema issue suggestions", () => {
  it("passes suggestion through when present", () => {
    const parsed = JudgeOutputSchema.parse({
      ...baseOutput,
      issues: [{ step_idx: 1, severity: "high", dimension_key: "recovery", message: "报错后未重试", suggestion: "应先确认路径再重试删除" }],
    });
    expect(parsed.issues[0].suggestion).toBe("应先确认路径再重试删除");
  });

  it("defaults suggestion to empty string for legacy/omitted output", () => {
    const parsed = JudgeOutputSchema.parse({
      ...baseOutput,
      issues: [{ step_idx: null, severity: "low", dimension_key: "safety", message: "旧记录无建议字段" }],
    });
    expect(parsed.issues[0].suggestion).toBe("");
  });
});
