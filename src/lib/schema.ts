import { z } from "zod";

export const JudgeScoreSchema = z.object({
  dimension_key: z.string().min(1),
  score: z.coerce.number(),
  rationale: z.string().default(""),
});

export const JudgeIssueSchema = z.object({
  step_idx: z.coerce.number().int().nullable().default(null),
  severity: z.enum(["high", "medium", "low"]).default("low"),
  dimension_key: z.string().default(""),
  message: z.string().default(""),
});

export const JudgeOutputSchema = z.object({
  scores: z.array(JudgeScoreSchema).min(1),
  overall_score: z.coerce.number().default(0),
  passed: z.boolean().default(false),
  summary: z.string().default(""),
  issues: z.array(JudgeIssueSchema).default([]),
});
