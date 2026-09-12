import { createHash } from "node:crypto";
import type { NormalizedTrace } from "@/lib/types";

/**
 * 将任意值序列化为确定性的规范化字符串：
 * 对象键递归按字典序排序，数组保持原始顺序。
 */
function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const t = typeof value;
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const parts = Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${parts.join(",")}}`;
  }
  if (t === "string") return `s:${JSON.stringify(value)}`;
  if (t === "number" || t === "boolean") return `${t}:${String(value)}`;
  if (t === "undefined") return "undefined";
  return JSON.stringify(value) ?? "null";
}

export function contentHash(t: NormalizedTrace): string {
  return createHash("sha1").update(canonicalize(t)).digest("hex");
}
