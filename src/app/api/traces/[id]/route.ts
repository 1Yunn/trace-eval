import { NextResponse } from "next/server";
import { getTraceDetail } from "@/lib/repo";
import { listEvaluationDetailsByTrace } from "@/lib/repo-rubric";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = getTraceDetail(id);
  if (!detail) return NextResponse.json({ error: "轨迹不存在" }, { status: 404 });
  return NextResponse.json({ ...detail, evaluations: listEvaluationDetailsByTrace(id) });
}
