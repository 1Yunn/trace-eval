import { describe, it, expect } from "vitest";
import { validateWeights, weightedScore } from "@/lib/scoring/weight";
import { DEFAULT_RUBRIC_DRAFT } from "@/lib/rubric-defaults";

const dims = DEFAULT_RUBRIC_DRAFT.dimensions;

describe("validateWeights", () => {
  it("accepts weights summing to 1 within 0.01", () => {
    expect(validateWeights(dims)).toBe(true);
  });
  it("rejects sums far from 1", () => {
    expect(validateWeights(dims.map((d) => ({ ...d, weight: 0.1 })))).toBe(false);
  });
});

describe("weightedScore", () => {
  it("computes weighted total rounded to 2 decimals", () => {
    const scores = { task_completion: 5, tool_accuracy: 3, trajectory: 4, recovery: 2, safety: 5 };
    // 0.3*5 + 0.3*3 + 0.2*4 + 0.1*2 + 0.1*5 = 3.9
    // （brief 原文误写为 4.3，实际加权和为 3.9，已按数学结果最小修正）
    expect(weightedScore(dims, scores)).toBe(3.9);
  });
  it("treats missing dimensions as zero contribution", () => {
    expect(weightedScore(dims, { task_completion: 5 })).toBe(1.5);
  });
});
