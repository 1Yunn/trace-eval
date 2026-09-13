"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { apiJson } from "@/lib/http";
import type { Rubric } from "@/lib/types";

interface BatchStatus {
  total: number; pending: number; running: number; success: number; error: number;
  items: { id: string; traceId: string; status: string; error: string | null }[];
}

export function EvalBatchDialog({
  traceIds, rubrics, onClose, onDone,
}: {
  traceIds: string[];
  rubrics: Rubric[];
  onClose: () => void;
  onDone: () => void;
}) {
  const defaultRubric = rubrics.find((r) => r.isDefault) ?? rubrics[0];
  const [rubricId, setRubricId] = useState(defaultRubric?.id ?? "");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function start(ids: string[]) {
    setError("");
    try {
      const { batchId } = await apiJson<{ batchId: string }>("/api/evaluations", {
        method: "POST", body: JSON.stringify({ traceIds: ids, rubricId }),
      });
      setBatchId(batchId);
      poll(batchId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function poll(id: string) {
    if (timer.current) clearInterval(timer.current);
    const tick = async () => {
      try {
        const s = await apiJson<BatchStatus>(`/api/evaluations?batchId=${encodeURIComponent(id)}`);
        setStatus(s);
        if (s.pending + s.running === 0) {
          if (timer.current) clearInterval(timer.current);
          onDone();
        }
      } catch (e) {
        if (timer.current) clearInterval(timer.current);
        setError((e as Error).message);
      }
    };
    void tick();
    timer.current = setInterval(tick, 2000);
  }

  const finished = status && status.pending + status.running === 0;
  const failedIds = status ? Array.from(new Set(status.items.filter((i) => i.status === "error").map((i) => i.traceId))) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">批量评分（{traceIds.length} 条轨迹）</h2>
          <button onClick={onClose} className="text-fg-tertiary hover:text-fg"><X size={18} /></button>
        </div>

        {!batchId && (
          <div className="space-y-3">
            <label className="block text-[12px] text-muted">评分标准</label>
            <select className="input" value={rubricId} onChange={(e) => setRubricId(e.target.value)}>
              {rubrics.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}（v{r.version}）{r.isDefault ? " · 默认" : ""}
                </option>
              ))}
            </select>
            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={onClose}>取消</button>
              <button className="btn-primary" disabled={!rubricId} onClick={() => void start(traceIds)}>开始评分</button>
            </div>
          </div>
        )}

        {batchId && status && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[13px]">
              {!finished && <Loader2 size={15} className="animate-spin text-accent" />}
              <span>
                成功 <b className="text-success">{status.success}</b> · 失败 <b className={status.error ? "text-danger" : ""}>{status.error}</b>
                {" · "}进行中 {status.running} · 等待 {status.pending}（共 {status.total}）
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted-bg">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${((status.success + status.error) / status.total) * 100}%` }}
              />
            </div>
            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</div>}
            <div className="flex justify-end gap-2 pt-1">
              {finished && failedIds.length > 0 && (
                <button className="btn-secondary" onClick={() => void start(failedIds)}>
                  重试失败项（{failedIds.length}）
                </button>
              )}
              <button className="btn-primary" onClick={onClose}>{finished ? "完成" : "后台运行"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
