import { getJudgeConfig } from "./config";
import {
  getEvaluation, getRubric, markEvaluationRunning,
  saveEvaluationError, saveEvaluationSuccess,
} from "./repo-rubric";
import { getTraceDetail } from "./repo";
import { createOpenAIClient, scoreOne, type JudgeModelClient } from "./scoring/judge";

export class AsyncQueue {
  private active = 0;
  private pending: Array<() => Promise<void>> = [];
  constructor(private concurrency = 2) {}

  setConcurrency(n: number) {
    this.concurrency = Math.max(1, n);
    this.pump();
  }

  enqueue(task: () => Promise<void>) {
    this.pending.push(task);
    this.pump();
  }

  private pump() {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift()!;
      this.active++;
      void task().finally(() => {
        this.active--;
        this.pump();
      });
    }
  }
}

export const judgeQueue = new AsyncQueue(getJudgeConfig().concurrency);

export async function runEvaluation(
  evaluationId: string,
  client?: JudgeModelClient,
): Promise<void> {
  const evalRow = getEvaluation(evaluationId);
  if (!evalRow) return;
  const rubric = getRubric(evalRow.rubricId);
  const detail = getTraceDetail(evalRow.traceId);
  if (!rubric || !detail) {
    saveEvaluationError(evaluationId, "评分标准或轨迹缺失");
    return;
  }
  markEvaluationRunning(evaluationId);
  const started = Date.now();
  try {
    const judge = client ?? createOpenAIClient({
      baseURL: getJudgeConfig().baseURL,
      apiKey: getJudgeConfig().apiKey,
      model: evalRow.model,
    });
    const result = await scoreOne(judge, rubric, detail);
    saveEvaluationSuccess(evaluationId, {
      output: result.output,
      raw: result.raw,
      latencyMs: Date.now() - started,
      tokenInput: result.tokenInput,
      tokenOutput: result.tokenOutput,
      passThreshold: rubric.passThreshold,
    });
  } catch (e) {
    saveEvaluationError(evaluationId, (e as Error).message);
  }
}

export function enqueueBatch(evaluationIds: string[]) {
  for (const id of evaluationIds) judgeQueue.enqueue(() => runEvaluation(id));
}
