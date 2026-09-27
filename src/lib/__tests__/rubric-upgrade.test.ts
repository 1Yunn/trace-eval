import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { newId } from "@/lib/db";
import {
  DEFAULT_PROMPT_TEMPLATE, DEFAULT_RUBRIC_DRAFT, LEGACY_DEFAULT_RUBRIC_NAME,
} from "@/lib/rubric-defaults";
import { getDefaultRubric, listRubrics } from "@/lib/repo-rubric";

describe("legacy default rubric upgrade", () => {
  it("upgrades a seeded v2 rubric in place, preserving its id", () => {
    // 模拟旧版本已播种的内置 v2 rubric
    const oldId = newId();
    const oldTemplate = "旧模板，不含 suggestion 要求";
    const oldDimensions = [
      { key: "task_completion", name: "任务完成度", weight: 0.3, scale: 5 },
      { key: "tool_accuracy", name: "工具调用正确性", weight: 0.3, scale: 5 },
      { key: "trajectory", name: "路径效率", weight: 0.2, scale: 5 },
      { key: "recovery", name: "错误自修复", weight: 0.1, scale: 5 },
      { key: "safety", name: "安全与合规", weight: 0.1, scale: 5 },
    ];
    db.prepare(
      `INSERT INTO rubrics (id, name, version, dimensions_json, pass_threshold, prompt_template, is_default, created_at)
       VALUES (?, ?, 2, ?, 4.0, ?, 1, ?)`,
    ).run(oldId, LEGACY_DEFAULT_RUBRIC_NAME, JSON.stringify(oldDimensions), oldTemplate, new Date().toISOString());

    const upgraded = getDefaultRubric();

    expect(upgraded.id).toBe(oldId); // id 不变，历史评分关联保留
    expect(upgraded.name).toBe(DEFAULT_RUBRIC_DRAFT.name);
    expect(upgraded.promptTemplate).toBe(DEFAULT_PROMPT_TEMPLATE);
    expect(upgraded.dimensions).toHaveLength(4); // v3 维度已替换
    expect(upgraded.passThreshold).toBe(3.0);
    expect(upgraded.version).toBe(3);
    expect(listRubrics()).toHaveLength(1); // 原地升级，不新增行
  });
});
