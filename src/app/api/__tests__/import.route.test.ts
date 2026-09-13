import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.TRACEEVAL_DB_PATH = join(tmpdir(), `trace-eval-importapi-${process.pid}-${Date.now()}.db`);

import { POST } from "@/app/api/import/route";
import { getTraceIdByExternalId } from "@/lib/repo";
import { listEvaluationDetailsByTrace } from "@/lib/repo-rubric";

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

  it("attaches bundled demoEvaluation as a reference evaluation, idempotently on re-import", async () => {
    const trace = {
      id: "ref-eval-test-1",
      input: "样例失败任务",
      status: "error",
      steps: [{ type: "tool_call", name: "shell", input: "{}", status: "error" }],
      demoEvaluation: {
        model: "参考评分（样例）",
        scores: [{ dimension_key: "task_completion", score: 1, rationale: "未完成" }],
        overall_score: 1.4,
        passed: false,
        summary: "样例参考结论",
        issues: [{
          step_idx: 0, severity: "high", dimension_key: "task_completion",
          message: "问题描述", suggestion: "具体修复建议",
        }],
      },
    };
    const res = await POST(new Request("http://local/api/import", {
      method: "POST",
      body: makeForm("ref.json", JSON.stringify(trace)),
    }));
    const json = await res.json();
    expect(json.reports[0].referenceEvaluations).toBe(1);

    const traceId = getTraceIdByExternalId("ref-eval-test-1");
    expect(traceId).toBeTruthy();
    const evals = listEvaluationDetailsByTrace(traceId!);
    expect(evals).toHaveLength(1);
    expect(evals[0].model).toBe("参考评分（样例）");
    expect(evals[0].passed).toBe(false);
    expect(evals[0].scores[0].dimensionKey).toBe("task_completion");
    const issue = evals[0].issues[0] as { suggestion: string; step_idx: number };
    expect(issue.suggestion).toBe("具体修复建议");
    expect(issue.step_idx).toBe(0);

    // 重复导入：轨迹去重，参考评分不重复挂载
    const res2 = await POST(new Request("http://local/api/import", {
      method: "POST",
      body: makeForm("ref.json", JSON.stringify(trace)),
    }));
    const json2 = await res2.json();
    expect(json2.reports[0].referenceEvaluations).toBe(0);
    expect(listEvaluationDetailsByTrace(traceId!)).toHaveLength(1);
  });

  it("auto-generates offline rule-based advice for plain imported failure traces", async () => {
    const failTrace = {
      id: "plain-fail-1",
      input: "部署服务",
      status: "error",
      steps: [
        { id: "s1", type: "tool_call", name: "shell", input: "deploy.sh", status: "error" },
        { id: "s2", type: "tool_result", parent_id: "s1", output: "bash: deploy.sh: Permission denied", status: "error" },
      ],
    };
    const res = await POST(new Request("http://local/api/import", {
      method: "POST",
      body: makeForm("plain.json", JSON.stringify(failTrace)),
    }));
    const json = await res.json();
    expect(json.reports[0].referenceEvaluations).toBe(1);

    const traceId = getTraceIdByExternalId("plain-fail-1")!;
    const evals = listEvaluationDetailsByTrace(traceId);
    expect(evals).toHaveLength(1);
    expect(evals[0].model).toBe("自动诊断建议（离线规则）");
    const messages = evals[0].issues.map((i) => (i as { message: string }).message);
    expect(messages.some((m) => m.includes("权限"))).toBe(true);
    const suggestions = evals[0].issues.map((i) => (i as { suggestion: string }).suggestion);
    expect(suggestions.every((s) => s.length > 0)).toBe(true);

    // 成功轨迹不生成诊断
    const okTrace = {
      id: "plain-ok-1",
      input: "读取文件",
      status: "success",
      steps: [{ type: "tool_call", name: "read_file", input: "a.txt", status: "success" }],
    };
    const resOk = await POST(new Request("http://local/api/import", {
      method: "POST",
      body: makeForm("ok.json", JSON.stringify(okTrace)),
    }));
    const jsonOk = await resOk.json();
    expect(jsonOk.reports[0].referenceEvaluations).toBe(0);
  });
});
