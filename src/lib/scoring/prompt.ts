import type { Rubric } from "@/lib/types";
import type { TraceDetail, StepRow } from "@/lib/repo";

export const MAX_STEPS = 200;
export const MAX_FIELD_CHARS = 8000;

const TYPE_LABEL: Record<string, string> = {
  thought: "思考", text: "文本", tool_call: "调用工具", tool_result: "工具返回",
  error: "错误", system: "系统", custom: "其他",
};

function clip(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  if (text.length <= MAX_FIELD_CHARS) return text;
  return `${text.slice(0, MAX_FIELD_CHARS)}\n…（内容已截断，原长 ${text.length} 字符）`;
}

function renderStep(s: StepRow): string {
  const parts = [`## [${s.idx}] ${TYPE_LABEL[s.type] ?? s.type}${s.name ? ` · ${s.name}` : ""} (${s.status})`];
  if (s.input !== undefined) parts.push("输入：\n" + clip(s.input));
  if (s.output !== undefined) parts.push("输出：\n" + clip(s.output));
  return parts.join("\n");
}

export function serializeTrace(detail: TraceDetail): string {
  const { trace, steps } = detail;
  const head = [
    "# 任务",
    trace.input,
    "",
    `- 状态: ${trace.status}`,
    ...(trace.agent ? [`- Agent: ${trace.agent}`] : []),
    ...(trace.model ? [`- 模型: ${trace.model}`] : []),
    ...(trace.durationMs !== undefined ? [`- 耗时: ${trace.durationMs}ms`] : []),
  ];
  const shown = steps.slice(0, MAX_STEPS);
  const body = shown.map(renderStep).join("\n\n");
  const omitted = steps.length - shown.length;
  const note = omitted > 0
    ? `\n\n> 注：轨迹共 ${steps.length} 步，仅向评审展示前 ${MAX_STEPS} 步，已截断 ${omitted} 步。`
    : "";
  return `${head.join("\n")}\n\n${body}${note}`;
}

export function buildJudgeMessages(
  rubric: Rubric,
  detail: TraceDetail,
): { role: "system" | "user"; content: string }[] {
  const rubricText = [
    `通过线（加权总分）: ${rubric.passThreshold}`,
    ...rubric.dimensions.map(
      (d) => `- ${d.key}（${d.name}）：权重 ${d.weight}，打分范围 1~${d.scale}`,
    ),
  ].join("\n");
  const traceText = serializeTrace(detail);
  const userContent = rubric.promptTemplate
    .replace("{{RUBRIC}}", rubricText)
    .replace("{{TRACE}}", traceText);
  return [
    { role: "system", content: rubricText },
    { role: "user", content: userContent },
  ];
}
