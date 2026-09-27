"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { apiJson } from "@/lib/http";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { StatusBadge } from "@/components/badges";
import { TraceTimeline } from "@/components/TraceTimeline";
import { EvalPanel, type EvaluationDetail } from "@/components/EvalPanel";
import type { Rubric, StepRow, TraceListItem } from "@/lib/types-private";

interface DetailData {
  trace: TraceListItem;
  steps: StepRow[];
  evaluations: EvaluationDetail[];
}

export default function TraceDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<DetailData | null>(null);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadErrorRetry = useRef(0);

  const load = useCallback(async () => {
    try {
      const d = await apiJson<DetailData>(`/api/traces/${params.id}`);
      setData(d);
      setLoadError(false);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      // 仅 404 视为轨迹不存在；5xx 等瞬时错误（如 serverless 冷启动）允许重试。
      if (status === 404) {
        setNotFound(true);
      } else {
        setLoadError(true);
      }
    }
  }, [params.id]);

  // 瞬时错误自动重试（间隔 1.2s，最多 2 次）。
  useEffect(() => {
    if (!loadError) return;
    let cancelled = false;
    if (loadErrorRetry.current >= 2) return;
    loadErrorRetry.current += 1;
    const timer = setTimeout(() => {
      if (!cancelled) void load();
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loadError, load]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    apiJson<{ items: Rubric[] }>("/api/rubrics").then((d) => setRubrics(d.items)).catch(() => {});
  }, []);

  if (notFound) return <div className="py-20 text-center text-muted">轨迹不存在。<Link href="/" className="text-accent">返回列表</Link></div>;
  if (loadError) {
    return (
      <div className="py-20 text-center text-muted">
        加载失败，服务器暂时不可用。
        <button
          className="ml-2 text-accent hover:underline"
          onClick={() => { loadErrorRetry.current = 0; setLoadError(false); void load(); }}
        >
          重试
        </button>
      </div>
    );
  }
  if (!data) return <div className="py-20 text-center text-fg-tertiary">加载中…</div>;

  const t = data.trace;
  const latestSuccess = data.evaluations.find((e) => e.status === "success");
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-accent">
        <ArrowLeft size={14} /> 返回列表
      </Link>

      <div className="card space-y-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-[17px] font-semibold leading-snug">{t.input}</h1>
          <StatusBadge status={t.status} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted">
          <span>Agent：{t.agent ?? "—"}</span>
          <span>模型：{t.model ?? "—"}</span>
          <span>步骤：{data.steps.length}</span>
          <span>耗时：{fmtDuration(t.durationMs)}</span>
          <span>tokens：{t.tokenInput ?? "—"} / {t.tokenOutput ?? "—"}</span>
          <span>开始：{fmtDateTime(t.startedAt ?? t.createdAt)}</span>
        </div>
        {t.tags.length > 0 && (
          <div className="flex gap-1">{t.tags.map((tag) => <span key={tag} className="chip">{tag}</span>)}</div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-3">
          <h2 className="text-[14px] font-semibold">执行时间线</h2>
          <TraceTimeline
            steps={data.steps}
            issues={latestSuccess?.issues}
            rubrics={rubrics}
          />
        </div>
        <div className="col-span-1 pt-[31.5px]">
          <EvalPanel traceId={t.id} rubrics={rubrics} initial={data.evaluations} onChanged={() => void load()} />
        </div>
      </div>
    </div>
  );
}
