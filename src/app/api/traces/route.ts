import { NextResponse } from "next/server";
import { listTraces, listAgents } from "@/lib/repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const page = Math.max(1, Number(u.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(u.searchParams.get("pageSize") ?? 20)));
  const passed = u.searchParams.get("passed");
  const { items, total } = listTraces({
    q: u.searchParams.get("q")?.trim() || undefined,
    status: u.searchParams.get("status") || undefined,
    agent: u.searchParams.get("agent") || undefined,
    tag: u.searchParams.get("tag") || undefined,
    passed: passed === "pass" || passed === "fail" ? passed : undefined,
    page, pageSize,
  });
  return NextResponse.json({ items, total, page, pageSize, agents: listAgents() });
}
