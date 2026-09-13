// 客户端共享行类型：仅重新导出/声明服务端接口形状，
// 避免 client bundle 拉入 better-sqlite3 等服务端模块。
export type { Rubric } from "./types";

export interface TraceListItem {
  id: string; externalId?: string; agent?: string; model?: string;
  input: string; output?: string; status: string;
  startedAt?: string; endedAt?: string; durationMs?: number;
  tags: string[]; tokenInput?: number; tokenOutput?: number;
  stepCount: number; createdAt: string;
  overallScore?: number; passed?: boolean;
}

export interface StepRow {
  idx: number; parentIdx: number | null; type: string;
  name?: string; input?: string; output?: string; status: string;
  startedAt?: string; endedAt?: string; durationMs?: number;
  tokenInput?: number; tokenOutput?: number;
}
