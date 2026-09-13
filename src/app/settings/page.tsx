"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiJson } from "@/lib/http";

interface SettingsResp {
  baseURL: string; model: string; concurrency: number;
  apiKey: string; hasApiKey: boolean;
}

export default function SettingsPage() {
  const [cfg, setCfg] = useState<SettingsResp | null>(null);
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    apiJson<SettingsResp>("/api/settings").then((d) => {
      setCfg(d);
      setBaseURL(d.baseURL); setModel(d.model);
    }).catch(() => {});
  }, []);

  async function save() {
    setBusy(true); setMsg(""); setErr("");
    try {
      // MVP 裁剪：仅暴露 baseURL / apiKey / model；concurrency 缺省由服务端保留现值。
      await apiJson("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ baseURL, apiKey, model }),
      });
      setMsg("已保存");
      const d = await apiJson<SettingsResp>("/api/settings");
      setCfg(d); setApiKey("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <div className="mx-auto max-w-3xl py-10 text-center text-fg-tertiary">加载中…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-[20px] font-semibold tracking-tight">设置</h1>
      <div className="card space-y-4 p-5">
        <div className="text-[13px] font-semibold">裁判模型</div>
        <label className="block space-y-1 text-[12px] text-muted">
          Base URL（OpenAI 兼容）
          <input className="input" value={baseURL} onChange={(e) => setBaseURL(e.target.value)}
            placeholder="https://api.openai.com/v1" />
        </label>
        <label className="block space-y-1 text-[12px] text-muted">
          API Key{cfg.hasApiKey ? "（留空则不修改）" : ""}
          <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={cfg.hasApiKey ? cfg.apiKey : "sk-..."} autoComplete="off" />
        </label>
        <label className="block space-y-1 text-[12px] text-muted">
          模型名
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
        </label>
        <div className="rounded-lg bg-muted-bg px-3 py-2 text-[12px] text-fg-tertiary">
          留空的配置项会回退到环境变量 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL。
        </div>
        {err && <div className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{err}</div>}
        {msg && <div className="rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success">{msg}</div>}
        <div className="flex justify-end">
          <button className="btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}保存
          </button>
        </div>
      </div>
    </div>
  );
}
