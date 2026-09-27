import { describe, it, expect } from "vitest";
import { JudgeOutputSchema } from "@/lib/schema";

const baseOutput = {
  scores: [{ dimension_key: "instruction_following", score: 4, rationale: "ok" }],
  overall_score: 4, passed: true, summary: "s",
};

describe("JudgeOutputSchema issue suggestions", () => {
  it("passes suggestion through when present", () => {
    const parsed = JudgeOutputSchema.parse({
      ...baseOutput,
      issues: [{ step_idx: 1, severity: "high", dimension_key: "error_handling", message: "报错后未重试", suggestion: "应先确认路径再重试删除" }],
    });
    expect(parsed.issues[0].suggestion).toBe("应先确认路径再重试删除");
  });

  it("defaults suggestion to empty string for legacy/omitted output", () => {
    const parsed = JudgeOutputSchema.parse({
      ...baseOutput,
      issues: [{ step_idx: null, severity: "low", dimension_key: "error_handling", message: "旧记录无建议字段" }],
    });
    expect(parsed.issues[0].suggestion).toBe("");
  });

  it("rejects score out of 0-4 range", () => {
    expect(() => JudgeOutputSchema.parse({
      ...baseOutput,
      scores: [{ dimension_key: "instruction_following", score: 5, rationale: "超范围" }],
    })).toThrow();
    expect(() => JudgeOutputSchema.parse({
      ...baseOutput,
      scores: [{ dimension_key: "instruction_following", score: -1, rationale: "超范围" }],
    })).toThrow();
  });
});
