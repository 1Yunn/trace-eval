"use client";

import { useCallback, useEffect, useState } from "react";
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

  const load = useCallback(async () => {
    try {
      const d = await apiJson<DetailData>(`/api/traces/${params.id}`);
      setData(d);
    } catch {
      setNotFound(true);
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    apiJson<{ items: Rubric[] }>("/api/rubrics").then((d) => setRubrics(d.items)).catch(() => {});
  }, []);

  if (notFound) return <div className="py-20 text-center text-muted">轨迹不存在。<Link href="/" className="text-accent">返回列表</Link></div>;
  if (!data) return <div className="py-20 text-center text-fg-tertiary">加载中…</div>;

  const t = data.trace;
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
          <TraceTimeline steps={data.steps} />
        </div>
        <div className="col-span-1">
          <EvalPanel traceId={t.id} rubrics={rubrics} initial={data.evaluations} onChanged={() => void load()} />
        </div>
      </div>
    </div>
  );
}
