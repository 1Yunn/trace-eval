import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";

const dbPath = join(tmpdir(), `trace-eval-db-${process.pid}-${Date.now()}.db`);
process.env.TRACEEVAL_DB_PATH = dbPath;

import { db, getSetting, setSetting } from "@/lib/db";

beforeEach(() => {
  // 每个用例复用同一临时库；测试结束统一关库
});

describe("db", () => {
  it("creates all core tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
      .all()
      .map((r: any) => r.name);
    for (const t of [
      "imports", "traces", "steps", "rubrics", "evaluations", "eval_scores",
      "app_settings", "_migrations", "traces_fts",
    ]) {
      expect(tables).toContain(t);
    }
  });

  it("round-trips settings", () => {
    expect(getSetting("nope")).toBeUndefined();
    setSetting("foo", "bar");
    expect(getSetting("foo")).toBe("bar");
  });
});
