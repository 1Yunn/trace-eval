import type {
  NormalizedStep, NormalizedTrace, Result, StepStatus, StepType, TraceStatus,
} from "@/lib/types";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const pickStr = (o: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return undefined;
};

const fieldText = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
};

const pickField = (o: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const t = fieldText(o[k]);
    if (t !== undefined) return t;
  }
  return undefined;
};

const pickNum = (o: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
};

export function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

export function computeDurationMs(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

const STATUS_ALIAS: Record<string, StepStatus> = {
  running: "running", pending: "running",
  success: "success", ok: "success", completed: "success", complete: "success", done: "success",
  error: "error", failed: "error", failure: "error",
};

const TRACE_STATUS_ALIAS: Record<string, TraceStatus> = {
  success: "success", ok: "success", completed: "success",
  error: "error", failed: "error", failure: "error",
  unknown: "unknown",
};

const TYPE_ALIASES: Record<string, StepType> = {
  thought: "thought", thinking: "thought", reasoning: "thought", reason: "thought",
  text: "text", message: "text", assistant: "text",
  tool_call: "tool_call", tool_use: "tool_call", function: "tool_call",
  call: "tool_call", tool: "tool_call",
  tool_result: "tool_result", observation: "tool_result", result: "tool_result",
  error: "error",
  system: "system",
};

function tokenPair(o: Record<string, unknown>): { i?: number; o?: number } {
  const tu = isObj(o.token_usage) ? o.token_usage : o;
  const i = pickNum(tu as Record<string, unknown>, ["input", "input_tokens", "prompt_tokens"]);
  const out = pickNum(tu as Record<string, unknown>, ["output", "output_tokens", "completion_tokens"]);
  return { i, o: out };
}

function normalizeStep(item: unknown): NormalizedStep | null {
  if (!isObj(item)) return null;
  const rawType = pickStr(item, ["type", "kind", "step_type", "event_type", "role"])?.toLowerCase();
  const type: StepType = (rawType && TYPE_ALIASES[rawType]) || "custom";
  const statusRaw = pickStr(item, ["status", "state"])?.toLowerCase();
  const hasError =
    (item.error !== undefined && item.error !== false && item.error !== null) ||
    item.is_error === true;
  const status: StepStatus =
    (statusRaw && STATUS_ALIAS[statusRaw]) || (hasError || type === "error" ? "error" : "success");
  const { i, o } = tokenPair(item);
  const startedAt = toIso(item.started_at ?? item.startTime ?? item.start);
  const endedAt = toIso(item.ended_at ?? item.endTime ?? item.end);
  return {
    externalId: pickStr(item, ["id", "span_id"]),
    type,
    name: pickStr(item, ["name", "tool_name", "tool"]),
    input: pickField(item, ["input", "arguments", "args", "params", "content", "text", "thinking", "thought"]),
    output: pickField(item, ["output", "result", "observation", "response", "returns"]),
    status,
    parentExternalId: pickStr(item, ["parent_id", "parentId", "parent"]),
    startedAt,
    endedAt,
    tokenInput: i,
    tokenOutput: o,
  };
}

function stepsFromMessages(messages: unknown[], fallbackInput: { v?: string }): NormalizedStep[] {
  const steps: NormalizedStep[] = [];
  for (const msg of messages) {
    if (!isObj(msg)) continue;
    const role = pickStr(msg, ["role"])?.toLowerCase();
    const content = fieldText(msg.content);
    if (role === "user") {
      if (!fallbackInput.v && content) fallbackInput.v = content;
      continue;
    }
    if (role === "assistant") {
      if (content) steps.push({ type: "thought", input: content, status: "success" });
      for (const tc of Array.isArray(msg.tool_calls) ? msg.tool_calls : []) {
        if (!isObj(tc)) continue;
        const fn = isObj(tc.function) ? tc.function : tc;
        steps.push({
          externalId: pickStr(tc, ["id"]),
          type: "tool_call",
          name: pickStr(fn as Record<string, unknown>, ["name"]) ?? pickStr(tc, ["name"]),
          input: pickField(fn as Record<string, unknown>, ["arguments", "input"]) ?? pickField(tc, ["arguments", "input"]),
          status: "success",
        });
      }
    } else if (role === "tool") {
      steps.push({
        type: "tool_result",
        name: pickStr(msg, ["name"]),
        output: content,
        status: msg.is_error ? "error" : "success",
        parentExternalId: pickStr(msg, ["tool_call_id"]),
      });
    } else if (role === "system") {
      if (content) steps.push({ type: "system", input: content, status: "success" });
    } else if (content) {
      steps.push({ type: "custom", input: content, status: "success" });
    }
  }
  return steps;
}

export function normalizeTrace(raw: unknown): Result<NormalizedTrace> {
  if (!isObj(raw)) return { ok: false, error: "记录必须是 JSON 对象" };

  const fallbackInput: { v?: string } = {};
  let steps: NormalizedStep[] = [];
  const rawSteps = raw.steps ?? raw.spans ?? raw.events;
  if (Array.isArray(rawSteps)) {
    steps = rawSteps.map(normalizeStep).filter((s): s is NormalizedStep => s !== null);
  } else if (Array.isArray(raw.messages)) {
    steps = stepsFromMessages(raw.messages, fallbackInput);
  }

  const input =
    pickStr(raw, ["input", "task", "prompt", "query", "question"]) ?? fallbackInput.v;
  if (!input) return { ok: false, error: "缺少必填字段 input" };

  const statusRaw = pickStr(raw, ["status", "state"])?.toLowerCase();
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => fieldText(t)).filter((t): t is string => !!t)
    : [];
  const { i, o } = tokenPair(raw);
  const startedAt = toIso(raw.started_at ?? raw.startTime ?? raw.start);
  const endedAt = toIso(raw.ended_at ?? raw.endTime ?? raw.end);

  return {
    ok: true,
    value: {
      externalId: pickStr(raw, ["id", "trace_id"]),
      agent: pickStr(raw, ["agent", "agent_name"]),
      model: pickStr(raw, ["model"]),
      input,
      output: pickField(raw, ["output", "result", "final_answer", "response"]),
      status: (statusRaw && TRACE_STATUS_ALIAS[statusRaw]) || "unknown",
      startedAt,
      endedAt,
      tags,
      metadata: isObj(raw.metadata) ? raw.metadata : {},
      tokenInput: i,
      tokenOutput: o,
      steps,
    },
  };
}
