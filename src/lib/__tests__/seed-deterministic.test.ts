import { describe, it, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 确定性种子 ID 回归测试：
 * Vercel 每个实例有独立的 /tmp SQLite。若种子轨迹 ID 为随机 UUID，
 * A 实例列表里的 ID 在 B 实例查不到 → 详情页报「轨迹不存在」。
 * 修复后所有实例播种出的 trace ID 必须一致（seed-<externalId>）。
 */

function freshInstanceDbPath(): string {
  return join(tmpdir(), `trace-eval-seed-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
}

async function seedFreshInstance(): Promise<string[]> {
  vi.resetModules();
  process.env.TRACEEVAL_DB_PATH = freshInstanceDbPath();
  const { seedIfEmpty } = await import("@/lib/seed");
  await seedIfEmpty();
  const { db } = await import("@/lib/db");
  const rows = db.prepare("SELECT id FROM traces ORDER BY id").all() as { id: string }[];
  db.close();
  return rows.map((r) => r.id);
}

beforeEach(() => {
  vi.resetModules();
});

describe("seedIfEmpty deterministic ids", () => {
  it("两个独立实例播种出完全相同的 trace ID 列表", async () => {
    const idsA = await seedFreshInstance();
    const idsB = await seedFreshInstance();

    expect(idsA.length).toBeGreaterThan(0);
    expect(idsA).toEqual(idsB);
    // ID 确定性：以 seed- 前缀 + externalId 派生，而非随机 UUID
    expect(idsA.every((id) => id.startsWith("seed-"))).toBe(true);
  });
});
