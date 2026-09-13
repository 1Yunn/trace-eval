"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { apiJson } from "@/lib/http";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { StatusBadge, PassBadge } from "@/components/badges";
import { ImportZone } from "@/components/ImportZone";
import { EvalBatchDialog } from "@/components/EvalBatchDialog";
import type { Rubric, TraceListItem } from "@/lib/types-private";

interface ListResponse {
  items: TraceListItem[]; total: number; page: number; pageSize: number; agents: string[];
}

export default function Home() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [status, setStatus] = useState("");
  const [agent, setAgent] = useState("");
  const [passed, setPassed] = useState("");
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState(false);
  const pageSize = 20;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (submittedQ) params.set("q", submittedQ);
    if (status) params.set("status", status);
    if (agent) params.set("agent", agent);
    if (passed) params.set("passed", passed);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const d = await apiJson<ListResponse>(`/api/traces?${params}`);
    setData(d);
  }, [submittedQ, status, agent, passed, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    apiJson<{ items: Rubric[] }>("/api/rubrics").then((d) => setRubrics(d.items)).catch(() => {});
  }, []);

  const items = data?.items ?? [];
  const pageIds = items.map((t) => t.id);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => checked.has(id));
  const toggleAll = () => {
    const next = new Set(checked);
    if (allChecked) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setChecked(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-[20px] font-semibold tracking-tight">轨迹</h1>
      <ImportZone onImported={() => { setPage(1); void load(); }} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary" />
          <input
            className="input pl-8" placeholder="搜索任务内容 / 工具参数（全文）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); setSubmittedQ(q); } }}
          />
        </div>
        <select className="input w-28" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="error">失败</option>
          <option value="unknown">未知</option>
        </select>
        <select className="input w-36" value={agent} onChange={(e) => { setAgent(e.target.value); setPage(1); }}>
          <option value="">全部 Agent</option>
          {(data?.agents ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="input w-32" value={passed} onChange={(e) => { setPassed(e.target.value); setPage(1); }}>
          <option value="">评分不限</option>
          <option value="pass">已通过</option>
          <option value="fail">未通过</option>
        </select>
        <button
          className="btn-primary"
          disabled={checked.size === 0}
          onClick={() => setDialog(true)}
        >
          批量评分{checked.size > 0 ? `（${checked.size}）` : ""}
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted-bg text-left text-[12px] text-muted">
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2.5">任务摘要</th>
              <th className="px-3 py-2.5">Agent / 模型</th>
              <th className="px-3 py-2.5">状态</th>
              <th className="px-3 py-2.5">步骤</th>
              <th className="px-3 py-2.5">耗时</th>
              <th className="px-3 py-2.5">最新评分</th>
              <th className="px-3 py-2.5">时间</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted-bg/50">
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={checked.has(t.id)} onChange={() => toggleOne(t.id)} onClick={(e) => e.stopPropagation()} />
                </td>
                <td className="max-w-[22rem] px-3 py-2.5">
                  <Link href={`/traces/${t.id}`} className="line-clamp-2 font-medium hover:text-accent">
                    {t.input}
                  </Link>
                  {t.tags.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {t.tags.slice(0, 3).map((tag) => <span key={tag} className="chip">{tag}</span>)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted">
                  <div>{t.agent ?? "—"}</div>
                  <div className="text-[12px] text-fg-tertiary">{t.model ?? ""}</div>
                </td>
                <td className="px-3 py-2.5"><StatusBadge status={t.status} /></td>
                <td className="px-3 py-2.5 text-muted">{t.stepCount}</td>
                <td className="px-3 py-2.5 text-muted">{fmtDuration(t.durationMs)}</td>
                <td className="px-3 py-2.5"><PassBadge passed={t.passed} score={t.overallScore} /></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-fg-tertiary">{fmtDateTime(t.createdAt)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-12 text-center text-fg-tertiary">暂无轨迹，先在上方导入文件</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[12px] text-muted">
        <div>共 {data?.total ?? 0} 条</div>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span className="px-2 py-2">第 {page} 页</span>
          <button
            className="btn-secondary"
            disabled={!data || page * pageSize >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >下一页</button>
        </div>
      </div>

      {dialog && (
        <EvalBatchDialog
          traceIds={Array.from(checked)}
          rubrics={rubrics}
          onClose={() => setDialog(false)}
          onDone={() => void load()}
        />
      )}
    </div>
  );
}
