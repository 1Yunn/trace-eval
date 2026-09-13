import type { RubricDimension } from "@/lib/types";

export function validateWeights(dimensions: RubricDimension[]): boolean {
  if (dimensions.length === 0) return false;
  const sum = dimensions.reduce((acc, d) => acc + d.weight, 0);
  return Math.abs(sum - 1) <= 0.01;
}

export function weightedScore(
  dimensions: RubricDimension[],
  scores: Record<string, number>,
): number {
  const total = dimensions.reduce((acc, d) => acc + d.weight * (scores[d.key] ?? 0), 0);
  return Math.round(total * 100) / 100;
}
