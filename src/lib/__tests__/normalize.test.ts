import { describe, it, expect } from "vitest";
import { normalizeTrace } from "@/lib/normalize";

describe("normalizeTrace", () => {
  it("passes through canonical shape", () => {
    const r = normalizeTrace({
      input: "做个表",
      status: "success",
      tags: ["x"],
      steps: [{ type: "thought", input: "想想", status: "success" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.input).toBe("做个表");
    expect(r.value.status).toBe("success");
    expect(r.value.tags).toEqual(["x"]);
    expect(r.value.steps[0].type).toBe("thought");
  });

  it("fails when input is missing", () => {
    const r = normalizeTrace({ steps: [] });
    expect(r.ok).toBe(false);
  });

  it("maps top-level aliases task/final_answer", () => {
    const r = normalizeTrace({ task: "t", final_answer: "a" });
    expect(r.ok && r.value.input).toBe("t");
    expect(r.ok && r.value.output).toBe("a");
  });

  it("maps chat messages: assistant tool_calls + tool result with parent", () => {
    const r = normalizeTrace({
      input: "读文件",
      messages: [
        { role: "assistant", content: "我先读", tool_calls: [
          { id: "c1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
        ] },
        { role: "tool", tool_call_id: "c1", content: "hello" },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    const types = r.value.steps.map((s) => s.type);
    expect(types).toEqual(["thought", "tool_call", "tool_result"]);
    const call = r.value.steps[1];
    expect(call.name).toBe("read_file");
    expect(call.input).toBe('{"path":"a.txt"}');
    expect(r.value.steps[2].parentExternalId).toBe("c1");
  });

  it("uses first user message as input when top input absent", () => {
    const r = normalizeTrace({ messages: [{ role: "user", content: "帮我查" }] });
    expect(r.ok && r.value.input).toBe("帮我查");
  });

  it("maps spans aliases and unknown steps become custom", () => {
    const r = normalizeTrace({
      input: "x",
      spans: [
        { kind: "tool_use", tool: "write", args: { f: 1 }, is_error: true },
        { weird: true },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.steps[0].type).toBe("tool_call");
    expect(r.value.steps[0].name).toBe("write");
    expect(r.value.steps[0].status).toBe("error");
    expect(r.value.steps[1].type).toBe("custom");
  });

  it("converts numeric timestamps (seconds and ms) and computes duration", () => {
    const r = normalizeTrace({
      input: "x",
      started_at: 1700000000,
      ended_at: 1700000060,
      steps: [{ type: "text", started_at: 1700000000000, ended_at: 1700000001000 }],
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.startedAt).toBe(new Date(1700000000000).toISOString());
  });

  it("infers step status success by default and error from error field", () => {
    const r = normalizeTrace({ input: "x", steps: [{ type: "text" }, { type: "text", error: { msg: "boom" } }] });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.steps[0].status).toBe("success");
    expect(r.value.steps[1].status).toBe("error");
  });

  it("stringifies object inputs/outputs", () => {
    const r = normalizeTrace({ input: "x", steps: [{ type: "tool_result", output: { a: 1 } }] });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.steps[0].output).toBe('{"a":1}');
  });
});
