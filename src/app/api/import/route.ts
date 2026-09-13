import { NextResponse } from "next/server";
import { parseTraceFile } from "@/lib/parse";
import { normalizeTrace } from "@/lib/normalize";
import { insertImportAndTraces } from "@/lib/repo";

export const runtime = "nodejs";

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
    reports.push(insertImportAndTraces(file.name, ext, entries, errors.slice(0, 200)));
  }
  return NextResponse.json({ reports });
}
