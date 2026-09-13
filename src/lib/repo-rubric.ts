import { db, newId } from "./db";
import {
  DEFAULT_PROMPT_TEMPLATE, DEFAULT_RUBRIC_DRAFT, LEGACY_DEFAULT_RUBRIC_NAME,
} from "./rubric-defaults";
import { weightedScore } from "./scoring/weight";
import type { JudgeOutput, Rubric, RubricDimension } from "./types";

export interface EvaluationRow {
  id: string; batchId: string; traceId: string; rubricId: string;
  model: string; status: string; overallScore?: number; passed?: boolean;
  summary?: string; issues: unknown[]; error?: string;
  tokenInput?: number; tokenOutput?: number; latencyMs?: number; createdAt: string;
}

function mapRubric(r: Record<string, unknown>): Rubric {
  return {
    id: r.id as string, name: r.name as string, version: Number(r.version),
    dimensions: JSON.parse(r.dimensions_json as string),
    passThreshold: Number(r.pass_threshold), promptTemplate: r.prompt_template as string,
    isDefault: !!r.is_default, createdAt: r.created_at as string,
  };
}

export function listRubrics(): Rubric[] {
  return (db.prepare("SELECT * FROM rubrics ORDER BY created_at DESC, rowid DESC").all() as Record<string, unknown>[]).map(mapRubric);
}

export function getRubric(id: string): Rubric | null {
  const r = db.prepare("SELECT * FROM rubrics WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? mapRubric(r) : null;
}

export function createRubric(input: {
  name: string; dimensions: RubricDimension[]; passThreshold: number;
  promptTemplate: string; makeDefault: boolean;
}): Rubric {
  const versionRow = db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM rubrics WHERE name = ?").get(input.name) as { v: number };
  const id = newId();
  const createdAt = new Date().toISOString();
  const tx = db.transaction(() => {
    if (input.makeDefault) db.prepare("UPDATE rubrics SET is_default = 0 WHERE is_default = 1").run();
    db.prepare(
      `INSERT INTO rubrics (id, name, version, dimensions_json, pass_threshold, prompt_template, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.name, versionRow.v + 1, JSON.stringify(input.dimensions),
      input.passThreshold, input.promptTemplate, input.makeDefault ? 1 : 0, createdAt);
  });
  tx();
  return getRubric(id)!;
}

export function setDefaultRubric(id: string): void {
  const tx = db.transaction(() => {
    db.prepare("UPDATE rubrics SET is_default = 0 WHERE is_default = 1").run();
    db.prepare("UPDATE rubrics SET is_default = 1 WHERE id = ?").run(id);
  });
  tx();
}

let seeded = false;
export function getDefaultRubric(): Rubric {
  if (!seeded) {
    // 旧库：把已播种的内置 v1 rubric 原地升级为含「修复建议」的 v2 模板（保持 id 与历史评分关联不变，幂等）。
    db.prepare(
      `UPDATE rubrics
         SET name = ?, prompt_template = ?, version = version + 1
       WHERE is_default = 1 AND name = ?`,
    ).run(DEFAULT_RUBRIC_DRAFT.name, DEFAULT_PROMPT_TEMPLATE, LEGACY_DEFAULT_RUBRIC_NAME);

    const existing = db.prepare("SELECT id FROM rubrics WHERE is_default = 1 LIMIT 1").get() as { id: string } | undefined;
    if (!existing) {
      const anyRow = db.prepare("SELECT id FROM rubrics LIMIT 1").get() as { id: string } | undefined;
      if (!anyRow) {
        createRubric({
          name: DEFAULT_RUBRIC_DRAFT.name, dimensions: [...DEFAULT_RUBRIC_DRAFT.dimensions],
          passThreshold: DEFAULT_RUBRIC_DRAFT.passThreshold,
          promptTemplate: DEFAULT_PROMPT_TEMPLATE, makeDefault: true,
        });
      }
    }
    seeded = true;
  }
  const r = db.prepare("SELECT * FROM rubrics WHERE is_default = 1 ORDER BY version DESC LIMIT 1").get() as Record<string, unknown>;
  return mapRubric(r);
}

export function createEvaluationBatch(
  batchId: string, traceIds: string[], rubricId: string, model: string,
): string[] {
  const createdAt = new Date().toISOString();
  const ids: string[] = [];
  const ins = db.prepare(
    `INSERT INTO evaluations (id, batch_id, trace_id, rubric_id, model, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
  );
  const tx = db.transaction(() => {
    for (const traceId of traceIds) {
      const id = newId();
      ins.run(id, batchId, traceId, rubricId, model, createdAt);
      ids.push(id);
    }
  });
  tx();
  return ids;
}

export function getBatchStatus(batchId: string) {
  const row = db.prepare(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) AS running,
      SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success,
      SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS error
     FROM evaluations WHERE batch_id = ?`,
  ).get(batchId) as Record<string, number>;
  const items = (db.prepare(
    "SELECT id, trace_id, status, error FROM evaluations WHERE batch_id = ? ORDER BY rowid",
  ).all(batchId) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, traceId: r.trace_id as string, status: r.status as string,
    error: (r.error as string) ?? null,
  }));
  return {
    total: Number(row.total), pending: Number(row.pending), running: Number(row.running),
    success: Number(row.success), error: Number(row.error), items,
  };
}

export function listEvaluationIdsByBatch(batchId: string): string[] {
  return (db.prepare("SELECT id FROM evaluations WHERE batch_id = ? ORDER BY rowid").all(batchId) as { id: string }[]).map((r) => r.id);
}

function mapEval(r: Record<string, unknown>): EvaluationRow {
  return {
    id: r.id as string, batchId: r.batch_id as string, traceId: r.trace_id as string,
    rubricId: r.rubric_id as string, model: r.model as string, status: r.status as string,
    overallScore: r.overall_score === null ? undefined : Number(r.overall_score),
    passed: r.passed === null ? undefined : !!r.passed,
    summary: (r.summary as string) ?? undefined,
    issues: JSON.parse((r.issues_json as string) || "[]"),
    error: (r.error as string) ?? undefined,
    tokenInput: r.token_input === null ? undefined : Number(r.token_input),
    tokenOutput: r.token_output === null ? undefined : Number(r.token_output),
    latencyMs: r.latency_ms === null ? undefined : Number(r.latency_ms),
    createdAt: r.created_at as string,
  };
}

export function getEvaluation(id: string): EvaluationRow | null {
  const r = db.prepare("SELECT * FROM evaluations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? mapEval(r) : null;
}

export function listEvaluationsByTrace(traceId: string): EvaluationRow[] {
  return (db.prepare("SELECT * FROM evaluations WHERE trace_id = ? ORDER BY created_at DESC, rowid DESC").all(traceId) as Record<string, unknown>[]).map(mapEval);
}

export function markEvaluationRunning(id: string): void {
  db.prepare("UPDATE evaluations SET status='running' WHERE id=?").run(id);
}

export function saveEvaluationSuccess(
  id: string,
  data: { output: JudgeOutput; raw: string; latencyMs: number; tokenInput?: number; tokenOutput?: number; passThreshold: number },
): void {
  const { output } = data;
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE evaluations SET status='success', overall_score=?, passed=?, summary=?,
         issues_json=?, judge_raw=?, latency_ms=?, token_input=?, token_output=?, error=NULL WHERE id=?`,
    ).run(
      output.overall_score, output.overall_score >= data.passThreshold ? 1 : 0,
      output.summary, JSON.stringify(output.issues), data.raw, data.latencyMs,
      data.tokenInput ?? null, data.tokenOutput ?? null, id,
    );
    db.prepare("DELETE FROM eval_scores WHERE evaluation_id=?").run(id);
    const ins = db.prepare(
      "INSERT INTO eval_scores (id, evaluation_id, dimension_key, score, rationale) VALUES (?, ?, ?, ?, ?)",
    );
    for (const s of output.scores) ins.run(newId(), id, s.dimension_key, s.score, s.rationale);
  });
  tx();
}

export function saveEvaluationError(id: string, error: string, raw?: string): void {
  db.prepare("UPDATE evaluations SET status='error', error=?, judge_raw=COALESCE(?, judge_raw) WHERE id=?")
    .run(error, raw ?? null, id);
}

/**
 * 为样例轨迹写入一条随导入文件附带的「参考评分」（不经过 LLM），
 * 用于演示与离线走查；总分服务端按 rubric 权重重算，通过结论按通过线判定。
 */
export function insertReferenceEvaluation(
  traceId: string,
  rubric: Rubric,
  output: JudgeOutput,
  modelLabel: string,
): string {
  const id = newId();
  const now = new Date().toISOString();
  const scoreMap = Object.fromEntries(output.scores.map((s) => [s.dimension_key, s.score]));
  const overall = weightedScore(rubric.dimensions, scoreMap);
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO evaluations
         (id, batch_id, trace_id, rubric_id, model, status, overall_score, passed,
          summary, issues_json, judge_raw, latency_ms, created_at)
       VALUES (?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      id, `ref-${id}`, traceId, rubric.id, modelLabel,
      overall, overall >= rubric.passThreshold ? 1 : 0,
      output.summary, JSON.stringify(output.issues), JSON.stringify(output), now,
    );
    const ins = db.prepare(
      "INSERT INTO eval_scores (id, evaluation_id, dimension_key, score, rationale) VALUES (?, ?, ?, ?, ?)",
    );
    for (const s of output.scores) ins.run(newId(), id, s.dimension_key, s.score, s.rationale);
  });
  tx();
  return id;
}

export function hasReferenceEvaluation(traceId: string): boolean {
  const r = db.prepare(
    "SELECT 1 FROM evaluations WHERE trace_id = ? AND batch_id LIKE 'ref-%' LIMIT 1",
  ).get(traceId);
  return r !== undefined;
}

export function resetRunningEvaluations(): number {
  const info = db.prepare(
    "UPDATE evaluations SET status='error', error='服务重启，任务中断' WHERE status='running'",
  ).run();
  return info.changes;
}

export interface EvalScoreRow { dimensionKey: string; score: number; rationale: string; }
export interface EvaluationDetail extends EvaluationRow { scores: EvalScoreRow[] }

function attachScores(row: Record<string, unknown>): EvaluationDetail {
  const base = mapEval(row);
  const scores = (db.prepare(
    "SELECT dimension_key, score, rationale FROM eval_scores WHERE evaluation_id = ? ORDER BY rowid",
  ).all(row.id) as Record<string, unknown>[]).map((s) => ({
    dimensionKey: s.dimension_key as string,
    score: Number(s.score),
    rationale: s.rationale as string,
  }));
  return { ...base, scores };
}

export function getEvaluationDetail(id: string): EvaluationDetail | null {
  const r = db.prepare("SELECT * FROM evaluations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? attachScores(r) : null;
}

export function listEvaluationDetailsByTrace(traceId: string): EvaluationDetail[] {
  const rows = db.prepare(
    "SELECT * FROM evaluations WHERE trace_id = ? ORDER BY created_at DESC, rowid DESC",
  ).all(traceId) as Record<string, unknown>[];
  return rows.map(attachScores);
}
