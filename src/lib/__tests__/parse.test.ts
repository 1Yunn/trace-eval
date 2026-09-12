import { describe, it, expect } from "vitest";
import { parseTraceFile } from "@/lib/parse";

describe("parseTraceFile", () => {
  it("parses a single json object", () => {
    const r = parseTraceFile("a.json", JSON.stringify({ input: "hi" }));
    expect(r.records).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
  });

  it("parses a json array", () => {
    const r = parseTraceFile("a.json", JSON.stringify([{ input: "1" }, { input: "2" }]));
    expect(r.records).toHaveLength(2);
  });

  it("reports syntax error for broken json with no line", () => {
    const r = parseTraceFile("a.json", "{ broken");
    expect(r.records).toHaveLength(0);
    expect(r.errors[0].line).toBeNull();
  });

  it("parses jsonl and isolates bad lines with line numbers", () => {
    const text = [JSON.stringify({ input: "1" }), "not-json", "", JSON.stringify({ input: "2" })].join("\n");
    const r = parseTraceFile("a.jsonl", text);
    expect(r.records).toHaveLength(2);
    expect(r.errors).toEqual([{ line: 2, reason: expect.stringContaining("JSON") }]);
  });

  it("flags non-object json lines", () => {
    const r = parseTraceFile("a.jsonl", "123\n");
    expect(r.errors[0]).toMatchObject({ line: 1, reason: expect.stringContaining("对象") });
  });

  it("throws for unsupported extension", () => {
    expect(() => parseTraceFile("a.txt", "{}")).toThrow("UNSUPPORTED_FORMAT");
  });
});
