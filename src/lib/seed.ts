import { parseTraceFile } from "./parse";
import { normalizeTrace } from "./normalize";
import { getTraceIdByExternalId, insertImportAndTraces } from "./repo";
import {
  getDefaultRubric, hasReferenceEvaluation, insertReferenceEvaluation,
} from "./repo-rubric";
import { JudgeOutputSchema } from "./schema";
import { adviseTrace } from "./advice";
import { db } from "./db";
import type { JudgeOutput, NormalizedTrace } from "./types";
// 直接 import 以确保 Vercel 打包时把样例数据带进服务端 bundle，
// 不依赖运行时读取 public/（Vercel serverless 的 fs 对 public/ 不可靠）。
import sampleTraces from "../../public/sample-traces.json";

/**
 * 冷启动时若轨迹表为空，则自动导入样例轨迹并挂载参考评分，
 * 让面试官打开在线 demo 即可看到数据（Vercel /tmp 每次冷启动都是空库）。
 * 幂等：已有轨迹时直接跳过。
 *
 * 种子轨迹使用确定性 ID（sample-<externalId>）：Vercel 每个实例的 /tmp
 * 是独立数据库，随机 UUID 会导致「A 实例列表里的 ID 在 B 实例查不到」，
 * 点击详情报「轨迹不存在」。确定性 ID 保证所有实例播种出的 ID 一致。
 */

// 单飞：同一实例上并发的多个请求只播种一次，避免写锁冲突（SQLITE_BUSY）。
let seeding: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  seeding ??= doSeed().catch((err) => {
    // 播种失败不应阻断服务启动；面试官仍可手动点「载入示例轨迹」。
    // 失败后清空缓存，下次请求可重试。
    console.error("[seed] failed to seed sample traces:", err);
    seeding = null;
  });
  return seeding;
}

async function doSeed(): Promise<void> {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM traces").get() as { c: number }).c;
  if (count > 0) return;

  const text = JSON.stringify(sampleTraces);
  const parsed = parseTraceFile("sample-traces.json", text);
  const entries: { raw: unknown; normalized: NormalizedTrace }[] = [];
  for (const rec of parsed.records) {
    const n = normalizeTrace(rec.value);
    if (n.ok) entries.push({ raw: rec.value, normalized: n.value });
  }
  if (entries.length === 0) return;

  insertImportAndTraces("sample-traces.json", "json", entries, [], {
    traceIdFor: (e) => e.normalized.externalId
      ? `seed-${e.normalized.externalId}`
      : `seed-${e.normalized.input.slice(0, 40)}`,
  });

  for (const e of entries) {
    const extId = e.normalized.externalId;
    if (!extId) continue;
    const raw = e.raw;
    const bundled = raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).demoEvaluation
      : undefined;

    let output: JudgeOutput | null = null;
    let label = "自动诊断建议（离线规则）";
    if (bundled && typeof bundled === "object") {
      const p = JudgeOutputSchema.safeParse(bundled);
      if (p.success) {
        output = p.data;
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
  }
}
