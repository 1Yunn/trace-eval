import { NextResponse } from "next/server";
import { newId } from "@/lib/db";
import { getJudgeConfig } from "@/lib/config";
import { createEvaluationBatch, getBatchStatus, getRubric } from "@/lib/repo-rubric";
import { enqueueBatch } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const batchId = new URL(req.url).searchParams.get("batchId");
  if (!batchId) return NextResponse.json({ error: "缺少 batchId" }, { status: 400 });
  return NextResponse.json(getBatchStatus(batchId));
}

export async function POST(req: Request) {
  const body = (await req.json()) as { traceIds?: string[]; rubricId?: string };
  const traceIds = Array.isArray(body.traceIds) ? body.traceIds.filter((x) => typeof x === "string") : [];
  if (traceIds.length === 0) return NextResponse.json({ error: "未选择轨迹" }, { status: 400 });
  if (!body.rubricId || !getRubric(body.rubricId)) {
    return NextResponse.json({ error: "评分标准不存在" }, { status: 400 });
  }
  const cfg = getJudgeConfig();
  if (!cfg.baseURL || !cfg.apiKey || !cfg.model) {
    return NextResponse.json({ error: "尚未配置裁判模型，请先到设置页填写", code: "NO_CONFIG" }, { status: 400 });
  }
  const batchId = newId();
  const ids = createEvaluationBatch(batchId, traceIds, body.rubricId, cfg.model);
  enqueueBatch(ids);
  return NextResponse.json({ batchId });
}
