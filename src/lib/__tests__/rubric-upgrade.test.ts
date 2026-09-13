import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { newId } from "@/lib/db";
import {
  DEFAULT_PROMPT_TEMPLATE, DEFAULT_RUBRIC_DRAFT, LEGACY_DEFAULT_RUBRIC_NAME,
} from "@/lib/rubric-defaults";
import { getDefaultRubric, listRubrics } from "@/lib/repo-rubric";

describe("legacy default rubric upgrade", () => {
  it("upgrades a seeded v1 rubric in place, preserving its id", () => {
    // 模拟旧版本已播种的内置 v1 rubric
    const oldId = newId();
    const oldTemplate = "旧模板，不含 suggestion 要求";
    db.prepare(
      `INSERT INTO rubrics (id, name, version, dimensions_json, pass_threshold, prompt_template, is_default, created_at)
       VALUES (?, ?, 1, ?, 4.0, ?, 1, ?)`,
    ).run(oldId, LEGACY_DEFAULT_RUBRIC_NAME, JSON.stringify(DEFAULT_RUBRIC_DRAFT.dimensions), oldTemplate, new Date().toISOString());

    const upgraded = getDefaultRubric();

    expect(upgraded.id).toBe(oldId); // id 不变，历史评分关联保留
    expect(upgraded.name).toBe(DEFAULT_RUBRIC_DRAFT.name);
    expect(upgraded.promptTemplate).toBe(DEFAULT_PROMPT_TEMPLATE);
    expect(upgraded.version).toBe(2);
    expect(listRubrics()).toHaveLength(1); // 原地升级，不新增行
  });
});
