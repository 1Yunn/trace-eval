import { describe, it, expect, beforeAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.TRACEEVAL_DB_PATH = join(tmpdir(), `trace-eval-repo-${process.pid}-${Date.now()}.db`);

import { normalizeTrace } from "@/lib/normalize";
import { contentHash } from "@/lib/dedupe";
import {
  insertImportAndTraces, listTraces, getTraceDetail, findTraceId, listImports,
} from "@/lib/repo";

const mk = (input: string, extra: Record<string, unknown> = {}) => {
  const r = normalizeTrace({ input, ...extra });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

beforeAll(() => {
  // 触发 db 模块迁移即可
});

describe("import + query repository", () => {
  it("inserts traces with steps and reads them back", () => {
    const t1 = mk("读一下文件", {
      agent: "a1", model: "m1", status: "success",
      started_at: 1700000000, ended_at: 1700000003,
      steps: [
        { id: "s1", type: "tool_call", name: "read", arguments: { p: 1 }, status: "success" },
        { type: "tool_result", parent_id: "s1", content: "ok" },
      ],
    });
    const report = insertImportAndTraces("f.jsonl", "jsonl", [{ raw: { input: "读一下文件" }, normalized: t1 }], []);
    expect(report.succeeded).toBe(1);
    expect(report.skipped).toBe(0);

    const list = listTraces({ page: 1, pageSize: 10 });
    expect(list.total).toBe(1);
    expect(list.items[0].stepCount).toBe(2);
    expect(list.items[0].durationMs).toBe(3000);

    const detail = getTraceDetail(list.items[0].id)!;
    expect(detail.steps[1].parentIdx).toBe(0);
  });

  it("skips duplicates by external id and by content hash", () => {
    const t = mk("判重任务", { id: "ext-1" });
    insertImportAndTraces("a.json", "json", [{ raw: { input: "判重任务", id: "ext-1" }, normalized: t }], []);
    const r2 = insertImportAndTraces("b.json", "json", [{ raw: { input: "判重任务", id: "ext-1" }, normalized: t }], []);
    expect(r2.skipped).toBe(1);

    const t2 = mk("无外部ID的任务");
    insertImportAndTraces("c.json", "json", [{ raw: { input: "无外部ID的任务" }, normalized: t2 }], []);
    const r4 = insertImportAndTraces("d.json", "json", [{ raw: { input: "无外部ID的任务" }, normalized: t2 }], []);
    expect(r4.skipped).toBe(1);
  });

  it("counts parse failures into the report", () => {
    const t = mk("正常的一条");
    const r = insertImportAndTraces("e.jsonl", "jsonl", [{ raw: {}, normalized: t }], [{ line: 2, reason: "JSON 解析失败" }]);
    expect(r.failed).toBe(1);
    expect(r.total).toBe(2);
    expect(r.errors[0].line).toBe(2);
  });

  it("searches by FTS and filters by status", () => {
    insertImportAndTraces("g.json", "json", [{ raw: {}, normalized: mk("帮我查明天的天气") }], []);
    expect(listTraces({ q: "天气", page: 1, pageSize: 10 }).total).toBeGreaterThanOrEqual(1);
    expect(listTraces({ status: "unknown", page: 1, pageSize: 100 }).items.length).toBeGreaterThan(0);
  });

  it("lists imports newest first", () => {
    const rows = listImports();
    expect(rows.length).toBeGreaterThan(1);
    expect(new Date(rows[0].importedAt).getTime()).toBeGreaterThanOrEqual(new Date(rows[1].importedAt).getTime());
  });

  it("exposes findTraceId for external id lookup", () => {
    const t = mk("外部ID查询", { id: "ext-lookup" });
    insertImportAndTraces("h.json", "json", [{ raw: {}, normalized: t }], []);
    expect(findTraceId("ext-lookup", contentHash(t))).toBeTruthy();
  });
});
