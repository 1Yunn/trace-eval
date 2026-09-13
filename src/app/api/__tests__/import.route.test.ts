import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.TRACEEVAL_DB_PATH = join(tmpdir(), `trace-eval-importapi-${process.pid}-${Date.now()}.db`);

import { POST } from "@/app/api/import/route";

const makeForm = (filename: string, content: string) => {
  const fd = new FormData();
  const blob = new Blob([content], { type: "application/json" });
  fd.append("files", new File([blob], filename, { type: "application/json" }));
  return fd;
};

describe("POST /api/import", () => {
  it("imports jsonl: success + duplicate skip + bad line failure", async () => {
    const good = JSON.stringify({ input: "接口测试任务", steps: [{ type: "thought", content: "x" }] });
    const dup = good;
    const body = [good, "坏行", dup].join("\n");
    const res = await POST(new Request("http://local/api/import", { method: "POST", body: makeForm("a.jsonl", body) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const r = json.reports[0];
    expect(r.total).toBe(3);
    expect(r.succeeded).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.errors.find((e: { line: number }) => e.line === 2)).toBeTruthy();
  });

  it("rejects unsupported extensions", async () => {
    const res = await POST(new Request("http://local/api/import", { method: "POST", body: makeForm("a.txt", "{}") }));
    expect(res.status).toBe(400);
  });

  it("rejects empty upload", async () => {
    const res = await POST(new Request("http://local/api/import", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });
});
