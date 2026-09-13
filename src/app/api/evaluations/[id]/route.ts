import { NextResponse } from "next/server";
import { newId } from "@/lib/db";
import { createEvaluationBatch } from "@/lib/repo-rubric";
import { enqueueBatch } from "@/lib/queue";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { getEvaluation } = await import("@/lib/repo-rubric");
  const prev = getEvaluation(id);
  if (!prev) return NextResponse.json({ error: "评分记录不存在" }, { status: 404 });
  const batchId = newId();
  const [newId2] = createEvaluationBatch(batchId, [prev.traceId], prev.rubricId, prev.model);
  enqueueBatch([newId2]);
  return NextResponse.json({ batchId, evaluationId: newId2 });
}
