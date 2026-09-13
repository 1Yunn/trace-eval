import { describe, it, expect } from "vitest";
import { adviseTrace } from "@/lib/advice";
import type { NormalizedTrace } from "@/lib/types";

const make = (over: Partial<NormalizedTrace>): NormalizedTrace => ({
  externalId: "t",
  input: "任务",
  status: "error",
  tags: [],
  metadata: {},
  steps: [],
  ...over,
});

describe("adviseTrace", () => {
  it("matches ENOENT and anchors suggestion to the failed step", () => {
    const out = adviseTrace(make({
      steps: [
        { externalId: "a", type: "tool_call", name: "shell", input: "rm tmp/x.tmp", status: "error" },
        {
          type: "tool_result", parentExternalId: "a",
          output: "rm: tmp/x.tmp: No such file or directory", status: "error",
        },
      ],
    }));
    // 错误细节在子步骤：父步骤不应重复出建议
    const enoent = out.issues.filter((i) => i.dimension_key === "tool_accuracy");
    expect(enoent).toHaveLength(1);
    expect(enoent[0].step_idx).toBe(1);
    expect(enoent[0].suggestion).toContain("路径");
    // 轨迹失败收尾问题（整体性或最后失败步）
    expect(out.issues.some((i) => i.dimension_key === "task_completion")).toBe(true);
  });

  it("detects repeated identical failing calls as a loop", () => {
    const out = adviseTrace(make({
      steps: [1, 2, 3].flatMap((n) => [
        { type: "tool_call" as const, name: "shell", input: "python convert.py", status: "error" as const },
        { type: "tool_result" as const, output: "can't open file 'convert.py'", status: "error" as const },
      ]),
    }));
    const loop = out.issues.find((i) => i.dimension_key === "trajectory");
    expect(loop).toBeTruthy();
    expect(loop!.step_idx).toBe(2); // 打在第 2 次重复的调用上
    expect(loop!.suggestion).toContain("换策略");
    expect(out.scores.find((s) => s.dimension_key === "trajectory")!.score).toBe(1);
  });

  it("matches auth failure and flags dangerous rm -rf", () => {
    const out = adviseTrace(make({
      steps: [
        { externalId: "a", type: "tool_call", name: "http", input: "POST /send", status: "error" },
        { type: "tool_result", parentExternalId: "a", output: "SMTPError 535 authentication failed", status: "error" },
        { externalId: "c", type: "tool_call", name: "shell", input: "sudo rm -rf /var/log", status: "error" },
        { type: "tool_result", parentExternalId: "c", output: "blocked by security policy", status: "error" },
      ],
    }));
    const auth = out.issues.find((i) => i.message.includes("鉴权"));
    expect(auth?.suggestion).toContain("凭证");
    const danger = out.issues.find((i) => i.dimension_key === "safety" && i.message.includes("高危"));
    expect(danger).toBeTruthy();
    expect(out.scores.find((s) => s.dimension_key === "safety")!.score).toBe(1);
  });

  it("returns no issues for a successful trace", () => {
    const out = adviseTrace(make({
      status: "success",
      steps: [{ type: "tool_call", name: "read_file", input: "README.md", status: "success" }],
    }));
    expect(out.issues).toHaveLength(0);
    expect(out.summary).toContain("未检测到失败");
  });

  it("falls back to generic recovery advice for unknown errors", () => {
    const out = adviseTrace(make({
      steps: [{ type: "tool_call", name: "custom", input: "{}", output: "womp womp 失败了", status: "error" }],
    }));
    const fb = out.issues.find((i) => i.message.includes("未匹配到已知模式"));
    expect(fb?.suggestion).toContain("错误信息");
  });
});
