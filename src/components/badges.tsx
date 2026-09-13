const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  success: { label: "成功", cls: "bg-success-soft text-success" },
  error: { label: "失败", cls: "bg-danger-soft text-danger" },
  unknown: { label: "未知", cls: "bg-muted-bg text-fg-secondary" },
  pending: { label: "等待中", cls: "bg-muted-bg text-fg-secondary" },
  running: { label: "进行中", cls: "bg-accent-soft text-accent" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_MAP[status] ?? STATUS_MAP.unknown;
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-[12px] ${m.cls}`}>{m.label}</span>;
}

export function PassBadge({ passed, score }: { passed?: boolean; score?: number }) {
  if (score === undefined || passed === undefined) {
    return <span className="text-fg-tertiary">未评</span>;
  }
  const cls = passed ? "bg-success-soft text-success" : "bg-danger-soft text-danger";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] ${cls}`}>
      {score.toFixed(1)} · {passed ? "通过" : "未过"}
    </span>
  );
}
