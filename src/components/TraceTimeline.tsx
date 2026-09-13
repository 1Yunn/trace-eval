import {
  BrainCircuit, MessageSquare, Wrench, CornerDownLeft,
  AlertTriangle, Info, MoreHorizontal,
} from "lucide-react";
import type { StepRow } from "@/lib/types-private";
import { fmtDuration } from "@/lib/format";
import { JsonBlock } from "./JsonBlock";

const TYPE_ICON: Record<string, typeof BrainCircuit> = {
  thought: BrainCircuit, text: MessageSquare, tool_call: Wrench,
  tool_result: CornerDownLeft, error: AlertTriangle, system: Info, custom: MoreHorizontal,
};
const TYPE_LABEL: Record<string, string> = {
  thought: "思考", text: "文本", tool_call: "调用工具", tool_result: "工具返回",
  error: "错误", system: "系统", custom: "其他",
};

function computeDepth(steps: StepRow[]): number[] {
  const depth: number[] = [];
  steps.forEach((s, i) => {
    depth[i] = s.parentIdx !== null && s.parentIdx < i ? depth[s.parentIdx] + 1 : 0;
  });
  return depth;
}

export function TraceTimeline({ steps }: { steps: StepRow[] }) {
  const depth = computeDepth(steps);
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const Icon = TYPE_ICON[s.type] ?? MoreHorizontal;
        const failed = s.status === "error";
        return (
          <div
            key={s.idx}
            id={`step-${s.idx}`}
            className="card scroll-mt-6 p-3.5"
            style={{ marginLeft: depth[i] * 20 }}
          >
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
        );
      })}
      {steps.length === 0 && <div className="py-10 text-center text-[13px] text-fg-tertiary">该轨迹没有步骤</div>}
    </div>
  );
}
