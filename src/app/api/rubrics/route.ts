import { NextResponse } from "next/server";
import { createRubric, getDefaultRubric, listRubrics } from "@/lib/repo-rubric";
import { validateWeights } from "@/lib/scoring/weight";
import type { RubricDimension } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  // 幂等：首次访问时播种内置默认 rubric（列表页弹窗与详情页面板都依赖该列表）
  getDefaultRubric();
  return NextResponse.json({ items: listRubrics() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string; dimensions?: RubricDimension[];
    passThreshold?: number; promptTemplate?: string; makeDefault?: boolean;
  };
  if (!body.name?.trim()) return NextResponse.json({ error: "名称必填" }, { status: 400 });
  if (!Array.isArray(body.dimensions) || body.dimensions.length === 0) {
    return NextResponse.json({ error: "至少一个维度" }, { status: 400 });
  }
  if (!validateWeights(body.dimensions)) {
    return NextResponse.json({ error: "维度权重之和必须为 1（误差 ±0.01）" }, { status: 400 });
  }
  const rubric = createRubric({
    name: body.name.trim(),
    dimensions: body.dimensions,
    passThreshold: Number(body.passThreshold ?? 4),
    promptTemplate: body.promptTemplate ?? "",
    makeDefault: !!body.makeDefault,
  });
  return NextResponse.json({ item: rubric });
}
