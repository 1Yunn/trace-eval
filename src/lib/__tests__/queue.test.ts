import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.TRACEEVAL_DB_PATH = join(tmpdir(), `trace-eval-queue-${process.pid}-${Date.now()}.db`);
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_BASE_URL = "http://local";
process.env.OPENAI_MODEL = "mock-model";

import { AsyncQueue, runEvaluation } from "@/lib/queue";
import { insertImportAndTraces } from "@/lib/repo";
import { normalizeTrace } from "@/lib/normalize";
import {
  createEvaluationBatch, getEvaluation,
} from "@/lib/repo-rubric";
import { getDefaultRubric } from "@/lib/repo-rubric";
import { DEFAULT_RUBRIC_DRAFT } from "@/lib/rubric-defaults";
import type { JudgeModelClient } from "@/lib/scoring/judge";

const seed = () => {
  const r = normalizeTrace({ input: "队列任务", steps: [{ type: "thought", content: "嗯" }] });
  if (!r.ok) throw new Error(r.error);
  const rep = insertImportAndTraces("q.json", "json", [{ raw: {}, normalized: r.value }], []);
  return rep;
};

const fakeClient = (fail = false): JudgeModelClient => ({
  model: "mock-model",
  async chat() {
    if (fail) throw Object.assign(new Error("boom"), { status: 500 });
    return {
      content: JSON.stringify({
        scores: DEFAULT_RUBRIC_DRAFT.dimensions.map((d) => ({ dimension_key: d.key, score: 5, rationale: "好" })),
        overall_score: 1, passed: false, summary: "不错", issues: [],
      }),
    };
  },
});

describe("AsyncQueue", () => {
  it("runs tasks with bounded concurrency", async () => {
    let active = 0; let max = 0;
    const q = new AsyncQueue(2);
    const mk = () => new Promise<void>((resolve) => {
      q.enqueue(async () => {
        active++; max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 20));
        active--; resolve();
      });
    });
    await Promise.all([mk(), mk(), mk(), mk()]);
    expect(max).toBeLessThanOrEqual(2);
  });
});

describe("runEvaluation", () => {
  it("saves success with scores via injected client", async () => {
    seed();
    const rubric = getDefaultRubric();
    const { listTraces } = await import("@/lib/repo");
    const traceId = listTraces({ page: 1, pageSize: 1 }).items[0].id;
    const [id] = createEvaluationBatch("b-q-1", [traceId], rubric.id, "mock-model");
    await runEvaluation(id, fakeClient());
    const row = getEvaluation(id)!;
    expect(row.status).toBe("success");
    expect(row.overallScore).toBe(5);
    expect(row.passed).toBe(true);
  });

  it("marks error when judge fails", async () => {
    const { listTraces } = await import("@/lib/repo");
    const traceId = listTraces({ page: 1, pageSize: 10 }).items[0].id;
    const [id] = createEvaluationBatch("b-q-2", [traceId], getDefaultRubric().id, "mock-model");
    await runEvaluation(id, fakeClient(true));
    expect(getEvaluation(id)?.status).toBe("error");
  });
});
