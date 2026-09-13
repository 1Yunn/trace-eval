import { NextResponse } from "next/server";
import { parseTraceFile } from "@/lib/parse";
import { normalizeTrace } from "@/lib/normalize";
import { getTraceIdByExternalId, insertImportAndTraces } from "@/lib/repo";
import {
  getDefaultRubric, hasReferenceEvaluation, insertReferenceEvaluation,
} from "@/lib/repo-rubric";
import { JudgeOutputSchema } from "@/lib/schema";
import { adviseTrace } from "@/lib/advice";
import type { JudgeOutput, NormalizedTrace } from "@/lib/types";

export const runtime = "nodejs";

const AUTO_ADVICE_LABEL = "自动诊断建议（离线规则）";

/**
 * 导入后挂载「修复建议」评分（不经过 LLM，幂等）：
 * 1) 记录自带 demoEvaluation 的样例文件：使用文件内置的参考评分；
 * 2) 其它失败轨迹：用离线规则按错误模式自动生成诊断建议；
 * 3) 成功轨迹不生成。已存在参考评分的轨迹跳过。
 */
function attachReferenceEvaluations(
  entries: { raw: unknown; normalized: NormalizedTrace }[],
): number {
  let attached = 0;
  for (const e of entries) {
    const extId = e.normalized.externalId;
    if (!extId) continue;
    const raw = e.raw;
    const bundled = raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).demoEvaluation
      : undefined;

    let output: JudgeOutput | null = null;
    let label = AUTO_ADVICE_LABEL;
    if (bundled && typeof bundled === "object") {
      const parsed = JudgeOutputSchema.safeParse(bundled);
      if (parsed.success) {
        output = parsed.data;
        label = typeof (bundled as Record<string, unknown>).model === "string"
          ? (bundled as Record<string, unknown>).model as string
          : "参考评分（样例）";
      }
    } else {
      const hasFailure = e.normalized.status === "error"
        || e.normalized.steps.some((s) => s.status === "error");
      if (hasFailure) output = adviseTrace(e.normalized);
    }
    if (!output) continue;

    const traceId = getTraceIdByExternalId(extId);
    if (!traceId || hasReferenceEvaluation(traceId)) continue;
    insertReferenceEvaluation(traceId, getDefaultRubric(), output, label);
    attached++;
  }
  return attached;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "未选择文件" }, { status: 400 });
  }

  const reports = [];
  for (const file of files) {
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "json" && ext !== "jsonl") {
      return NextResponse.json(
        { error: `不支持的文件类型: ${file.name}（仅 .json / .jsonl）` },
        { status: 400 },
      );
    }
    const text = await file.text();
    const parsed = parseTraceFile(file.name, text);
    const entries = [];
    const errors = [...parsed.errors];
    for (const rec of parsed.records) {
      const n = normalizeTrace(rec.value);
      if (n.ok) entries.push({ raw: rec.value, normalized: n.value });
      else errors.push({ line: rec.line, reason: n.error });
    }
    const report = insertImportAndTraces(file.name, ext, entries, errors.slice(0, 200));
    const referenceEvaluations = attachReferenceEvaluations(entries);
    reports.push({ ...report, referenceEvaluations });
  }
  return NextResponse.json({ reports });
}
