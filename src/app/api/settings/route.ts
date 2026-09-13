import { NextResponse } from "next/server";
import { getJudgeConfig, maskKey, saveJudgeConfig } from "@/lib/config";
import type { JudgeConfig } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const cfg = getJudgeConfig();
  return NextResponse.json({
    baseURL: cfg.baseURL, model: cfg.model, concurrency: cfg.concurrency,
    apiKey: cfg.apiKey ? maskKey(cfg.apiKey) : "", hasApiKey: !!cfg.apiKey,
  });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<JudgeConfig>;
  const current = getJudgeConfig();
  const next: JudgeConfig = {
    baseURL: (body.baseURL ?? current.baseURL).trim(),
    apiKey: body.apiKey && !body.apiKey.includes("****") ? body.apiKey.trim() : current.apiKey,
    model: (body.model ?? current.model).trim(),
    concurrency: Number(body.concurrency ?? current.concurrency) || 2,
  };
  saveJudgeConfig(next);
  return NextResponse.json({ ok: true });
}
