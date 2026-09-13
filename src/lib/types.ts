export type TraceStatus = "success" | "error" | "unknown";
export type StepType =
  | "thought" | "text" | "tool_call" | "tool_result"
  | "error" | "system" | "custom";
export type StepStatus = "running" | "success" | "error";
export type EvalStatus = "pending" | "running" | "success" | "error";

export interface NormalizedStep {
  externalId?: string;
  type: StepType;
  name?: string;
  input?: string;
  output?: string;
  status: StepStatus;
  parentExternalId?: string;
  startedAt?: string;
  endedAt?: string;
  tokenInput?: number;
  tokenOutput?: number;
}

export interface NormalizedTrace {
  externalId?: string;
  agent?: string;
  model?: string;
  input: string;
  output?: string;
  status: TraceStatus;
  startedAt?: string;
  endedAt?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  tokenInput?: number;
  tokenOutput?: number;
  steps: NormalizedStep[];
}

export interface RubricDimension {
  key: string;
  name: string;
  weight: number;
  scale: number;
}

export interface Rubric {
  id: string;
  name: string;
  version: number;
  dimensions: RubricDimension[];
  passThreshold: number;
  promptTemplate: string;
  isDefault: boolean;
  createdAt: string;
}

export interface JudgeScore {
  dimension_key: string;
  score: number;
  rationale: string;
}

export type IssueSeverity = "high" | "medium" | "low";

export interface JudgeIssue {
  step_idx: number | null;
  severity: IssueSeverity;
  dimension_key: string;
  message: string;
  /** 针对该问题的具体修复建议（中文，可执行）；历史记录或模型漏返回时为空串 */
  suggestion: string;
}

export interface JudgeOutput {
  scores: JudgeScore[];
  overall_score: number;
  passed: boolean;
  summary: string;
  issues: JudgeIssue[];
}

export interface JudgeConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  concurrency: number;
}

/** 归一化单条结果（成功或带行号的失败） */
export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;
