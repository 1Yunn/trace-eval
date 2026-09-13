import { getSetting, setSetting } from "./db";
import type { JudgeConfig } from "./types";

const KEY = "judge";

export function getJudgeConfig(): JudgeConfig {
  let stored: Partial<JudgeConfig> = {};
  const raw = getSetting(KEY);
  if (raw) {
    try { stored = JSON.parse(raw); } catch { stored = {}; }
  }
  return {
    baseURL: (stored.baseURL || process.env.OPENAI_BASE_URL || "").trim(),
    apiKey: (stored.apiKey || process.env.OPENAI_API_KEY || "").trim(),
    model: (stored.model || process.env.OPENAI_MODEL || "").trim(),
    concurrency: Number.isFinite(stored.concurrency) && (stored.concurrency as number) >= 1
      ? (stored.concurrency as number)
      : Number(process.env.JUDGE_CONCURRENCY ?? 2),
  };
}

export function saveJudgeConfig(cfg: JudgeConfig): void {
  setSetting(KEY, JSON.stringify(cfg));
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 7) return "****";
  return `${key.slice(0, 6)}****${key.slice(-2)}`;
}
