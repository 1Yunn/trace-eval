import { NextResponse } from "next/server";
import { getTraceDetail } from "@/lib/repo";
import { listEvaluationDetailsByTrace } from "@/lib/repo-rubric";
import { seedIfEmpty } from "@/lib/seed";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await seedIfEmpty();
    const { id } = await params;
    const detail = getTraceDetail(id);
    if (!detail) return NextResponse.json({ error: "轨迹不存在" }, { status: 404 });
    return NextResponse.json({ ...detail, evaluations: listEvaluationDetailsByTrace(id) });
  } catch (err) {
    // 冷启动瞬时异常（SQLite 锁竞争等）：返回 503 让前端自动重试，而非 500 堆栈。
    console.error("[trace detail] transient failure:", err);
    return NextResponse.json({ error: "服务暂时不可用，请重试" }, { status: 503 });
  }
}
