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
    const scores = { instruction_following: 4, info_completeness: 3, response_naturalness: 4, error_handling: 2 };
    // 0.3*4 + 0.3*3 + 0.2*4 + 0.2*2 = 3.3
    expect(weightedScore(dims, scores)).toBe(3.3);
  });
  it("treats missing dimensions as zero contribution", () => {
    expect(weightedScore(dims, { instruction_following: 4 })).toBe(1.2);
  });
});
