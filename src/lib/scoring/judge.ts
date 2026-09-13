import OpenAI from "openai";
import { JudgeOutputSchema } from "@/lib/schema";
import { buildJudgeMessages } from "./prompt";
import { weightedScore } from "./weight";
import type { JudgeOutput, Rubric } from "@/lib/types";
import type { TraceDetail } from "@/lib/repo";

export class JudgeError extends Error {
  constructor(public kind: "config" | "parse" | "network", message: string) {
    super(message);
  }
}

export interface ChatMessage { role: "system" | "user"; content: string }
export interface JudgeModelClient {
  model: string;
  chat(messages: ChatMessage[], jsonMode: boolean): Promise<{
    content: string;
    usage?: { input?: number; output?: number };
  }>;
}

export function createOpenAIClient(cfg: {
  baseURL: string; apiKey: string; model: string;
}): JudgeModelClient {
  const client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, timeout: 60_000 });
  return {
    model: cfg.model,
    async chat(messages, jsonMode) {
      const res = await client.chat.completions.create({
        model: cfg.model,
        messages,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      });
      return {
        content: res.choices[0]?.message?.content ?? "",
        usage: { input: res.usage?.prompt_tokens, output: res.usage?.completion_tokens },
      };
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callWithRetry(
  client: JudgeModelClient, messages: ChatMessage[], jsonMode: boolean,
): Promise<{ content: string; usage?: { input?: number; output?: number } }> {
  let useJson = jsonMode;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.chat(messages, useJson);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? "";
      if (status && status >= 400 && status < 500) {
        if (useJson && /response_format|json/i.test(msg)) {
          useJson = false; // 端点不支持 JSON mode，降级纯文本
          continue;
        }
        throw new JudgeError("config", `裁判接口返回 ${status}: ${msg}`);
      }
      if (attempt === 2) throw new JudgeError("network", `裁判接口调用失败: ${msg}`);
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw new JudgeError("network", "unreachable");
}

export function extractJson(content: string): unknown {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("未找到 JSON 对象");
  return JSON.parse(text.slice(start, end + 1));
}

export async function scoreOne(
  client: JudgeModelClient,
  rubric: Rubric,
  detail: TraceDetail,
): Promise<{ output: JudgeOutput; raw: string; tokenInput?: number; tokenOutput?: number }> {
  const messages = buildJudgeMessages(rubric, detail);

  const first = await callWithRetry(client, messages, true);
  let parsed = JudgeOutputSchema.safeParse(
    (() => { try { return extractJson(first.content); } catch { return undefined; } })(),
  );

  if (!parsed.success) {
    const repair: ChatMessage = {
      role: "user",
      content: "你上一次的输出无法被解析为 JSON。请只返回一个合法 JSON 对象，不要 Markdown，不要解释。",
    };
    const second = await callWithRetry(client, [...messages, repair], false);
    parsed = JudgeOutputSchema.safeParse(
      (() => { try { return extractJson(second.content); } catch { return undefined; } })(),
    );
    if (!parsed.success) {
      throw new JudgeError("parse", `裁判输出无法解析: ${parsed.error.issues[0]?.message ?? "invalid json"}`);
    }
    return finalize(parsed.data, rubric, second.content, second.usage);
  }
  return finalize(parsed.data, rubric, first.content, first.usage);
}

function finalize(
  data: JudgeOutput, rubric: Rubric, raw: string,
  usage?: { input?: number; output?: number },
) {
  const scoreMap: Record<string, number> = {};
  for (const s of data.scores) scoreMap[s.dimension_key] = s.score;
  const overall = weightedScore(rubric.dimensions, scoreMap);
  const output: JudgeOutput = {
    ...data,
    overall_score: overall,
    passed: overall >= rubric.passThreshold,
  };
  return { output, raw, tokenInput: usage?.input, tokenOutput: usage?.output };
}
