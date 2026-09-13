import { NextResponse } from "next/server";
import { getRubric, setDefaultRubric } from "@/lib/repo-rubric";

export const runtime = "nodejs";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getRubric(id)) return NextResponse.json({ error: "评分标准不存在" }, { status: 404 });
  setDefaultRubric(id);
  return NextResponse.json({ ok: true });
}
