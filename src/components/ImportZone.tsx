"use client";

import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";

interface Report {
  filename: string; total: number; succeeded: number;
  skipped: number; failed: number;
  errors: { line: number | null; reason: string }[];
}

export function ImportZone({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState("");

  async function upload(files: FileList | File[]) {
    const picked = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".json") || f.name.toLowerCase().endsWith(".jsonl"),
    );
    if (picked.length === 0) {
      setError("仅支持 .json / .jsonl 文件");
      return;
    }
    setBusy(true); setError(""); setReports(null);
    try {
      const fd = new FormData();
      picked.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导入失败");
      setReports(data.reports);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}
        className={`card flex cursor-pointer flex-col items-center justify-center gap-2 px-6 py-8 text-center transition ${
          dragging ? "border-accent bg-accent-soft" : "hover:bg-muted-bg"
        }`}
      >
        {busy ? <Loader2 className="animate-spin text-accent" size={22} /> : <UploadCloud size={22} className="text-fg-tertiary" />}
        <div className="text-[13px] font-medium">拖拽 JSON / JSONL 文件到这里，或点击选择（可多文件）</div>
        <div className="text-[12px] text-fg-tertiary">坏行会被隔离，重复轨迹自动跳过</div>
        <input
          ref={inputRef} type="file" accept=".json,.jsonl" multiple hidden
          onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ""; }}
        />
      </div>
      {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</div>}
      {reports && (
        <div className="card space-y-2 p-4">
          {reports.map((r) => (
            <details key={r.filename} className="text-[13px]">
              <summary className="cursor-pointer">
                <span className="font-medium">{r.filename}</span>
                <span className="ml-2 text-muted">
                  共 {r.total} · <span className="text-success">成功 {r.succeeded}</span>
                  {" · "}跳过 {r.skipped} · <span className={r.failed ? "text-danger" : ""}>失败 {r.failed}</span>
                </span>
              </summary>
              {r.errors.length > 0 && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-auto rounded-lg bg-muted-bg p-3 text-[12px]">
                  {r.errors.map((e, i) => (
                    <li key={i}>{e.line === null ? "文件" : `第 ${e.line} 行`}：{e.reason}</li>
                  ))}
                </ul>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
