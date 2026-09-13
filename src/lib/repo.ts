import { db, newId } from "./db";
import { computeDurationMs } from "./normalize";
import { contentHash } from "./dedupe";
import type { NormalizedTrace, StepType } from "./types";

export interface LineError { line: number | null; reason: string; }
export interface StepRow {
  idx: number; parentIdx: number | null; type: StepType | "custom";
  name?: string; input?: string; output?: string; status: string;
  startedAt?: string; endedAt?: string; durationMs?: number;
  tokenInput?: number; tokenOutput?: number;
}
export interface TraceListItem {
  id: string; externalId?: string; agent?: string; model?: string;
  input: string; output?: string; status: string;
  startedAt?: string; endedAt?: string; durationMs?: number;
  tags: string[]; tokenInput?: number; tokenOutput?: number;
  stepCount: number; createdAt: string;
  overallScore?: number; passed?: boolean;
}
export interface TraceDetail { trace: TraceListItem; steps: StepRow[]; }
export interface ImportReport {
  id: string; filename: string; format: string;
  total: number; succeeded: number; skipped: number; failed: number;
  errors: LineError[]; importedAt: string;
}

const LATEST_EVAL = `LEFT JOIN evaluations le ON le.id = (
  SELECT id FROM evaluations WHERE trace_id = t.id AND status = 'success'
  ORDER BY created_at DESC, rowid DESC LIMIT 1
)`;

export function findTraceId(externalId: string | undefined, hash: string): string | undefined {
  if (externalId) {
    const r = db.prepare("SELECT id FROM traces WHERE external_id = ? LIMIT 1").get(externalId) as { id: string } | undefined;
    if (r) return r.id;
  }
  const r = db.prepare("SELECT id FROM traces WHERE content_hash = ? LIMIT 1").get(hash) as { id: string } | undefined;
  return r?.id;
}

interface Entry { raw: unknown; normalized: NormalizedTrace }

export function insertImportAndTraces(
  filename: string, format: string, entries: Entry[], parseErrors: LineError[],
): ImportReport {
  const importId = newId();
  const importedAt = new Date().toISOString();
  let succeeded = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    // traces.import_id 引用 imports，但 imports 汇总行在本事务末尾才写入，
    // 因此将外键检查延迟到事务提交时（该 pragma 仅在事务内有效）。
    db.pragma("defer_foreign_keys = ON");
    for (const { raw, normalized } of entries) {
      const hash = contentHash(normalized);
      if (findTraceId(normalized.externalId, hash)) {
        skipped++;
        continue;
      }
      const traceId = newId();
      const durationMs = computeDurationMs(normalized.startedAt, normalized.endedAt);
      db.prepare(
        `INSERT INTO traces (id, import_id, external_id, content_hash, agent, model,
          input, output, status, started_at, ended_at, duration_ms, tags_json,
          metadata_json, token_input, token_output, raw, created_at)
         VALUES (@id, @import_id, @external_id, @content_hash, @agent, @model,
          @input, @output, @status, @started_at, @ended_at, @duration_ms, @tags_json,
          @metadata_json, @token_input, @token_output, @raw, @created_at)`,
      ).run({
        id: traceId, import_id: importId, external_id: normalized.externalId ?? null,
        content_hash: hash, agent: normalized.agent ?? null, model: normalized.model ?? null,
        input: normalized.input, output: normalized.output ?? null, status: normalized.status,
        started_at: normalized.startedAt ?? null, ended_at: normalized.endedAt ?? null,
        duration_ms: durationMs ?? null, tags_json: JSON.stringify(normalized.tags),
        metadata_json: JSON.stringify(normalized.metadata),
        token_input: normalized.tokenInput ?? null, token_output: normalized.tokenOutput ?? null,
        raw: JSON.stringify(raw), created_at: importedAt,
      });

      const idToIdx = new Map<string, number>();
      normalized.steps.forEach((s, i) => { if (s.externalId) idToIdx.set(s.externalId, i); });
      const insStep = db.prepare(
        `INSERT INTO steps (id, trace_id, idx, parent_idx, type, name, input, output,
          status, started_at, ended_at, duration_ms, token_input, token_output, raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      normalized.steps.forEach((s, idx) => {
        insStep.run(
          newId(), traceId, idx,
          s.parentExternalId && idToIdx.has(s.parentExternalId) ? idToIdx.get(s.parentExternalId)! : null,
          s.type, s.name ?? null, s.input ?? null, s.output ?? null, s.status,
          s.startedAt ?? null, s.endedAt ?? null,
          computeDurationMs(s.startedAt, s.endedAt) ?? null,
          s.tokenInput ?? null, s.tokenOutput ?? null, JSON.stringify(s),
        );
      });
      succeeded++;
    }

    db.prepare(
      `INSERT INTO imports (id, filename, format, total, succeeded, skipped, failed, errors_json, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      importId, filename, format, entries.length + parseErrors.length,
      succeeded, skipped, parseErrors.length, JSON.stringify(parseErrors.slice(0, 200)), importedAt,
    );
  });
  tx();

  return {
    id: importId, filename, format, total: entries.length + parseErrors.length,
    succeeded, skipped, failed: parseErrors.length,
    errors: parseErrors.slice(0, 200), importedAt,
  };
}

function mapTraceRow(r: Record<string, unknown>): TraceListItem {
  return {
    id: r.id as string, externalId: (r.external_id as string) ?? undefined,
    agent: (r.agent as string) ?? undefined, model: (r.model as string) ?? undefined,
    input: r.input as string, output: (r.output as string) ?? undefined,
    status: r.status as string, startedAt: (r.started_at as string) ?? undefined,
    endedAt: (r.ended_at as string) ?? undefined, durationMs: (r.duration_ms as number) ?? undefined,
    tags: JSON.parse((r.tags_json as string) ?? "[]"),
    tokenInput: (r.token_input as number) ?? undefined,
    tokenOutput: (r.token_output as number) ?? undefined,
    stepCount: Number(r.step_count ?? 0), createdAt: r.created_at as string,
    overallScore: r.overall_score === null || r.overall_score === undefined ? undefined : Number(r.overall_score),
    passed: r.passed === null || r.passed === undefined ? undefined : !!r.passed,
  };
}

export interface ListParams {
  q?: string; status?: string; agent?: string; tag?: string;
  passed?: "pass" | "fail"; page: number; pageSize: number;
}

function buildWhere(p: ListParams): { clause: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (p.status) { conds.push("t.status = ?"); params.push(p.status); }
  if (p.agent) { conds.push("t.agent = ?"); params.push(p.agent); }
  if (p.tag) { conds.push("EXISTS (SELECT 1 FROM json_each(t.tags_json) WHERE value = ?)"); params.push(p.tag); }
  if (p.q) {
    const phrase = `"${p.q.replace(/"/g, '""')}"`;
    // FTS5 unicode61 把连续 CJK 汉字视为单个 token，短语无法命中子串，
    // 因此追加 LIKE 兜底（% _ \ 已转义）。
    conds.push(
      "(t.id IN (SELECT trace_id FROM traces_fts WHERE traces_fts MATCH ?) OR t.input LIKE ? ESCAPE '\\')",
    );
    const like = `%${p.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(phrase, like);
  }
  if (p.passed) { conds.push("le.passed = ?"); params.push(p.passed === "pass" ? 1 : 0); }
  return { clause: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

export function listTraces(p: ListParams): { items: TraceListItem[]; total: number } {
  const { clause, params } = buildWhere(p);
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM traces t ${LATEST_EVAL} ${clause}`).get(...params) as { c: number }).c;
  const offset = (p.page - 1) * p.pageSize;
  const rows = db.prepare(
    `SELECT t.*, le.overall_score, le.passed,
       (SELECT COUNT(*) FROM steps WHERE trace_id = t.id) AS step_count
     FROM traces t ${LATEST_EVAL} ${clause}
     ORDER BY t.created_at DESC, t.rowid DESC LIMIT ? OFFSET ?`,
  ).all(...params, p.pageSize, offset) as Record<string, unknown>[];
  return { items: rows.map(mapTraceRow), total };
}

export function getTraceDetail(id: string): TraceDetail | null {
  const row = db.prepare("SELECT t.* FROM traces t WHERE t.id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const stepRows = db.prepare(
    `SELECT idx, parent_idx, type, name, input, output, status, started_at, ended_at,
            duration_ms, token_input, token_output
     FROM steps WHERE trace_id = ? ORDER BY idx`,
  ).all(id) as Record<string, unknown>[];
  return {
    trace: { ...mapTraceRow({ ...row, step_count: stepRows.length }) },
    steps: stepRows.map((s) => ({
      idx: Number(s.idx), parentIdx: (s.parent_idx as number | null) ?? null,
      type: s.type as StepRow["type"], name: (s.name as string) ?? undefined,
      input: (s.input as string) ?? undefined, output: (s.output as string) ?? undefined,
      status: s.status as string, startedAt: (s.started_at as string) ?? undefined,
      endedAt: (s.ended_at as string) ?? undefined, durationMs: (s.duration_ms as number) ?? undefined,
      tokenInput: (s.token_input as number) ?? undefined,
      tokenOutput: (s.token_output as number) ?? undefined,
    })),
  };
}

export function listImports(): ImportReport[] {
  const rows = db.prepare("SELECT * FROM imports ORDER BY imported_at DESC, rowid DESC").all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string, filename: r.filename as string, format: r.format as string,
    total: Number(r.total), succeeded: Number(r.succeeded), skipped: Number(r.skipped),
    failed: Number(r.failed), importedAt: r.imported_at as string,
    errors: JSON.parse((r.errors_json as string) ?? "[]"),
  }));
}

export function listAgents(): string[] {
  const rows = db.prepare("SELECT DISTINCT agent FROM traces WHERE agent IS NOT NULL").all() as { agent: string }[];
  return rows.map((r) => r.agent);
}
