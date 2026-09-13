import type { LineError, ParsedFile, ParsedRecord } from "./parse-types";
export type { LineError, ParsedFile, ParsedRecord } from "./parse-types";

export function parseTraceFile(filename: string, text: string): ParsedFile {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext !== "json" && ext !== "jsonl") throw new Error("UNSUPPORTED_FORMAT");

  if (ext === "json") {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return { records: data.map((value) => ({ value, line: null })), errors: [] };
      }
      return { records: [{ value: data, line: null }], errors: [] };
    } catch (e) {
      return { records: [], errors: [{ line: null, reason: `JSON 解析失败: ${(e as Error).message}` }] };
    }
  }

  const records: ParsedRecord[] = [];
  const errors: LineError[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        errors.push({ line: i + 1, reason: "每行必须是 JSON 对象" });
        return;
      }
      records.push({ value: obj, line: i + 1 });
    } catch (e) {
      errors.push({ line: i + 1, reason: `JSON 解析失败: ${(e as Error).message}` });
    }
  });
  return { records, errors };
}
