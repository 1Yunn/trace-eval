import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.TRACEEVAL_DB_PATH = join(tmpdir(), `trace-eval-rub-${process.pid}-${Date.now()}.db`);

import {
  getDefaultRubric, listRubrics, createRubric, setDefaultRubric,
  createEvaluationBatch, getBatchStatus, markEvaluationRunning,
  saveEvaluationSuccess, saveEvaluationError, resetRunningEvaluations, getEvaluation,
} from "@/lib/repo-rubric";
import { insertImportAndTraces, listTraces } from "@/lib/repo";
import { normalizeTrace } from "@/lib/normalize";
import { DEFAULT_RUBRIC_DRAFT, DEFAULT_PROMPT_TEMPLATE } from "@/lib/rubric-defaults";

const seedTrace = () => {
  const r = normalizeTrace({ input: "仓储测试任务" });
  if (!r.ok) throw new Error(r.error);
  const rep = insertImportAndTraces("z.json", "json", [{ raw: {}, normalized: r.value }], []);
  return rep.succeeded === 1;
};

describe("rubric repository", () => {
  it("seeds default rubric once and creates new versions", () => {
    const d = getDefaultRubric();
    expect(d.dimensions).toHaveLength(5);
    expect(getDefaultRubric().id).toBe(d.id);
    const d2 = createRubric({
      name: DEFAULT_RUBRIC_DRAFT.name,
      dimensions: DEFAULT_RUBRIC_DRAFT.dimensions,
      passThreshold: 3.5,
      promptTemplate: DEFAULT_PROMPT_TEMPLATE,
      makeDefault: false,
    });
    expect(d2.version).toBe(2);
    expect(listRubrics().filter((r) => r.name === DEFAULT_RUBRIC_DRAFT.name)).toHaveLength(2);
    setDefaultRubric(d2.id);
    expect(getDefaultRubric().id).toBe(d2.id);
  });
});

describe("evaluation repository", () => {
  it("creates batch, transitions status and aggregates", () => {
    seedTrace();
    const rubric = getDefaultRubric();
    const traceId = listTraces({ page: 1, pageSize: 1 }).items[0].id;
    const ids = createEvaluationBatch("batch-1", [traceId], rubric.id, "judge-model");
    expect(ids).toHaveLength(1);
    // toEqual 会因 getBatchStatus 按计划返回的 items（整批重试依赖）而判失败，
    // 故用 toMatchObject 仅校验计数（计划缺陷的最小修正，items 必须保留）。
    expect(getBatchStatus("batch-1")).toMatchObject({ total: 1, pending: 1, running: 0, success: 0, error: 0 });

    markEvaluationRunning(ids[0]);
    expect(getBatchStatus("batch-1").running).toBe(1);
    saveEvaluationSuccess(ids[0], {
      output: {
        scores: rubric.dimensions.map((d) => ({ dimension_key: d.key, score: 5, rationale: "ok" })),
        overall_score: 5, passed: true, summary: "好",
        issues: [{ step_idx: null, severity: "low", dimension_key: "safety", message: "x" }],
      },
      raw: "{}", latencyMs: 120, tokenInput: 10, tokenOutput: 5,
      passThreshold: rubric.passThreshold,
    });
    expect(getEvaluation(ids[0])?.passed).toBe(true);

    const ids2 = createEvaluationBatch("batch-2", [traceId], rubric.id, "judge-model");
    markEvaluationRunning(ids2[0]);
    expect(resetRunningEvaluations()).toBe(1);
    expect(getEvaluation(ids2[0])?.status).toBe("error");
    saveEvaluationError(ids2[0], "再次失败");
    expect(getEvaluation(ids2[0])?.error).toContain("再次失败");
  });
});
