import {
  BrainCircuit, MessageSquare, Wrench, CornerDownLeft,
  AlertTriangle, Info, MoreHorizontal, Lightbulb,
} from "lucide-react";
import type { Rubric } from "@/lib/types";
import type { StepRow } from "@/lib/types-private";
import { fmtDuration } from "@/lib/format";
import { JsonBlock } from "./JsonBlock";
import type { EvaluationDetail } from "./EvalPanel";

const TYPE_ICON: Record<string, typeof BrainCircuit> = {
  thought: BrainCircuit, text: MessageSquare, tool_call: Wrench,
  tool_result: CornerDownLeft, error: AlertTriangle, system: Info, custom: MoreHorizontal,
};
const TYPE_LABEL: Record<string, string> = {
  thought: "思考", text: "文本", tool_call: "调用工具", tool_result: "工具返回",
  error: "错误", system: "系统", custom: "其他",
};
const SEV_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

function computeDepth(steps: StepRow[]): number[] {
  const depth: number[] = [];
  steps.forEach((s, i) => {
    depth[i] = s.parentIdx !== null && s.parentIdx < i ? depth[s.parentIdx] + 1 : 0;
  });
  return depth;
}

/** 挂在时间线上的裁判问题与修复建议（内联展示，不做独立板块） */
function StepIssue({ iss, dimName }: { iss: EvaluationDetail["issues"][number]; dimName: string }) {
  return (
    <div className="mt-2 rounded-lg border border-border bg-danger-soft/30 p-2.5 text-[12px]">
      <div>
        <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] ${
          iss.severity === "high" ? "bg-danger-soft text-danger" : "bg-muted-bg text-fg-secondary"
        }`}>{SEV_LABEL[iss.severity]}</span>
        <span className="text-fg-tertiary">{dimName} · </span>
        {iss.message}
      </div>
      {iss.suggestion ? (
        <div className="mt-1.5 flex gap-1.5 rounded-md bg-muted-bg px-2 py-1.5 leading-relaxed text-fg-secondary">
          <Lightbulb size={13} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <span className="mr-1 font-medium">修复建议：</span>
            {iss.suggestion}
          </div>
        </div>
      ) : (
        <div className="mt-1 text-fg-tertiary">暂无针对性建议</div>
      )}
    </div>
  );
}

export function TraceTimeline({
  steps, issues, rubrics,
}: {
  steps: StepRow[];
  issues?: EvaluationDetail["issues"];
  rubrics?: Rubric[];
}) {
  const depth = computeDepth(steps);
  const nameOf = (key: string) =>
    rubrics?.flatMap((r) => r.dimensions).find((d) => d.key === key)?.name ?? key;
  const stepIssues = new Map<number, EvaluationDetail["issues"]>();
  const globalIssues: EvaluationDetail["issues"] = [];
  for (const iss of issues ?? []) {
    if (iss.step_idx === null) globalIssues.push(iss);
    else {
      const list = stepIssues.get(iss.step_idx) ?? [];
      list.push(iss);
      stepIssues.set(iss.step_idx, list);
    }
  }

  return (
    <div className="space-y-2">
      {globalIssues.length > 0 && (
        <div id="issues-global" className="card scroll-mt-6 space-y-2 border-l-2 border-l-danger p-3.5">
          <div className="text-[12px] font-medium text-muted">整体性问题（{globalIssues.length}）</div>
          {globalIssues.map((iss, i) => (
            <StepIssue key={i} iss={iss} dimName={nameOf(iss.dimension_key)} />
          ))}
        </div>
      )}
      {steps.map((s, i) => {
        const Icon = TYPE_ICON[s.type] ?? MoreHorizontal;
        const failed = s.status === "error";
        const issList = stepIssues.get(s.idx) ?? [];
        return (
          <div
            key={s.idx}
            id={`step-${s.idx}`}
            className="card relative scroll-mt-6 p-3.5"
          >
            {depth[i] > 0 && (
              <span className="absolute bottom-3 left-3 top-3 w-px bg-border" aria-hidden />
            )}
            {/* 层级缩进只作用于步骤自身内容；问题块保持卡片全宽，与其他步骤的问题卡对齐 */}
            <div style={{ paddingLeft: depth[i] * 20 }}>
              <div className="flex items-center gap-2">
                <Icon size={15} className={failed ? "text-danger" : "text-accent"} />
                <span className="text-[12px] text-fg-tertiary">[{s.idx}]</span>
                <span className="text-[13px] font-medium">{TYPE_LABEL[s.type] ?? s.type}</span>
                {s.name && <span className="chip">{s.name}</span>}
                <span className={`ml-auto inline-flex items-center gap-1 text-[12px] ${failed ? "text-danger" : "text-muted"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${failed ? "bg-danger" : "bg-success"}`} />
                  {failed ? "失败" : "成功"}
                </span>
                {s.durationMs !== undefined && (
                  <span className="text-[12px] text-fg-tertiary">{fmtDuration(s.durationMs)}</span>
                )}
              </div>
              <div className="mt-2 space-y-1.5 pl-6">
                {s.input !== undefined && s.input !== "" && <JsonBlock label="输入" text={s.input} />}
                {s.output !== undefined && s.output !== "" && <JsonBlock label="输出" text={s.output} />}
              </div>
            </div>
            {issList.length > 0 && (
              <div className="mt-2 space-y-2 border-t border-border pt-2.5">
                {issList.map((iss, k) => (
                  <StepIssue key={k} iss={iss} dimName={nameOf(iss.dimension_key)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {steps.length === 0 && <div className="py-10 text-center text-[13px] text-fg-tertiary">该轨迹没有步骤</div>}
    </div>
  );
}
