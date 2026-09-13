"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, ChevronDown } from "lucide-react";
import { apiJson } from "@/lib/http";
import type { Rubric } from "@/lib/types";
import { StatusBadge } from "./badges";

interface ScoreRow { dimensionKey: string; score: number; rationale: string }
interface Issue { step_idx: number | null; severity: "high" | "medium" | "low"; dimension_key: string; message: string; suggestion?: string }
export interface EvaluationDetail {
  id: string; rubricId: string; model: string; status: string;
  overallScore?: number; passed?: boolean; summary?: string;
  error?: string; scores: ScoreRow[]; issues: Issue[]; createdAt: string;
}
interface BatchStatus {
  total: number; pending: number; running: number; success: number; error: number;
  items: { id: string; traceId: string; status: string }[];
}

export function EvalPanel({
  traceId, rubrics, initial, onChanged,
}: {
  traceId: string;
  rubrics: Rubric[];
  initial: EvaluationDetail[];
  onChanged: () => void;
}) {
  const [evals, setEvals] = useState(initial);
  const [rubricId, setRubricId] = useState(rubrics.find((r) => r.isDefault)?.id ?? rubrics[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BatchStatus | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  // 服务端推送新评分（onChanged → 父组件 reload）后同步本地列表。
  useEffect(() => { setEvals(initial); }, [initial]);

  async function launch() {
    setBusy(true); setError("");
    try {
      const { batchId: id } = await apiJson<{ batchId: string }>("/api/evaluations", {
        method: "POST", body: JSON.stringify({ traceIds: [traceId], rubricId }),
      });
      timer.current = setInterval(() => {
        apiJson<BatchStatus>(`/api/evaluations?batchId=${encodeURIComponent(id)}`)
          .then((s) => {
            setProgress(s);
            if (s.pending + s.running === 0) {
              if (timer.current) clearInterval(timer.current);
              setBusy(false); setProgress(null); onChanged();
            }
          })
          .catch(() => {
            if (timer.current) clearInterval(timer.current);
            setBusy(false); setProgress(null);
          });
      }, 2000);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function retry(evalId: string) {
    setBusy(true); setError("");
    try {
      await apiJson(`/api/evaluations/${evalId}`, { method: "POST" });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const latest = evals[0];
  const latestRubric = rubrics.find((r) => r.id === latest?.rubricId);
  const dimName = (key: string) => latestRubric?.dimensions.find((d) => d.key === key)?.name ?? key;
  const dimScale = (key: string) => latestRubric?.dimensions.find((d) => d.key === key)?.scale ?? 5;

  return (
    <div className="space-y-4 self-start lg:sticky lg:top-6">
      <div className="card space-y-3 p-4">
        <div className="text-[13px] font-semibold">发起评分</div>
        <select className="input" value={rubricId} onChange={(e) => setRubricId(e.target.value)}>
          {rubrics.map((r) => (
            <option key={r.id} value={r.id}>{r.name}（v{r.version}）{r.isDefault ? " · 默认" : ""}</option>
          ))}
        </select>
        <button className="btn-primary w-full" disabled={busy || !rubricId} onClick={() => void launch()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {progress ? `评分中… ${progress.success + progress.error}/${progress.total}` : "评分这条轨迹"}
        </button>
        {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</div>}
      </div>

      {latest && (
        <div className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold">最近评分</div>
            <StatusBadge status={latest.status} />
          </div>
          {latest.status === "success" && (
            <>
              <div className="flex items-baseline gap-2">
                <span className={`text-[28px] font-semibold ${latest.passed ? "text-success" : "text-danger"}`}>
                  {latest.overallScore?.toFixed(1)}
                </span>
                <span className="text-[12px] text-muted">{latest.passed ? "通过" : "未通过"} · {latest.model}</span>
              </div>
              {latest.summary && <p className="text-[13px] leading-relaxed text-fg-secondary">{latest.summary}</p>}
              <div className="space-y-1.5">
                {latest.scores.map((s) => (
                  <div key={s.dimensionKey} className="flex items-center gap-2 text-[12px]">
                    <span className="w-20 shrink-0 truncate text-fg-secondary">{dimName(s.dimensionKey)}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted-bg">
                      <div
                        className={`h-full rounded-full ${latest.passed ? "bg-success" : "bg-accent"}`}
                        style={{ width: `${Math.max(0, Math.min(1, s.score / dimScale(s.dimensionKey))) * 100}%` }}
                      />
                    </div>
                    <span className="w-7 shrink-0 text-right tabular-nums text-fg-tertiary">{s.score}</span>
                  </div>
                ))}
              </div>
              {latest.issues.length > 0 && (
                <div className="rounded-md bg-muted-bg px-2.5 py-1.5 text-[12px] text-fg-secondary">
                  共发现 {latest.issues.length} 个问题，已标在时间线对应步骤中
                </div>
              )}
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] text-accent [&::-webkit-details-marker]:hidden">
                  维度评分明细
                  <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 space-y-1.5">
                  {latest.scores.map((s) => (
                    <div key={s.dimensionKey} className="text-[12px]">
                      <span className="font-medium">{dimName(s.dimensionKey)}：</span>
                      <span className="text-muted">{s.rationale}</span>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
          {latest.status === "error" && (
            <div className="space-y-2">
              <div className="rounded-lg bg-danger-soft px-3 py-2 text-[12px] text-danger">{latest.error}</div>
              <button className="btn-secondary w-full" onClick={() => void retry(latest.id)}>
                <RotateCcw size={13} /> 重试
              </button>
            </div>
          )}
          {(latest.status === "pending" || latest.status === "running") && (
            <div className="text-[12px] text-muted">评分进行中，稍后刷新查看…</div>
          )}
        </div>
      )}

      {evals.length > 1 && (
        <div className="card p-4">
          <div className="mb-2 text-[12px] font-medium text-muted">历史评分（{evals.length}）</div>
          <div className="space-y-1.5">
            {evals.slice(1).map((e) => (
              <div key={e.id} className="flex items-center justify-between text-[12px]">
                <span className="text-fg-tertiary">{new Date(e.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                <StatusBadge status={e.status} />
                <span className={e.passed ? "text-success" : "text-danger"}>
                  {e.overallScore !== undefined ? e.overallScore.toFixed(1) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
