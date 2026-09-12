# Agent 轨迹评测工作台 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `D:\trace-eval` 交付一个本地运行的 Agent 轨迹评测工作台：手动导入 JSON/JSONL 轨迹 → 时间线查看 → 配置 rubric → LLM 裁判（OpenAI 兼容接口）批量自动打分 → 看板统计与 CSV 导出。

**Architecture:** Next.js 15 App Router 全栈单体；better-sqlite3 本地文件库（6 张核心表 + app_settings）；导入时归一化为 canonical schema，原始 JSON 全量保留；评分经进程内并发队列执行；页面为浅色 Apple/Notion/Linear 风格客户端组件，通过 API 路由读写。

**Tech Stack:** Next.js 15 / React 19 / TypeScript 5 / Tailwind CSS v4 / better-sqlite3 11 / openai SDK 4 / zod 3 / vitest 2 / lucide-react

**Spec:** `D:\trace-eval\docs\superpowers\specs\2026-09-12-trace-eval-workbench-design.md`（实施时同时阅读 spec 与本计划）

## Global Constraints

- 本机 Node 为绿色版，不在系统 PATH。每个 PowerShell 命令前必须先加：`$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path;`
- Node 版本 v22.13.0；项目目录固定 `D:\trace-eval`；数据库文件 `data/app.db`，必须 gitignore。
- 包管理器固定 npm（仓库含 package-lock.json），不要引入 pnpm/yarn。
- 视觉：仅浅色；底 `#fbfbfd`；品牌强调紫 `#6d5ae0`；禁止黄/橙/红作为装饰色（红色仅用于错误语义 `#d92d20`，绿色仅成功语义 `#12b76a`）；主按钮黑底白字。颜色只允许通过 `@theme` token 与 `@layer components` 语义类使用，组件内禁止硬编码色值。
- 不做：实时上报、人工标注、登录鉴权、多模型对比、费用换算、规则检查（spec §1.2）。
- 所有 API 路由文件必须含 `export const runtime = "nodejs";`。
- 每个任务结束必须运行该任务的测试/类型检查并提交 git；提交信息用 conventional commits。
- 测试数据库通过环境变量 `TRACEEVAL_DB_PATH` 指向临时文件，禁止污染 `data/app.db`。

## 文件结构总览

| 文件 | 职责 |
|---|---|
| `package.json` / `tsconfig.json` / `next.config.ts` / `postcss.config.mjs` / `.gitignore` / `vitest.config.ts` | 工程配置 |
| `src/app/globals.css` | Tailwind v4 设计 token + 语义类（全站唯一样式入口） |
| `src/app/layout.tsx` | 根布局 + 侧边导航外壳 |
| `src/lib/db.ts` | sqlite 连接、迁移执行、默认 rubric 播种、全部 repository 函数 |
| `src/lib/migrations/001_init.sql` | 全部建表语句（含 FTS5 与触发器） |
| `src/lib/schema.ts` | zod：导入宽松校验 + 裁判输出校验；TS 类型 |
| `src/lib/types.ts` | 领域类型（NormalizedTrace / NormalizedStep / Rubric / JudgeOutput 等） |
| `src/lib/parse.ts` | JSON / JSONL 文件解析（行号错误隔离） |
| `src/lib/normalize.ts` | 任意来源对象 → canonical trace（含 messages/spans 映射） |
| `src/lib/dedupe.ts` | 内容哈希与判重 |
| `src/lib/rubric-defaults.ts` | 默认 5 维度 rubric 与默认裁判 prompt 模板 |
| `src/lib/scoring/weight.ts` | 权重校验、加权总分 |
| `src/lib/scoring/prompt.ts` | 轨迹→Markdown 序列化（截断）、裁判消息构建 |
| `src/lib/scoring/judge.ts` | OpenAI 兼容客户端、调用/解析/重试 |
| `src/lib/queue.ts` | 并发队列 + 单条评分执行器 |
| `src/lib/csv.ts` | CSV 转义与生成 |
| `src/instrumentation.ts` | 启动时悬挂 running 评分复位 |
| `src/app/api/**/route.ts` | 9 个 API 路由 |
| `src/app/(dashboard)/**/page.tsx` | 5 个页面（列表/详情/rubrics/看板/设置） |
| `src/components/**` | 时间线、评分面板、表格、表单等 |
| `src/lib/__tests__/*.test.ts` | 纯函数单元测试 |
| `src/app/api/__tests__/*.test.ts` | API 集成测试 |

---

### Task 1: 项目脚手架 + 设计 token + 布局外壳

**Files:**
- Create: `D:\trace-eval\package.json`、`tsconfig.json`、`next.config.ts`、`postcss.config.mjs`、`.gitignore`、`vitest.config.ts`
- Create: `src/app/globals.css`、`src/app/layout.tsx`、`src/app/page.placeholder.txt`（占位，Task 13 删除）
- Test: 构建冒烟（`npm run build` 通过即可，无需单测）

**Interfaces:**
- Produces: 可运行的 Next.js 空壳；语义类 `btn-primary / btn-secondary / card / input / chip / text-muted`；导航 4 项：轨迹 `/`、看板 `/dashboard`、评分标准 `/rubrics`、设置 `/settings`。

- [ ] **Step 1: 初始化 git 与工程文件**

在 `D:\trace-eval` 创建：

`.gitignore`：
```
node_modules/
.next/
data/
*.log
.env.local
```

`package.json`：
```json
{
  "name": "trace-eval",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.5.0",
    "lucide-react": "^0.454.0",
    "next": "^15.0.3",
    "openai": "^4.73.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.9.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  }
}
```

`tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`：
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

`postcss.config.mjs`：
```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

`vitest.config.ts`：
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

- [ ] **Step 2: 安装依赖并验证测试命令**

Run:
```powershell
$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path; cd D:\trace-eval; npm install
```
Expected: 安装成功，生成 package-lock.json（若 better-sqlite3 预编译二进制下载失败，再运行 `npm rebuild better-sqlite3`）。

- [ ] **Step 3: 写设计 token 与语义类（全站唯一样式入口）**

`src/app/globals.css`：
```css
@import "tailwindcss";

@theme {
  --color-bg: #fbfbfd;
  --color-surface: #ffffff;
  --color-muted-bg: #f5f5f7;
  --color-border: #e8e8ed;
  --color-fg: #1d1d1f;
  --color-fg-secondary: #515154;
  --color-fg-tertiary: #86868b;
  --color-accent: #6d5ae0;
  --color-accent-hover: #5b47d6;
  --color-accent-soft: #f0edfc;
  --color-danger: #d92d20;
  --color-danger-soft: #fef3f2;
  --color-success: #12b76a;
  --color-success-soft: #ecfdf3;
  --radius-card: 12px;
  --font-sans: ui-sans-serif, -apple-system, "Segoe UI", "PingFang SC",
    "Microsoft YaHei", sans-serif;
}

html,
body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-sans);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

@layer components {
  .card {
    @apply bg-surface border border-border rounded-[var(--radius-card)] shadow-[0_2px_12px_-4px_rgba(23,23,30,0.04)];
  }
  .btn-primary {
    @apply inline-flex items-center justify-center gap-1.5 rounded-lg bg-fg px-3.5 py-2 text-[13px] font-medium text-surface transition hover:opacity-90 active:scale-[0.97] disabled:opacity-40;
  }
  .btn-secondary {
    @apply inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-fg transition hover:bg-muted-bg active:scale-[0.97] disabled:opacity-40;
  }
  .input {
    @apply w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-fg outline-none transition placeholder:text-fg-tertiary focus:border-accent;
  }
  .chip {
    @apply inline-flex items-center rounded-md bg-muted-bg px-2 py-0.5 text-[12px] text-fg-secondary;
  }
  .text-muted {
    @apply text-fg-secondary;
  }
  .nav-item {
    @apply flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-fg-secondary transition hover:bg-muted-bg hover:text-fg;
  }
  .nav-item-active {
    @apply bg-accent-soft font-medium text-accent hover:bg-accent-soft hover:text-accent;
  }
}
```

- [ ] **Step 4: 根布局 + 侧边导航**

`src/app/layout.tsx`：
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, BarChart3, SlidersHorizontal, Settings } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = { title: "Trace Eval", description: "Agent 轨迹评测工作台" };

const NAV = [
  { href: "/", label: "轨迹", icon: ListChecks },
  { href: "/dashboard", label: "看板", icon: BarChart3 },
  { href: "/rubrics", label: "评分标准", icon: SlidersHorizontal },
  { href: "/settings", label: "设置", icon: Settings },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen">
          <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-border bg-surface px-3 py-5">
            <div className="px-3 pb-6 text-[15px] font-semibold tracking-tight">
              Trace Eval
            </div>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="nav-item">
                  <item.icon size={15} />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto px-3 text-[11px] text-fg-tertiary">本地评测 · v0.1</div>
          </aside>
          <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

创建最小占位首页 `src/app/page.tsx`（真正首页在 Task 13 替换）：
```tsx
export default function Home() {
  return <div className="text-muted">脚手架就绪。</div>;
}
```

- [ ] **Step 5: 构建冒烟**

Run:
```powershell
$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path; cd D:\trace-eval; npm run build
```
Expected: 编译成功，4 条导航链接存在（nav 中 href 指向的页面 404 属正常，构建不报错即可）。

- [ ] **Step 6: 提交**

```powershell
$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path; cd D:\trace-eval; git init; git add -A; git commit -m "chore: scaffold next.js app with light design tokens"
```

---

### Task 2: 领域类型

**Files:**
- Create: `src/lib/types.ts`

**Interfaces:**
- Produces: 全项目共享类型，后续任务统一引用：

```ts
export type TraceStatus = "success" | "error" | "unknown";
export type StepType =
  | "thought" | "text" | "tool_call" | "tool_result"
  | "error" | "system" | "custom";
export type StepStatus = "running" | "success" | "error";
export type EvalStatus = "pending" | "running" | "success" | "error";

export interface NormalizedStep {
  externalId?: string;
  type: StepType;
  name?: string;
  input?: string;
  output?: string;
  status: StepStatus;
  parentExternalId?: string;
  startedAt?: string;
  endedAt?: string;
  tokenInput?: number;
  tokenOutput?: number;
}

export interface NormalizedTrace {
  externalId?: string;
  agent?: string;
  model?: string;
  input: string;
  output?: string;
  status: TraceStatus;
  startedAt?: string;
  endedAt?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  tokenInput?: number;
  tokenOutput?: number;
  steps: NormalizedStep[];
}

export interface RubricDimension {
  key: string;
  name: string;
  weight: number;
  scale: number;
}

export interface Rubric {
  id: string;
  name: string;
  version: number;
  dimensions: RubricDimension[];
  passThreshold: number;
  promptTemplate: string;
  isDefault: boolean;
  createdAt: string;
}

export interface JudgeScore {
  dimension_key: string;
  score: number;
  rationale: string;
}

export type IssueSeverity = "high" | "medium" | "low";

export interface JudgeIssue {
  step_idx: number | null;
  severity: IssueSeverity;
  dimension_key: string;
  message: string;
}

export interface JudgeOutput {
  scores: JudgeScore[];
  overall_score: number;
  passed: boolean;
  summary: string;
  issues: JudgeIssue[];
}

export interface JudgeConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  concurrency: number;
}

/** 归一化单条结果（成功或带行号的失败） */
export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;
```

- [ ] **Step 1: 创建文件**（内容如上）
- [ ] **Step 2: 类型检查**

Run:
```powershell
$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path; cd D:\trace-eval; npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 3: 提交** `git add -A; git commit -m "feat: add domain types"`

---

### Task 3: 数据库连接、迁移与设置仓储

**Files:**
- Create: `src/lib/migrations/001_init.sql`、`src/lib/db.ts`
- Test: `src/lib/__tests__/db.test.ts`

**Interfaces:**
- Produces:
  - `db: Database`（better-sqlite3 单例，路径取 `process.env.TRACEEVAL_DB_PATH`，否则 `data/app.db`）
  - `getSetting(key): string | undefined`、`setSetting(key, value): void`
  - 启动/首次 import 时自动建表；`_migrations` 记录已执行迁移。

- [ ] **Step 1: 先写失败测试**

`src/lib/__tests__/db.test.ts`：
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";

const dbPath = join(tmpdir(), `trace-eval-db-${process.pid}-${Date.now()}.db`);
process.env.TRACEEVAL_DB_PATH = dbPath;

import { db, getSetting, setSetting } from "@/lib/db";

beforeEach(() => {
  // 每个用例复用同一临时库；测试结束统一关库
});

describe("db", () => {
  it("creates all core tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
      .all()
      .map((r: any) => r.name);
    for (const t of [
      "imports", "traces", "steps", "rubrics", "evaluations", "eval_scores",
      "app_settings", "_migrations", "traces_fts",
    ]) {
      expect(tables).toContain(t);
    }
  });

  it("round-trips settings", () => {
    expect(getSetting("nope")).toBeUndefined();
    setSetting("foo", "bar");
    expect(getSetting("foo")).toBe("bar");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```powershell
$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path; cd D:\trace-eval; npx vitest run src/lib/__tests__/db.test.ts
```
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写迁移 SQL**

`src/lib/migrations/001_init.sql`：
```sql
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  format TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]',
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES imports(id),
  external_id TEXT,
  content_hash TEXT NOT NULL UNIQUE,
  agent TEXT,
  model TEXT,
  input TEXT NOT NULL,
  output TEXT,
  status TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  duration_ms INTEGER,
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  token_input INTEGER,
  token_output INTEGER,
  raw TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);
CREATE INDEX IF NOT EXISTS idx_traces_agent ON traces(agent);
CREATE INDEX IF NOT EXISTS idx_traces_external ON traces(external_id);
CREATE INDEX IF NOT EXISTS idx_traces_created ON traces(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS traces_fts USING fts5(trace_id UNINDEXED, input);

CREATE TRIGGER IF NOT EXISTS traces_ai AFTER INSERT ON traces BEGIN
  INSERT INTO traces_fts(trace_id, input) VALUES (new.id, new.input);
END;
CREATE TRIGGER IF NOT EXISTS traces_ad AFTER DELETE ON traces BEGIN
  DELETE FROM traces_fts WHERE trace_id = old.id;
END;

CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  parent_idx INTEGER,
  type TEXT NOT NULL,
  name TEXT,
  input TEXT,
  output TEXT,
  status TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  duration_ms INTEGER,
  token_input INTEGER,
  token_output INTEGER,
  raw TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_steps_trace ON steps(trace_id, idx);

CREATE TABLE IF NOT EXISTS rubrics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  dimensions_json TEXT NOT NULL,
  pass_threshold REAL NOT NULL,
  prompt_template TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
  rubric_id TEXT NOT NULL REFERENCES rubrics(id),
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  overall_score REAL,
  passed INTEGER,
  summary TEXT,
  issues_json TEXT,
  judge_raw TEXT,
  error TEXT,
  token_input INTEGER,
  token_output INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eval_batch ON evaluations(batch_id);
CREATE INDEX IF NOT EXISTS idx_eval_trace ON evaluations(trace_id);
CREATE INDEX IF NOT EXISTS idx_eval_status ON evaluations(status);

CREATE TABLE IF NOT EXISTS eval_scores (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  dimension_key TEXT NOT NULL,
  score REAL NOT NULL,
  rationale TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_eval ON eval_scores(evaluation_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 4: 写 db.ts 连接/迁移/设置函数**

`src/lib/db.ts`：
```ts
import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const dbPath =
  process.env.TRACEEVAL_DB_PATH ?? join(process.cwd(), "data", "app.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`);

function runMigrations() {
  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  const dir = join(process.cwd(), "src", "lib", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations(name, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString(),
      );
    });
    tx();
  }
}
runMigrations();

export function getSetting(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function newId(): string {
  return crypto.randomUUID();
}
```

注意：测试中迁移目录依赖 `process.cwd()`，vitest 配置运行目录即项目根，成立。

- [ ] **Step 5: 运行测试确认通过**

Run:
```powershell
$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path; cd D:\trace-eval; npx vitest run src/lib/__tests__/db.test.ts
```
Expected: 2 个测试 PASS。

- [ ] **Step 6: 提交** `git add -A; git commit -m "feat: sqlite connection, migrations and settings"`

---

### Task 4: 文件解析（JSON / JSONL，坏行隔离）

**Files:**
- Create: `src/lib/parse.ts`
- Test: `src/lib/__tests__/parse.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LineError { line: number | null; reason: string; }
  export interface ParsedFile { records: unknown[]; errors: LineError[]; }
  export function parseTraceFile(filename: string, text: string): ParsedFile;
  ```
  不支持的扩展名抛 `Error("UNSUPPORTED_FORMAT")`。

- [ ] **Step 1: 先写失败测试**

`src/lib/__tests__/parse.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { parseTraceFile } from "@/lib/parse";

describe("parseTraceFile", () => {
  it("parses a single json object", () => {
    const r = parseTraceFile("a.json", JSON.stringify({ input: "hi" }));
    expect(r.records).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
  });

  it("parses a json array", () => {
    const r = parseTraceFile("a.json", JSON.stringify([{ input: "1" }, { input: "2" }]));
    expect(r.records).toHaveLength(2);
  });

  it("reports syntax error for broken json with no line", () => {
    const r = parseTraceFile("a.json", "{ broken");
    expect(r.records).toHaveLength(0);
    expect(r.errors[0].line).toBeNull();
  });

  it("parses jsonl and isolates bad lines with line numbers", () => {
    const text = [JSON.stringify({ input: "1" }), "not-json", "", JSON.stringify({ input: "2" })].join("\n");
    const r = parseTraceFile("a.jsonl", text);
    expect(r.records).toHaveLength(2);
    expect(r.errors).toEqual([{ line: 2, reason: expect.stringContaining("JSON") }]);
  });

  it("flags non-object json lines", () => {
    const r = parseTraceFile("a.jsonl", "123\n");
    expect(r.errors[0]).toMatchObject({ line: 1, reason: expect.stringContaining("对象") });
  });

  it("throws for unsupported extension", () => {
    expect(() => parseTraceFile("a.txt", "{}")).toThrow("UNSUPPORTED_FORMAT");
  });
});
```

- [ ] **Step 2: 运行确认失败**：`npx vitest run src/lib/__tests__/parse.test.ts` → FAIL（无模块）。

- [ ] **Step 3: 实现**

`src/lib/parse.ts`：
```ts
import type { LineError, ParsedFile } from "./parse-types";
export type { LineError, ParsedFile } from "./parse-types";

export function parseTraceFile(filename: string, text: string): ParsedFile {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext !== "json" && ext !== "jsonl") throw new Error("UNSUPPORTED_FORMAT");

  if (ext === "json") {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return { records: data, errors: [] };
      }
      return { records: [data], errors: [] };
    } catch (e) {
      return { records: [], errors: [{ line: null, reason: `JSON 解析失败: ${(e as Error).message}` }] };
    }
  }

  const records: unknown[] = [];
  const errors: LineError[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        errors.push({ line: i + 1, reason: "每行必须是 JSON 对象" });
        return;
      }
      records.push(obj);
    } catch (e) {
      errors.push({ line: i + 1, reason: `JSON 解析失败: ${(e as Error).message}` });
    }
  });
  return { records, errors };
}
```
并创建 `src/lib/parse-types.ts`：
```ts
export interface LineError { line: number | null; reason: string; }
export interface ParsedFile { records: unknown[]; errors: LineError[]; }
```
（拆类型文件是为了让 API 与测试引用时不产生循环。）

- [ ] **Step 4: 测试通过** → 6 个 PASS。
- [ ] **Step 5: 提交** `git add -A; git commit -m "feat: parse json/jsonl trace files with per-line errors"`

---

### Task 5: 归一化器（canonical schema 映射）

**Files:**
- Create: `src/lib/normalize.ts`
- Test: `src/lib/__tests__/normalize.test.ts`

**Interfaces:**
- Consumes: `Result<T>`、`NormalizedTrace` 等（Task 2）。
- Produces:
  ```ts
  export function normalizeTrace(raw: unknown): Result<NormalizedTrace>;
  export function computeDurationMs(start?: string, end?: string): number | undefined;
  ```

- [ ] **Step 1: 先写失败测试**

`src/lib/__tests__/normalize.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { normalizeTrace } from "@/lib/normalize";

describe("normalizeTrace", () => {
  it("passes through canonical shape", () => {
    const r = normalizeTrace({
      input: "做个表",
      status: "success",
      tags: ["x"],
      steps: [{ type: "thought", input: "想想", status: "success" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.input).toBe("做个表");
    expect(r.value.status).toBe("success");
    expect(r.value.tags).toEqual(["x"]);
    expect(r.value.steps[0].type).toBe("thought");
  });

  it("fails when input is missing", () => {
    const r = normalizeTrace({ steps: [] });
    expect(r.ok).toBe(false);
  });

  it("maps top-level aliases task/final_answer", () => {
    const r = normalizeTrace({ task: "t", final_answer: "a" });
    expect(r.ok && r.value.input).toBe("t");
    expect(r.ok && r.value.output).toBe("a");
  });

  it("maps chat messages: assistant tool_calls + tool result with parent", () => {
    const r = normalizeTrace({
      input: "读文件",
      messages: [
        { role: "assistant", content: "我先读", tool_calls: [
          { id: "c1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
        ] },
        { role: "tool", tool_call_id: "c1", content: "hello" },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    const types = r.value.steps.map((s) => s.type);
    expect(types).toEqual(["thought", "tool_call", "tool_result"]);
    const call = r.value.steps[1];
    expect(call.name).toBe("read_file");
    expect(call.input).toBe('{"path":"a.txt"}');
    expect(r.value.steps[2].parentExternalId).toBe("c1");
  });

  it("uses first user message as input when top input absent", () => {
    const r = normalizeTrace({ messages: [{ role: "user", content: "帮我查" }] });
    expect(r.ok && r.value.input).toBe("帮我查");
  });

  it("maps spans aliases and unknown steps become custom", () => {
    const r = normalizeTrace({
      input: "x",
      spans: [
        { kind: "tool_use", tool: "write", args: { f: 1 }, is_error: true },
        { weird: true },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.steps[0].type).toBe("tool_call");
    expect(r.value.steps[0].name).toBe("write");
    expect(r.value.steps[0].status).toBe("error");
    expect(r.value.steps[1].type).toBe("custom");
  });

  it("converts numeric timestamps (seconds and ms) and computes duration", () => {
    const r = normalizeTrace({
      input: "x",
      started_at: 1700000000,
      ended_at: 1700000060,
      steps: [{ type: "text", started_at: 1700000000000, ended_at: 1700000001000 }],
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.startedAt).toBe(new Date(1700000000000).toISOString());
    expect(r.value.durationMsTop === undefined).toBe(true); // 仅结构示意，见实现字段
  });

  it("infers step status success by default and error from error field", () => {
    const r = normalizeTrace({ input: "x", steps: [{ type: "text" }, { type: "text", error: { msg: "boom" } }] });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.steps[0].status).toBe("success");
    expect(r.value.steps[1].status).toBe("error");
  });

  it("stringifies object inputs/outputs", () => {
    const r = normalizeTrace({ input: "x", steps: [{ type: "tool_result", output: { a: 1 } }] });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.steps[0].output).toBe('{"a":1}');
  });
});
```
注意第 7 个用例只验证 `startedAt` 转换；顶层 duration 在库写入时推导（spec 4.2），因此归一化类型不含顶层 duration 字段——删除该用例中的多余断言，最终测试体保留到 `expect(r.value.startedAt)...` 为止。

- [ ] **Step 2: 运行确认失败**：`npx vitest run src/lib/__tests__/normalize.test.ts` → FAIL。

- [ ] **Step 3: 实现**

`src/lib/normalize.ts`：
```ts
import type {
  NormalizedStep, NormalizedTrace, Result, StepStatus, StepType, TraceStatus,
} from "@/lib/types";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const pickStr = (o: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return undefined;
};

const fieldText = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
};

const pickField = (o: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const t = fieldText(o[k]);
    if (t !== undefined) return t;
  }
  return undefined;
};

const pickNum = (o: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
};

export function toIso(v: unknown): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

export function computeDurationMs(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

const STATUS_ALIAS: Record<string, StepStatus> = {
  running: "running", pending: "running",
  success: "success", ok: "success", completed: "success", complete: "success", done: "success",
  error: "error", failed: "error", failure: "failed" as unknown as StepStatus,
};
const failure = STATUS_ALIAS;
void failure;
STATUS_ALIAS.failure = "error";
STATUS_ALIAS.failed = "error";

const TRACE_STATUS_ALIAS: Record<string, TraceStatus> = {
  success: "success", ok: "success", completed: "success",
  error: "error", failed: "error", failure: "error",
  unknown: "unknown",
};

const TYPE_ALIASES: Record<string, StepType> = {
  thought: "thought", thinking: "thought", reasoning: "thought", reason: "thought",
  text: "text", message: "text", assistant: "text",
  tool_call: "tool_call", tool_use: "tool_call", function: "tool_call",
  call: "tool_call", tool: "tool_call",
  tool_result: "tool_result", observation: "tool_result", result: "tool_result",
  error: "error",
  system: "system",
};

function tokenPair(o: Record<string, unknown>): { i?: number; o?: number } {
  const tu = isObj(o.token_usage) ? o.token_usage : o;
  const i = pickNum(tu as Record<string, unknown>, ["input", "input_tokens", "prompt_tokens"]);
  const out = pickNum(tu as Record<string, unknown>, ["output", "output_tokens", "completion_tokens"]);
  return { i, o: out };
}

function normalizeStep(item: unknown): NormalizedStep | null {
  if (!isObj(item)) return null;
  const rawType = pickStr(item, ["type", "kind", "step_type", "event_type", "role"])?.toLowerCase();
  const type: StepType = (rawType && TYPE_ALIASES[rawType]) || "custom";
  const statusRaw = pickStr(item, ["status", "state"])?.toLowerCase();
  const hasError = item.error !== undefined && item.error !== false && item.error !== null;
  const status: StepStatus =
    (statusRaw && STATUS_ALIAS[statusRaw]) || (hasError || type === "error" ? "error" : "success");
  const { i, o } = tokenPair(item);
  const startedAt = toIso(item.started_at ?? item.startTime ?? item.start);
  const endedAt = toIso(item.ended_at ?? item.endTime ?? item.end);
  return {
    externalId: pickStr(item, ["id", "span_id"]),
    type,
    name: pickStr(item, ["name", "tool_name", "tool"]),
    input: pickField(item, ["input", "arguments", "args", "params", "content", "text", "thinking", "thought"]),
    output: pickField(item, ["output", "result", "observation", "response", "returns"]),
    status,
    parentExternalId: pickStr(item, ["parent_id", "parentId", "parent"]),
    startedAt,
    endedAt,
    tokenInput: i,
    tokenOutput: o,
  };
}

function stepsFromMessages(messages: unknown[], fallbackInput: { v?: string }): NormalizedStep[] {
  const steps: NormalizedStep[] = [];
  for (const msg of messages) {
    if (!isObj(msg)) continue;
    const role = pickStr(msg, ["role"])?.toLowerCase();
    const content = fieldText(msg.content);
    if (role === "user") {
      if (!fallbackInput.v && content) fallbackInput.v = content;
      continue;
    }
    if (role === "assistant") {
      if (content) steps.push({ type: "thought", input: content, status: "success" });
      for (const tc of Array.isArray(msg.tool_calls) ? msg.tool_calls : []) {
        if (!isObj(tc)) continue;
        const fn = isObj(tc.function) ? tc.function : tc;
        steps.push({
          externalId: pickStr(tc, ["id"]),
          type: "tool_call",
          name: pickStr(fn as Record<string, unknown>, ["name"]) ?? pickStr(tc, ["name"]),
          input: pickField(fn as Record<string, unknown>, ["arguments", "input"]) ?? pickField(tc, ["arguments", "input"]),
          status: "success",
        });
      }
    } else if (role === "tool") {
      steps.push({
        type: "tool_result",
        name: pickStr(msg, ["name"]),
        output: content,
        status: msg.is_error ? "error" : "success",
        parentExternalId: pickStr(msg, ["tool_call_id"]),
      });
    } else if (role === "system") {
      if (content) steps.push({ type: "system", input: content, status: "success" });
    } else if (content) {
      steps.push({ type: "custom", input: content, status: "success" });
    }
  }
  return steps;
}

export function normalizeTrace(raw: unknown): Result<NormalizedTrace> {
  if (!isObj(raw)) return { ok: false, error: "记录必须是 JSON 对象" };

  const fallbackInput: { v?: string } = {};
  let steps: NormalizedStep[] = [];
  const rawSteps = raw.steps ?? raw.spans ?? raw.events;
  if (Array.isArray(rawSteps)) {
    steps = rawSteps.map(normalizeStep).filter((s): s is NormalizedStep => s !== null);
  } else if (Array.isArray(raw.messages)) {
    steps = stepsFromMessages(raw.messages, fallbackInput);
  }

  const input =
    pickStr(raw, ["input", "task", "prompt", "query", "question"]) ?? fallbackInput.v;
  if (!input) return { ok: false, error: "缺少必填字段 input" };

  const statusRaw = pickStr(raw, ["status", "state"])?.toLowerCase();
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => fieldText(t)).filter((t): t is string => !!t)
    : [];
  const { i, o } = tokenPair(raw);
  const startedAt = toIso(raw.started_at ?? raw.startTime ?? raw.start);
  const endedAt = toIso(raw.ended_at ?? raw.endTime ?? raw.end);

  return {
    ok: true,
    value: {
      externalId: pickStr(raw, ["id", "trace_id"]),
      agent: pickStr(raw, ["agent", "agent_name"]),
      model: pickStr(raw, ["model"]),
      input,
      output: pickField(raw, ["output", "result", "final_answer", "response"]),
      status: (statusRaw && TRACE_STATUS_ALIAS[statusRaw]) || "unknown",
      startedAt,
      endedAt,
      tags,
      metadata: isObj(raw.metadata) ? raw.metadata : {},
      tokenInput: i,
      tokenOutput: o,
      steps,
    },
  };
}
```
注意：实现中 `STATUS_ALIAS` 的两次赋值写法在提交时简化为一次性字面量（`failed/ failure → "error"`），删除 `failure = STATUS_ALIAS; void failure;` 三行，保持代码整洁。

- [ ] **Step 4: 测试通过**：8 个 PASS。
- [ ] **Step 5: 提交** `git commit -m "feat: normalize arbitrary trace shapes into canonical schema"`

---

### Task 6: 去重哈希

**Files:**
- Create: `src/lib/dedupe.ts`
- Test: `src/lib/__tests__/dedupe.test.ts`

**Interfaces:**
- Produces: `export function contentHash(t: NormalizedTrace): string`（sha1 hex）。

- [ ] **Step 1: 先写失败测试**
```ts
import { describe, it, expect } from "vitest";
import { contentHash } from "@/lib/dedupe";
import type { NormalizedTrace } from "@/lib/types";

const base = (over: Partial<NormalizedTrace> = {}): NormalizedTrace => ({
  input: "同一句话", status: "unknown", tags: [], metadata: {}, steps: [], ...over,
});

describe("contentHash", () => {
  it("is stable for same input/steps/time", () => {
    expect(contentHash(base())).toBe(contentHash(base()));
    expect(contentHash(base())).toMatch(/^[0-9a-f]{40}$/);
  });
  it("changes when input, step count or time differs", () => {
    const h = contentHash(base());
    expect(contentHash(base({ input: "另一句" }))).not.toBe(h);
    expect(contentHash(base({ steps: [{ type: "text", status: "success" }] }))).not.toBe(h);
    expect(contentHash(base({ startedAt: "2026-01-01T00:00:00.000Z" }))).not.toBe(h);
  });
});
```

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**

`src/lib/dedupe.ts`：
```ts
import { createHash } from "node:crypto";
import type { NormalizedTrace } from "@/lib/types";

export function contentHash(t: NormalizedTrace): string {
  const basis = `${t.input}\n${t.steps.length}\n${t.startedAt ?? ""}`;
  return createHash("sha1").update(basis).digest("hex");
}
```

- [ ] **Step 4: 测试通过**（2 个 PASS）。
- [ ] **Step 5: 提交** `git commit -m "feat: content hash for import dedupe"`

---

### Task 7: 仓储层 — imports / traces / steps

**Files:**
- Create: `src/lib/repo.ts`
- Test: `src/lib/__tests__/repo.test.ts`

**Interfaces:**
- Consumes: `db`/`newId`（Task 3）、`NormalizedTrace`（Task 5）、`contentHash`（Task 6）。
- Produces:
  ```ts
  export interface TraceListItem {
    id: string; agent?: string; model?: string; input: string;
    status: string; stepCount: number; durationMs?: number;
    createdAt: string; overallScore?: number; passed?: boolean; tags: string[];
  }
  export interface TraceDetail { trace: TraceListItem & { externalId?; output?; startedAt?; endedAt?; tokenInput?; tokenOutput?; metadata: unknown }; steps: StepRow[]; }
  export interface StepRow { idx: number; parentIdx: number | null; type: string; name?: string; input?: string; output?: string; status: string; durationMs?: number; }
  export interface ImportReport { id: string; filename: string; format: string; total: number; succeeded: number; skipped: number; failed: number; errors: { line: number | null; reason: string }[]; importedAt: string; }
  export function findTraceId(externalId: string | undefined, hash: string): string | undefined;
  export function insertImportAndTraces(filename: string, format: string, entries: { raw: unknown; normalized: NormalizedTrace }[], parseErrors: { line: number | null; reason: string }[]): ImportReport;
  export function listTraces(p: { q?: string; status?: string; agent?: string; tag?: string; passed?: "pass" | "fail"; page: number; pageSize: number }): { items: TraceListItem[]; total: number };
  export function getTraceDetail(id: string): TraceDetail | null;
  export function listImports(): ImportReport[];
  export function listAgents(): string[];
  ```
  去重规则：externalId 命中优先，否则 content_hash 唯一索引命中；重复条目计入 skipped。

- [ ] **Step 1: 先写失败测试**

`src/lib/__tests__/repo.test.ts`：
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.TRACEEVAL_DB_PATH = join(tmpdir(), `trace-eval-repo-${process.pid}-${Date.now()}.db`);

import { normalizeTrace } from "@/lib/normalize";
import { contentHash } from "@/lib/dedupe";
import {
  insertImportAndTraces, listTraces, getTraceDetail, findTraceId, listImports,
} from "@/lib/repo";

const mk = (input: string, extra: Record<string, unknown> = {}) => {
  const r = normalizeTrace({ input, ...extra });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

beforeAll(() => {
  // 触发 db 模块迁移即可
});

describe("import + query repository", () => {
  it("inserts traces with steps and reads them back", () => {
    const t1 = mk("读一下文件", {
      agent: "a1", model: "m1", status: "success",
      started_at: 1700000000, ended_at: 1700000003,
      steps: [
        { id: "s1", type: "tool_call", name: "read", arguments: { p: 1 }, status: "success" },
        { type: "tool_result", parent_id: "s1", content: "ok" },
      ],
    });
    const report = insertImportAndTraces("f.jsonl", "jsonl", [{ raw: { input: "读一下文件" }, normalized: t1 }], []);
    expect(report.succeeded).toBe(1);
    expect(report.skipped).toBe(0);

    const list = listTraces({ page: 1, pageSize: 10 });
    expect(list.total).toBe(1);
    expect(list.items[0].stepCount).toBe(2);
    expect(list.items[0].durationMs).toBe(3000);

    const detail = getTraceDetail(list.items[0].id)!;
    expect(detail.steps[1].parentIdx).toBe(0);
  });

  it("skips duplicates by external id and by content hash", () => {
    const t = mk("判重任务", { id: "ext-1" });
    insertImportAndTraces("a.json", "json", [{ raw: { input: "判重任务", id: "ext-1" }, normalized: t }], []);
    const r2 = insertImportAndTraces("b.json", "json", [{ raw: { input: "判重任务", id: "ext-1" }, normalized: t }], []);
    expect(r2.skipped).toBe(1);

    const t2 = mk("无外部ID的任务");
    insertImportAndTraces("c.json", "json", [{ raw: { input: "无外部ID的任务" }, normalized: t2 }], []);
    const r4 = insertImportAndTraces("d.json", "json", [{ raw: { input: "无外部ID的任务" }, normalized: t2 }], []);
    expect(r4.skipped).toBe(1);
  });

  it("counts parse failures into the report", () => {
    const t = mk("正常的一条");
    const r = insertImportAndTraces("e.jsonl", "jsonl", [{ raw: {}, normalized: t }], [{ line: 2, reason: "JSON 解析失败" }]);
    expect(r.failed).toBe(1);
    expect(r.total).toBe(2);
    expect(r.errors[0].line).toBe(2);
  });

  it("searches by FTS and filters by status", () => {
    insertImportAndTraces("g.json", "json", [{ raw: {}, normalized: mk("帮我查明天的天气") }], []);
    expect(listTraces({ q: "天气", page: 1, pageSize: 10 }).total).toBeGreaterThanOrEqual(1);
    expect(listTraces({ status: "unknown", page: 1, pageSize: 100 }).items.length).toBeGreaterThan(0);
  });

  it("lists imports newest first", () => {
    const rows = listImports();
    expect(rows.length).toBeGreaterThan(1);
    expect(new Date(rows[0].importedAt).getTime()).toBeGreaterThanOrEqual(new Date(rows[1].importedAt).getTime());
  });

  it("exposes findTraceId for external id lookup", () => {
    const t = mk("外部ID查询", { id: "ext-lookup" });
    insertImportAndTraces("h.json", "json", [{ raw: {}, normalized: t }], []);
    expect(findTraceId("ext-lookup", contentHash(t))).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行确认失败**：`npx vitest run src/lib/__tests__/repo.test.ts` → FAIL。

- [ ] **Step 3: 实现**

`src/lib/repo.ts`：
```ts
import { db, newId } from "./db";
import { computeDurationMs } from "./normalize";
import { contentHash } from "./dedupe";
import type { NormalizedTrace, StepType } from "./types";

export interface LineError { line: number | null; reason: string; }
export interface StepRow {
  idx: number; parentIdx: number | null; type: StepType | "custom";
  name?: string; input?: string; output?: string; status: string;
  startedAt?: string; endedAt?: string; durationMs?: number;
  tokenInput?: number; tokenOutput?: number;
}
export interface TraceListItem {
  id: string; externalId?: string; agent?: string; model?: string;
  input: string; output?: string; status: string;
  startedAt?: string; endedAt?: string; durationMs?: number;
  tags: string[]; tokenInput?: number; tokenOutput?: number;
  stepCount: number; createdAt: string;
  overallScore?: number; passed?: boolean;
}
export interface TraceDetail { trace: TraceListItem; steps: StepRow[]; }
export interface ImportReport {
  id: string; filename: string; format: string;
  total: number; succeeded: number; skipped: number; failed: number;
  errors: LineError[]; importedAt: string;
}

const LATEST_EVAL = `LEFT JOIN evaluations le ON le.id = (
  SELECT id FROM evaluations WHERE trace_id = t.id AND status = 'success'
  ORDER BY created_at DESC, rowid DESC LIMIT 1
)`;

export function findTraceId(externalId: string | undefined, hash: string): string | undefined {
  if (externalId) {
    const r = db.prepare("SELECT id FROM traces WHERE external_id = ? LIMIT 1").get(externalId) as { id: string } | undefined;
    if (r) return r.id;
  }
  const r = db.prepare("SELECT id FROM traces WHERE content_hash = ? LIMIT 1").get(hash) as { id: string } | undefined;
  return r?.id;
}

interface Entry { raw: unknown; normalized: NormalizedTrace }

export function insertImportAndTraces(
  filename: string, format: string, entries: Entry[], parseErrors: LineError[],
): ImportReport {
  const importId = newId();
  const importedAt = new Date().toISOString();
  let succeeded = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const { raw, normalized } of entries) {
      const hash = contentHash(normalized);
      if (findTraceId(normalized.externalId, hash)) {
        skipped++;
        continue;
      }
      const traceId = newId();
      const durationMs = computeDurationMs(normalized.startedAt, normalized.endedAt);
      db.prepare(
        `INSERT INTO traces (id, import_id, external_id, content_hash, agent, model,
          input, output, status, started_at, ended_at, duration_ms, tags_json,
          metadata_json, token_input, token_output, raw, created_at)
         VALUES (@id, @import_id, @external_id, @content_hash, @agent, @model,
          @input, @output, @status, @started_at, @ended_at, @duration_ms, @tags_json,
          @metadata_json, @token_input, @token_output, @raw, @created_at)`,
      ).run({
        id: traceId, import_id: importId, external_id: normalized.externalId ?? null,
        content_hash: hash, agent: normalized.agent ?? null, model: normalized.model ?? null,
        input: normalized.input, output: normalized.output ?? null, status: normalized.status,
        started_at: normalized.startedAt ?? null, ended_at: normalized.endedAt ?? null,
        duration_ms: durationMs ?? null, tags_json: JSON.stringify(normalized.tags),
        metadata_json: JSON.stringify(normalized.metadata),
        token_input: normalized.tokenInput ?? null, token_output: normalized.tokenOutput ?? null,
        raw: JSON.stringify(raw), created_at: importedAt,
      });

      const idToIdx = new Map<string, number>();
      normalized.steps.forEach((s, i) => { if (s.externalId) idToIdx.set(s.externalId, i); });
      const insStep = db.prepare(
        `INSERT INTO steps (id, trace_id, idx, parent_idx, type, name, input, output,
          status, started_at, ended_at, duration_ms, token_input, token_output, raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      normalized.steps.forEach((s, idx) => {
        insStep.run(
          newId(), traceId, idx,
          s.parentExternalId && idToIdx.has(s.parentExternalId) ? idToIdx.get(s.parentExternalId)! : null,
          s.type, s.name ?? null, s.input ?? null, s.output ?? null, s.status,
          s.startedAt ?? null, s.endedAt ?? null,
          computeDurationMs(s.startedAt, s.endedAt) ?? null,
          s.tokenInput ?? null, s.tokenOutput ?? null, JSON.stringify(s),
        );
      });
      succeeded++;
    }

    db.prepare(
      `INSERT INTO imports (id, filename, format, total, succeeded, skipped, failed, errors_json, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      importId, filename, format, entries.length + parseErrors.length,
      succeeded, skipped, parseErrors.length, JSON.stringify(parseErrors.slice(0, 200)), importedAt,
    );
  });
  tx();

  return {
    id: importId, filename, format, total: entries.length + parseErrors.length,
    succeeded, skipped, failed: parseErrors.length,
    errors: parseErrors.slice(0, 200), importedAt,
  };
}

function mapTraceRow(r: Record<string, unknown>): TraceListItem {
  return {
    id: r.id as string, externalId: (r.external_id as string) ?? undefined,
    agent: (r.agent as string) ?? undefined, model: (r.model as string) ?? undefined,
    input: r.input as string, output: (r.output as string) ?? undefined,
    status: r.status as string, startedAt: (r.started_at as string) ?? undefined,
    endedAt: (r.ended_at as string) ?? undefined, durationMs: (r.duration_ms as number) ?? undefined,
    tags: JSON.parse((r.tags_json as string) ?? "[]"),
    tokenInput: (r.token_input as number) ?? undefined,
    tokenOutput: (r.token_output as number) ?? undefined,
    stepCount: Number(r.step_count ?? 0), createdAt: r.created_at as string,
    overallScore: r.overall_score === null || r.overall_score === undefined ? undefined : Number(r.overall_score),
    passed: r.passed === null || r.passed === undefined ? undefined : !!r.passed,
  };
}

export interface ListParams {
  q?: string; status?: string; agent?: string; tag?: string;
  passed?: "pass" | "fail"; page: number; pageSize: number;
}

function buildWhere(p: ListParams): { clause: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (p.status) { conds.push("t.status = ?"); params.push(p.status); }
  if (p.agent) { conds.push("t.agent = ?"); params.push(p.agent); }
  if (p.tag) { conds.push("EXISTS (SELECT 1 FROM json_each(t.tags_json) WHERE value = ?)"); params.push(p.tag); }
  if (p.q) {
    const phrase = `"${p.q.replace(/"/g, '""')}"`;
    conds.push("t.id IN (SELECT trace_id FROM traces_fts WHERE traces_fts MATCH ?)");
    params.push(phrase);
  }
  if (p.passed) { conds.push("le.passed = ?"); params.push(p.passed === "pass" ? 1 : 0); }
  return { clause: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

export function listTraces(p: ListParams): { items: TraceListItem[]; total: number } {
  const { clause, params } = buildWhere(p);
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM traces t ${LATEST_EVAL} ${clause}`).get(...params) as { c: number }).c;
  const offset = (p.page - 1) * p.pageSize;
  const rows = db.prepare(
    `SELECT t.*, le.overall_score, le.passed,
       (SELECT COUNT(*) FROM steps WHERE trace_id = t.id) AS step_count
     FROM traces t ${LATEST_EVAL} ${clause}
     ORDER BY t.created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
  ).all(...params, p.pageSize, offset) as Record<string, unknown>[];
  return { items: rows.map(mapTraceRow), total };
}

export function getTraceDetail(id: string): TraceDetail | null {
  const row = db.prepare("SELECT t.* FROM traces t WHERE t.id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const stepRows = db.prepare(
    `SELECT idx, parent_idx, type, name, input, output, status, started_at, ended_at,
            duration_ms, token_input, token_output
     FROM steps WHERE trace_id = ? ORDER BY idx`,
  ).all(id) as Record<string, unknown>[];
  return {
    trace: { ...mapTraceRow({ ...row, step_count: stepRows.length }) },
    steps: stepRows.map((s) => ({
      idx: Number(s.idx), parentIdx: (s.parent_idx as number | null) ?? null,
      type: s.type as StepRow["type"], name: (s.name as string) ?? undefined,
      input: (s.input as string) ?? undefined, output: (s.output as string) ?? undefined,
      status: s.status as string, startedAt: (s.started_at as string) ?? undefined,
      endedAt: (s.ended_at as string) ?? undefined, durationMs: (s.duration_ms as number) ?? undefined,
      tokenInput: (s.token_input as number) ?? undefined,
      tokenOutput: (s.token_output as number) ?? undefined,
    })),
  };
}

export function listImports(): ImportReport[] {
  const rows = db.prepare("SELECT * FROM imports ORDER BY imported_at DESC, rowid DESC").all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string, filename: r.filename as string, format: r.format as string,
    total: Number(r.total), succeeded: Number(r.succeeded), skipped: Number(r.skipped),
    failed: Number(r.failed), importedAt: r.imported_at as string,
    errors: JSON.parse((r.errors_json as string) ?? "[]"),
  }));
}

export function listAgents(): string[] {
  const rows = db.prepare("SELECT DISTINCT agent FROM traces WHERE agent IS NOT NULL").all() as { agent: string }[];
  return rows.map((r) => r.agent);
}
```

- [ ] **Step 4: 测试通过**（6 个 PASS）。
- [ ] **Step 5: 提交** `git commit -m "feat: repositories for imports, traces and steps"`

---

### Task 8: 默认 rubric、权重计算、rubric/evaluation 仓储

**Files:**
- Create: `src/lib/rubric-defaults.ts`、`src/lib/scoring/weight.ts`、`src/lib/repo-rubric.ts`
- Test: `src/lib/__tests__/weight.test.ts`、`src/lib/__tests__/repo-rubric.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DEFAULT_RUBRIC_DRAFT: { name: string; dimensions: RubricDimension[]; passThreshold: number };
  export const DEFAULT_PROMPT_TEMPLATE: string;
  export function validateWeights(dimensions: RubricDimension[]): boolean;
  export function weightedScore(dimensions: RubricDimension[], scores: Record<string, number>): number;
  export function listRubrics(): Rubric[];
  export function getRubric(id: string): Rubric | null;
  export function getDefaultRubric(): Rubric;            // 无则播种 v1
  export function createRubric(input: { name; dimensions; passThreshold; promptTemplate; makeDefault }): Rubric;
  export function setDefaultRubric(id: string): void;
  export function createEvaluationBatch(batchId: string, traceIds: string[], rubricId: string, model: string): string[];
  export function getBatchStatus(batchId: string): { total: number; pending: number; running: number; success: number; error: number };
  export function listEvaluationsByTrace(traceId: string): EvaluationRow[];
  export function getEvaluation(id: string): EvaluationRow | null;
  export function saveEvaluationSuccess(id: string, data: { output: JudgeOutput; raw: string; latencyMs: number; tokenInput?: number; tokenOutput?: number; passThreshold: number }): void;
  export function saveEvaluationError(id: string, error: string, raw?: string): void;
  export function markEvaluationRunning(id: string): void;
  export function resetRunningEvaluations(): number;
  ```

- [ ] **Step 1: 权重测试（先失败）**

`src/lib/__tests__/weight.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { validateWeights, weightedScore } from "@/lib/scoring/weight";
import { DEFAULT_RUBRIC_DRAFT } from "@/lib/rubric-defaults";

const dims = DEFAULT_RUBRIC_DRAFT.dimensions;

describe("validateWeights", () => {
  it("accepts weights summing to 1 within 0.01", () => {
    expect(validateWeights(dims)).toBe(true);
  });
  it("rejects sums far from 1", () => {
    expect(validateWeights(dims.map((d) => ({ ...d, weight: 0.1 })))).toBe(false);
  });
});

describe("weightedScore", () => {
  it("computes weighted total rounded to 2 decimals", () => {
    const scores = { task_completion: 5, tool_accuracy: 3, trajectory: 4, recovery: 2, safety: 5 };
    // 0.3*5 + 0.3*3 + 0.2*4 + 0.1*2 + 0.1*5 = 4.3
    expect(weightedScore(dims, scores)).toBe(4.3);
  });
  it("treats missing dimensions as zero contribution", () => {
    expect(weightedScore(dims, { task_completion: 5 })).toBe(1.5);
  });
});
```

- [ ] **Step 2: 运行确认失败**。

- [ ] **Step 3: 实现默认值与权重**

`src/lib/rubric-defaults.ts`：
```ts
import type { RubricDimension } from "@/lib/types";

export const DEFAULT_RUBRIC_DRAFT = {
  name: "Agent 通用评分 v1",
  passThreshold: 4.0,
  dimensions: [
    { key: "task_completion", name: "任务完成度", weight: 0.3, scale: 5 },
    { key: "tool_accuracy", name: "工具调用正确性", weight: 0.3, scale: 5 },
    { key: "trajectory", name: "路径效率", weight: 0.2, scale: 5 },
    { key: "recovery", name: "错误自修复", weight: 0.1, scale: 5 },
    { key: "safety", name: "安全与合规", weight: 0.1, scale: 5 },
  ] satisfies RubricDimension[],
};

export const DEFAULT_PROMPT_TEMPLATE = `你是严格的 Agent 轨迹评审。请依据评分维度对下面的轨迹打分。
要求：
1. 每个维度给 1 到 scale 的整数分，并给出简短中文理由；
2. issues 只记录确有依据的问题，step_idx 必须对应轨迹中的步骤序号，无对应步骤填 null；
3. 只返回一个 JSON 对象，不要输出 Markdown 或额外文字。
返回格式：
{"scores":[{"dimension_key":"...","score":0,"rationale":"..."}],"overall_score":0,"passed":false,"summary":"...","issues":[{"step_idx":0,"severity":"high","dimension_key":"...","message":"..."}]}

评分维度：
{{RUBRIC}}

待评轨迹（Markdown 时间线）：
{{TRACE}}`;
```

`src/lib/scoring/weight.ts`：
```ts
import type { RubricDimension } from "@/lib/types";

export function validateWeights(dimensions: RubricDimension[]): boolean {
  if (dimensions.length === 0) return false;
  const sum = dimensions.reduce((acc, d) => acc + d.weight, 0);
  return Math.abs(sum - 1) <= 0.01;
}

export function weightedScore(
  dimensions: RubricDimension[],
  scores: Record<string, number>,
): number {
  const total = dimensions.reduce((acc, d) => acc + d.weight * (scores[d.key] ?? 0), 0);
  return Math.round(total * 100) / 100;
}
```

- [ ] **Step 4: 权重测试通过**（4 个 PASS）。

- [ ] **Step 5: rubric/evaluation 仓储测试（先失败）**

`src/lib/__tests__/repo-rubric.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.TRACEEVAL_DB_PATH = join(tmpdir(), `trace-eval-rub-${process.pid}-${Date.now()}.db`);

import {
  getDefaultRubric, listRubrics, createRubric, setDefaultRubric,
  createEvaluationBatch, getBatchStatus, markEvaluationRunning,
  saveEvaluationSuccess, saveEvaluationError, resetRunningEvaluations, getEvaluation,
} from "@/lib/repo-rubric";
import { insertImportAndTraces } from "@/lib/repo";
import { normalizeTrace } from "@/lib/normalize";
import { DEFAULT_RUBRIC_DRAFT, DEFAULT_PROMPT_TEMPLATE } from "@/lib/rubric-defaults";

const seedTrace = () => {
  const r = normalizeTrace({ input: "仓储测试任务" });
  if (!r.ok) throw new Error(r.error);
  const rep = insertImportAndTraces("z.json", "json", [{ raw: {}, normalized: r.value }], []);
  return rep.succeeded === 1;
};

describe("rubric repository", () => {
  it("seeds default rubric once and creates new versions", () => {
    const d = getDefaultRubric();
    expect(d.dimensions).toHaveLength(5);
    expect(getDefaultRubric().id).toBe(d.id);
    const d2 = createRubric({
      name: DEFAULT_RUBRIC_DRAFT.name,
      dimensions: DEFAULT_RUBRIC_DRAFT.dimensions,
      passThreshold: 3.5,
      promptTemplate: DEFAULT_PROMPT_TEMPLATE,
      makeDefault: false,
    });
    expect(d2.version).toBe(2);
    expect(listRubrics().filter((r) => r.name === DEFAULT_RUBRIC_DRAFT.name)).toHaveLength(2);
    setDefaultRubric(d2.id);
    expect(getDefaultRubric().id).toBe(d2.id);
  });
});

describe("evaluation repository", () => {
  it("creates batch, transitions status and aggregates", () => {
    seedTrace();
    const rubric = getDefaultRubric();
    const traceId = require("@/lib/repo").listTraces({ page: 1, pageSize: 1 }).items[0].id;
    const ids = createEvaluationBatch("batch-1", [traceId], rubric.id, "judge-model");
    expect(ids).toHaveLength(1);
    expect(getBatchStatus("batch-1")).toEqual({ total: 1, pending: 1, running: 0, success: 0, error: 0 });

    markEvaluationRunning(ids[0]);
    expect(getBatchStatus("batch-1").running).toBe(1);
    saveEvaluationSuccess(ids[0], {
      output: {
        scores: rubric.dimensions.map((d) => ({ dimension_key: d.key, score: 5, rationale: "ok" })),
        overall_score: 5, passed: true, summary: "好",
        issues: [{ step_idx: null, severity: "low", dimension_key: "safety", message: "x" }],
      },
      raw: "{}", latencyMs: 120, tokenInput: 10, tokenOutput: 5,
      passThreshold: rubric.passThreshold,
    });
    expect(getEvaluation(ids[0])?.passed).toBe(true);

    const ids2 = createEvaluationBatch("batch-2", [traceId], rubric.id, "judge-model");
    markEvaluationRunning(ids2[0]);
    expect(resetRunningEvaluations()).toBe(1);
    expect(getEvaluation(ids2[0])?.status).toBe("error");
    saveEvaluationError(ids2[0], "再次失败");
    expect(getEvaluation(ids2[0])?.error).toContain("再次失败");
  });
});
```
注意：`require("@/lib/repo")` 在 ESM 下不可用——顶部改为 `import { listTraces } from "@/lib/repo";` 并直接调用。

- [ ] **Step 6: 运行确认失败**。

- [ ] **Step 7: 实现仓储**

`src/lib/repo-rubric.ts`：
```ts
import { db, newId } from "./db";
import {
  DEFAULT_PROMPT_TEMPLATE, DEFAULT_RUBRIC_DRAFT,
} from "./rubric-defaults";
import type { JudgeOutput, Rubric, RubricDimension } from "./types";

export interface EvaluationRow {
  id: string; batchId: string; traceId: string; rubricId: string;
  model: string; status: string; overallScore?: number; passed?: boolean;
  summary?: string; issues: unknown[]; error?: string;
  tokenInput?: number; tokenOutput?: number; latencyMs?: number; createdAt: string;
}

function mapRubric(r: Record<string, unknown>): Rubric {
  return {
    id: r.id as string, name: r.name as string, version: Number(r.version),
    dimensions: JSON.parse(r.dimensions_json as string),
    passThreshold: Number(r.pass_threshold), promptTemplate: r.prompt_template as string,
    isDefault: !!r.is_default, createdAt: r.created_at as string,
  };
}

export function listRubrics(): Rubric[] {
  return (db.prepare("SELECT * FROM rubrics ORDER BY created_at DESC, rowid DESC").all() as Record<string, unknown>[]).map(mapRubric);
}

export function getRubric(id: string): Rubric | null {
  const r = db.prepare("SELECT * FROM rubrics WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? mapRubric(r) : null;
}

export function createRubric(input: {
  name: string; dimensions: RubricDimension[]; passThreshold: number;
  promptTemplate: string; makeDefault: boolean;
}): Rubric {
  const versionRow = db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM rubrics WHERE name = ?").get(input.name) as { v: number };
  const id = newId();
  const createdAt = new Date().toISOString();
  const tx = db.transaction(() => {
    if (input.makeDefault) db.prepare("UPDATE rubrics SET is_default = 0 WHERE is_default = 1").run();
    db.prepare(
      `INSERT INTO rubrics (id, name, version, dimensions_json, pass_threshold, prompt_template, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.name, versionRow.v + 1, JSON.stringify(input.dimensions),
      input.passThreshold, input.promptTemplate, input.makeDefault ? 1 : 0, createdAt);
  });
  tx();
  return getRubric(id)!;
}

export function setDefaultRubric(id: string): void {
  const tx = db.transaction(() => {
    db.prepare("UPDATE rubrics SET is_default = 0 WHERE is_default = 1").run();
    db.prepare("UPDATE rubrics SET is_default = 1 WHERE id = ?").run(id);
  });
  tx();
}

let seeded = false;
export function getDefaultRubric(): Rubric {
  if (!seeded) {
    const existing = db.prepare("SELECT id FROM rubrics WHERE is_default = 1 LIMIT 1").get() as { id: string } | undefined;
    if (!existing) {
      const anyRow = db.prepare("SELECT id FROM rubrics LIMIT 1").get() as { id: string } | undefined;
      if (!anyRow) {
        createRubric({
          name: DEFAULT_RUBRIC_DRAFT.name, dimensions: [...DEFAULT_RUBRIC_DRAFT.dimensions],
          passThreshold: DEFAULT_RUBRIC_DRAFT.passThreshold,
          promptTemplate: DEFAULT_PROMPT_TEMPLATE, makeDefault: true,
        });
      }
    }
    seeded = true;
  }
  const r = db.prepare("SELECT * FROM rubrics WHERE is_default = 1 ORDER BY version DESC LIMIT 1").get() as Record<string, unknown>;
  return mapRubric(r);
}

export function createEvaluationBatch(
  batchId: string, traceIds: string[], rubricId: string, model: string,
): string[] {
  const createdAt = new Date().toISOString();
  const ids: string[] = [];
  const ins = db.prepare(
    `INSERT INTO evaluations (id, batch_id, trace_id, rubric_id, model, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
  );
  const tx = db.transaction(() => {
    for (const traceId of traceIds) {
      const id = newId();
      ins.run(id, batchId, traceId, rubricId, model, createdAt);
      ids.push(id);
    }
  });
  tx();
  return ids;
}

export function getBatchStatus(batchId: string) {
  const row = db.prepare(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) AS running,
      SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success,
      SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS error
     FROM evaluations WHERE batch_id = ?`,
  ).get(batchId) as Record<string, number>;
  const items = (db.prepare(
    "SELECT id, trace_id, status, error FROM evaluations WHERE batch_id = ? ORDER BY rowid",
  ).all(batchId) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, traceId: r.trace_id as string, status: r.status as string,
    error: (r.error as string) ?? null,
  }));
  return {
    total: Number(row.total), pending: Number(row.pending), running: Number(row.running),
    success: Number(row.success), error: Number(row.error), items,
  };
}

export function listEvaluationIdsByBatch(batchId: string): string[] {
  return (db.prepare("SELECT id FROM evaluations WHERE batch_id = ? ORDER BY rowid").all(batchId) as { id: string }[]).map((r) => r.id);
}

function mapEval(r: Record<string, unknown>): EvaluationRow {
  return {
    id: r.id as string, batchId: r.batch_id as string, traceId: r.trace_id as string,
    rubricId: r.rubric_id as string, model: r.model as string, status: r.status as string,
    overallScore: r.overall_score === null ? undefined : Number(r.overall_score),
    passed: r.passed === null ? undefined : !!r.passed,
    summary: (r.summary as string) ?? undefined,
    issues: JSON.parse((r.issues_json as string) ?? "[]"),
    error: (r.error as string) ?? undefined,
    tokenInput: r.token_input === null ? undefined : Number(r.token_input),
    tokenOutput: r.token_output === null ? undefined : Number(r.token_output),
    latencyMs: r.latency_ms === null ? undefined : Number(r.latency_ms),
    createdAt: r.created_at as string,
  };
}

export function getEvaluation(id: string): EvaluationRow | null {
  const r = db.prepare("SELECT * FROM evaluations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? mapEval(r) : null;
}

export function listEvaluationsByTrace(traceId: string): EvaluationRow[] {
  return (db.prepare("SELECT * FROM evaluations WHERE trace_id = ? ORDER BY created_at DESC, rowid DESC").all(traceId) as Record<string, unknown>[]).map(mapEval);
}

export function markEvaluationRunning(id: string): void {
  db.prepare("UPDATE evaluations SET status='running' WHERE id=?").run(id);
}

export function saveEvaluationSuccess(
  id: string,
  data: { output: JudgeOutput; raw: string; latencyMs: number; tokenInput?: number; tokenOutput?: number; passThreshold: number },
): void {
  const { output } = data;
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE evaluations SET status='success', overall_score=?, passed=?, summary=?,
         issues_json=?, judge_raw=?, latency_ms=?, token_input=?, token_output=?, error=NULL WHERE id=?`,
    ).run(
      output.overall_score, output.overall_score >= data.passThreshold ? 1 : 0,
      output.summary, JSON.stringify(output.issues), data.raw, data.latencyMs,
      data.tokenInput ?? null, data.tokenOutput ?? null, id,
    );
    db.prepare("DELETE FROM eval_scores WHERE evaluation_id=?").run(id);
    const ins = db.prepare(
      "INSERT INTO eval_scores (id, evaluation_id, dimension_key, score, rationale) VALUES (?, ?, ?, ?, ?)",
    );
    for (const s of output.scores) ins.run(newId(), id, s.dimension_key, s.score, s.rationale);
  });
  tx();
}

export function saveEvaluationError(id: string, error: string, raw?: string): void {
  db.prepare("UPDATE evaluations SET status='error', error=?, judge_raw=COALESCE(?, judge_raw) WHERE id=?")
    .run(error, raw ?? null, id);
}

export function resetRunningEvaluations(): number {
  const info = db.prepare(
    "UPDATE evaluations SET status='error', error='服务重启，任务中断' WHERE status='running'",
  ).run();
  return info.changes;
}
```

- [ ] **Step 8: 全部测试通过**：`npx vitest run`（已有全部用例，全绿）。
- [ ] **Step 9: 提交** `git commit -m "feat: default rubric, weighted scoring and evaluation repositories"`

---

### Task 9: 导入 API 路由（含集成测试）

**Files:**
- Modify: `src/lib/parse-types.ts`、`src/lib/parse.ts`（records 增加行号）
- Create: `src/app/api/import/route.ts`
- Test: `src/app/api/__tests__/import.route.test.ts`

**Interfaces:**
- Produces: `POST /api/import`（multipart 字段名 `files`，可多文件）→ 200 `{ reports: ImportReport[] }`；不支持的扩展名 → 400；无文件 → 400。

- [ ] **Step 1: 给解析结果加行号**

`src/lib/parse-types.ts` 改为：
```ts
export interface LineError { line: number | null; reason: string; }
export interface ParsedRecord { value: unknown; line: number | null; }
export interface ParsedFile { records: ParsedRecord[]; errors: LineError[]; }
```
`src/lib/parse.ts`：JSON 分支返回 `{ value: data, line: null }`（数组用 `data.map((value) => ({ value, line: null }))`）；JSONL 分支 push `{ value: obj, line: i + 1 }`。导出类型同步。Task 4 测试只断言长度与错误，仍通过——运行 `npx vitest run src/lib/__tests__/parse.test.ts` 确认。

- [ ] **Step 2: 先写失败的集成测试**

`src/app/api/__tests__/import.route.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.TRACEEVAL_DB_PATH = join(tmpdir(), `trace-eval-importapi-${process.pid}-${Date.now()}.db`);

import { POST } from "@/app/api/import/route";

const makeForm = (filename: string, content: string) => {
  const fd = new FormData();
  const blob = new Blob([content], { type: "application/json" });
  fd.append("files", new File([blob], filename, { type: "application/json" }));
  return fd;
};

describe("POST /api/import", () => {
  it("imports jsonl: success + duplicate skip + bad line failure", async () => {
    const good = JSON.stringify({ input: "接口测试任务", steps: [{ type: "thought", content: "x" }] });
    const dup = good;
    const body = [good, "坏行", dup].join("\n");
    const res = await POST(new Request("http://local/api/import", { method: "POST", body: makeForm("a.jsonl", body) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const r = json.reports[0];
    expect(r.total).toBe(3);
    expect(r.succeeded).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.errors.find((e: { line: number }) => e.line === 2)).toBeTruthy();
  });

  it("rejects unsupported extensions", async () => {
    const res = await POST(new Request("http://local/api/import", { method: "POST", body: makeForm("a.txt", "{}") }));
    expect(res.status).toBe(400);
  });

  it("rejects empty upload", async () => {
    const res = await POST(new Request("http://local/api/import", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: 运行确认失败**：`npx vitest run src/app/api/__tests__/import.route.test.ts` → FAIL。

- [ ] **Step 4: 实现路由**

`src/app/api/import/route.ts`：
```ts
import { NextResponse } from "next/server";
import { parseTraceFile } from "@/lib/parse";
import { normalizeTrace } from "@/lib/normalize";
import { insertImportAndTraces } from "@/lib/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "未选择文件" }, { status: 400 });
  }

  const reports = [];
  for (const file of files) {
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "json" && ext !== "jsonl") {
      return NextResponse.json(
        { error: `不支持的文件类型: ${file.name}（仅 .json / .jsonl）` },
        { status: 400 },
      );
    }
    const text = await file.text();
    const parsed = parseTraceFile(file.name, text);
    const entries = [];
    const errors = [...parsed.errors];
    for (const rec of parsed.records) {
      const n = normalizeTrace(rec.value);
      if (n.ok) entries.push({ raw: rec.value, normalized: n.value });
      else errors.push({ line: rec.line, reason: n.error });
    }
    reports.push(insertImportAndTraces(file.name, ext, entries, errors.slice(0, 200)));
  }
  return NextResponse.json({ reports });
}
```

- [ ] **Step 5: 测试通过**（3 个 PASS）。
- [ ] **Step 6: 提交** `git commit -m "feat: trace import api with per-record validation report"`

---

### Task 10: 评分 prompt 构建（轨迹序列化 + 截断）

**Files:**
- Create: `src/lib/scoring/prompt.ts`
- Test: `src/lib/__tests__/prompt.test.ts`

**Interfaces:**
- Consumes: `Rubric`（Task 8）、`TraceDetail`（Task 7）。
- Produces:
  ```ts
  export const MAX_STEPS = 200;
  export const MAX_FIELD_CHARS = 8000;
  export function serializeTrace(detail: TraceDetail): string;
  export function buildJudgeMessages(rubric: Rubric, detail: TraceDetail): { role: "system" | "user"; content: string }[];
  ```

- [ ] **Step 1: 先写失败测试**

`src/lib/__tests__/prompt.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { serializeTrace, buildJudgeMessages, MAX_STEPS, MAX_FIELD_CHARS } from "@/lib/scoring/prompt";
import type { TraceDetail } from "@/lib/repo";
import type { Rubric } from "@/lib/types";

const detail = (n: number, big = false): TraceDetail => ({
  trace: { id: "t", input: "任务", status: "success", tags: [], stepCount: n, createdAt: "" },
  steps: Array.from({ length: n }, (_, i) => ({
    idx: i, parentIdx: null, type: i % 2 ? "tool_result" : "tool_call",
    name: "read_file", input: big ? "x".repeat(MAX_FIELD_CHARS + 10) : `{"p":${i}}`,
    output: "ok", status: "success",
  })),
});
const rubric = {
  id: "r", name: "x", version: 1, passThreshold: 4,
  dimensions: [{ key: "task_completion", name: "任务完成度", weight: 1, scale: 5 }],
  promptTemplate: "维度 {{RUBRIC}}\n轨迹 {{TRACE}}", isDefault: true, createdAt: "",
} as Rubric;

describe("serializeTrace", () => {
  it("renders task and every step", () => {
    const md = serializeTrace(detail(3));
    expect(md).toContain("任务");
    expect(md).toContain("[0]");
    expect(md).toContain("[2]");
    expect(md).toContain("read_file");
  });

  it("notes truncation beyond 200 steps", () => {
    const md = serializeTrace(detail(MAX_STEPS + 5));
    expect(md).toContain("5");
    expect(md).toMatch(/截断/);
    expect(md).toContain(`[${MAX_STEPS - 1}]`);
    expect(md).not.toContain(`[${MAX_STEPS}]`);
  });

  it("truncates oversized fields", () => {
    const md = serializeTrace(detail(1, true));
    expect(md).toMatch(/已截断/);
    expect(md).not.toContain("x".repeat(MAX_FIELD_CHARS + 10));
  });
});

describe("buildJudgeMessages", () => {
  it("fills rubric and trace placeholders", () => {
    const msgs = buildJudgeMessages(rubric, detail(1));
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("任务完成度");
    expect(msgs[1].content).toContain("[0]");
    expect(msgs[1].content).not.toContain("{{TRACE}}");
  });
});
```

- [ ] **Step 2: 运行确认失败**。

- [ ] **Step 3: 实现**

`src/lib/scoring/prompt.ts`：
```ts
import type { Rubric } from "@/lib/types";
import type { TraceDetail, StepRow } from "@/lib/repo";

export const MAX_STEPS = 200;
export const MAX_FIELD_CHARS = 8000;

const TYPE_LABEL: Record<string, string> = {
  thought: "思考", text: "文本", tool_call: "调用工具", tool_result: "工具返回",
  error: "错误", system: "系统", custom: "其他",
};

function clip(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  if (text.length <= MAX_FIELD_CHARS) return text;
  return `${text.slice(0, MAX_FIELD_CHARS)}\n…（内容已截断，原长 ${text.length} 字符）`;
}

function renderStep(s: StepRow): string {
  const parts = [`## [${s.idx}] ${TYPE_LABEL[s.type] ?? s.type}${s.name ? ` · ${s.name}` : ""} (${s.status})`];
  if (s.input !== undefined) parts.push("输入：\n" + clip(s.input));
  if (s.output !== undefined) parts.push("输出：\n" + clip(s.output));
  return parts.join("\n");
}

export function serializeTrace(detail: TraceDetail): string {
  const { trace, steps } = detail;
  const head = [
    "# 任务",
    trace.input,
    "",
    `- 状态: ${trace.status}`,
    ...(trace.agent ? [`- Agent: ${trace.agent}`] : []),
    ...(trace.model ? [`- 模型: ${trace.model}`] : []),
    ...(trace.durationMs !== undefined ? [`- 耗时: ${trace.durationMs}ms`] : []),
  ];
  const shown = steps.slice(0, MAX_STEPS);
  const body = shown.map(renderStep).join("\n\n");
  const omitted = steps.length - shown.length;
  const note = omitted > 0
    ? `\n\n> 注：轨迹共 ${steps.length} 步，仅向评审展示前 ${MAX_STEPS} 步，已截断 ${omitted} 步。`
    : "";
  return `${head.join("\n")}\n\n${body}${note}`;
}

export function buildJudgeMessages(
  rubric: Rubric,
  detail: TraceDetail,
): { role: "system" | "user"; content: string }[] {
  const rubricText = [
    `通过线（加权总分）: ${rubric.passThreshold}`,
    ...rubric.dimensions.map(
      (d) => `- ${d.key}（${d.name}）：权重 ${d.weight}，打分范围 1~${d.scale}`,
    ),
  ].join("\n");
  const traceText = serializeTrace(detail);
  const userContent = rubric.promptTemplate
    .replace("{{RUBRIC}}", rubricText)
    .replace("{{TRACE}}", traceText);
  return [
    { role: "system", content: rubricText },
    { role: "user", content: userContent },
  ];
}
```

- [ ] **Step 4: 测试通过**（4 个 PASS）。
- [ ] **Step 5: 提交** `git commit -m "feat: serialize traces into judge prompt with truncation"`

---

### Task 11: LLM 裁判客户端（zod 校验、JSON 提取、重试）

**Files:**
- Create: `src/lib/schema.ts`、`src/lib/scoring/judge.ts`
- Test: `src/lib/__tests__/judge.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const JudgeOutputSchema: z.ZodType<JudgeOutput>;
  export interface JudgeModelClient { model: string; chat(messages: {role;content}[], jsonMode: boolean): Promise<{ content: string; usage?: { input?: number; output?: number } }>; }
  export function createOpenAIClient(cfg: { baseURL: string; apiKey: string; model: string }): JudgeModelClient;
  export class JudgeError extends Error { constructor(public kind: "config" | "parse" | "network", message: string) }
  export function scoreOne(client: JudgeModelClient, rubric: Rubric, detail: TraceDetail): Promise<{ output: JudgeOutput; raw: string; tokenInput?: number; tokenOutput?: number }>;
  ```
  注意：`overall_score` 与 `passed` 不信任模型自报，由 `weightedScore` 与 rubric 阈值重算后覆盖（模型原值保留在 raw）。

- [ ] **Step 1: 先写失败测试**

`src/lib/__tests__/judge.test.ts`：
```ts
import { describe, it, expect, vi } from "vitest";
import { scoreOne, JudgeError } from "@/lib/scoring/judge";
import type { JudgeModelClient } from "@/lib/scoring/judge";
import type { TraceDetail } from "@/lib/repo";
import { DEFAULT_RUBRIC_DRAFT, DEFAULT_PROMPT_TEMPLATE } from "@/lib/rubric-defaults";
import type { Rubric } from "@/lib/types";

const detail: TraceDetail = {
  trace: { id: "t", input: "任务", status: "success", tags: [], stepCount: 1, createdAt: "" },
  steps: [{ idx: 0, parentIdx: null, type: "tool_call", name: "x", input: "{}", output: "", status: "success" }],
};
const rubric: Rubric = {
  id: "r", name: DEFAULT_RUBRIC_DRAFT.name, version: 1,
  dimensions: DEFAULT_RUBRIC_DRAFT.dimensions, passThreshold: 4,
  promptTemplate: DEFAULT_PROMPT_TEMPLATE, isDefault: true, createdAt: "",
};
const valid = (over = {}) =>
  JSON.stringify({
    scores: DEFAULT_RUBRIC_DRAFT.dimensions.map((d, i) => ({
      dimension_key: d.key, score: i === 0 ? 4 : 3, rationale: "r",
    })),
    overall_score: 1, passed: true, summary: "s", issues: [], ...over,
  });

const mockClient = (impl: (...args: any[]) => any): JudgeModelClient =>
  ({ model: "mock", chat: vi.fn(impl) });

describe("scoreOne", () => {
  it("parses json and recomputes weighted score / passed", async () => {
    const client = mockClient(async () => ({ content: valid(), usage: { input: 9, output: 8 } }));
    const r = await scoreOne(client, rubric, detail);
    // 0.3*4 + 0.3*3 + 0.2*3 + 0.1*3 + 0.1*3 = 3.3
    expect(r.output.overall_score).toBe(3.3);
    expect(r.output.passed).toBe(false);
    expect(r.tokenInput).toBe(9);
  });

  it("extracts json from markdown fences", async () => {
    const client = mockClient(async () => ({ content: "```json\n" + valid() + "\n```" }));
    const r = await scoreOne(client, rubric, detail);
    expect(r.output.scores).toHaveLength(5);
  });

  it("retries once with repair message on bad json", async () => {
    let n = 0;
    const client = mockClient(async () => (n++ === 0 ? { content: "not json" } : { content: valid() }));
    const r = await scoreOne(client, rubric, detail);
    expect(r.output.summary).toBe("s");
    expect(client.chat).toHaveBeenCalledTimes(2);
  });

  it("throws parse error after second failure", async () => {
    const client = mockClient(async () => ({ content: "still bad" }));
    await expect(scoreOne(client, rubric, detail)).rejects.toMatchObject({ kind: "parse" });
  });

  it("surfaces 401 as config error", async () => {
    const client = mockClient(async () => { const e: any = new Error("401"); e.status = 401; throw e; });
    await expect(scoreOne(client, rubric, detail)).rejects.toMatchObject({ kind: "config" });
  });

  it("falls back to plain text when endpoint rejects response_format", async () => {
    const client = mockClient(async (_m, jsonMode) => {
      if (jsonMode) {
        const e: any = new Error("400 response_format json_object is not supported");
        e.status = 400;
        throw e;
      }
      return { content: valid() };
    });
    const r = await scoreOne(client, rubric, detail);
    expect(r.output.overall_score).toBe(3.3);
    expect(client.chat).toHaveBeenCalledTimes(2);
  });

  it("retries transient network error then succeeds", async () => {
    let n = 0;
    const client = mockClient(async () => {
      if (n++ === 0) throw new Error("fetch failed");
      return { content: valid() };
    });
    const r = await scoreOne(client, rubric, detail);
    expect(r.output.overall_score).toBe(3.3);
    expect(client.chat).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 运行确认失败**。

- [ ] **Step 3: 实现 zod schema 与裁判**

`src/lib/schema.ts`：
```ts
import { z } from "zod";

export const JudgeScoreSchema = z.object({
  dimension_key: z.string().min(1),
  score: z.coerce.number(),
  rationale: z.string().default(""),
});

export const JudgeIssueSchema = z.object({
  step_idx: z.coerce.number().int().nullable().default(null),
  severity: z.enum(["high", "medium", "low"]).default("low"),
  dimension_key: z.string().default(""),
  message: z.string().default(""),
});

export const JudgeOutputSchema = z.object({
  scores: z.array(JudgeScoreSchema).min(1),
  overall_score: z.coerce.number().default(0),
  passed: z.boolean().default(false),
  summary: z.string().default(""),
  issues: z.array(JudgeIssueSchema).default([]),
});
```

`src/lib/scoring/judge.ts`：
```ts
import OpenAI from "openai";
import { JudgeOutputSchema } from "@/lib/schema";
import { buildJudgeMessages } from "./prompt";
import { weightedScore } from "./weight";
import type { JudgeOutput, Rubric } from "@/lib/types";
import type { TraceDetail } from "@/lib/repo";

export class JudgeError extends Error {
  constructor(public kind: "config" | "parse" | "network", message: string) {
    super(message);
  }
}

export interface ChatMessage { role: "system" | "user"; content: string }
export interface JudgeModelClient {
  model: string;
  chat(messages: ChatMessage[], jsonMode: boolean): Promise<{
    content: string;
    usage?: { input?: number; output?: number };
  }>;
}

export function createOpenAIClient(cfg: {
  baseURL: string; apiKey: string; model: string;
}): JudgeModelClient {
  const client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, timeout: 60_000 });
  return {
    model: cfg.model,
    async chat(messages, jsonMode) {
      const res = await client.chat.completions.create({
        model: cfg.model,
        messages,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      });
      return {
        content: res.choices[0]?.message?.content ?? "",
        usage: { input: res.usage?.prompt_tokens, output: res.usage?.completion_tokens },
      };
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callWithRetry(
  client: JudgeModelClient, messages: ChatMessage[], jsonMode: boolean,
): Promise<{ content: string; usage?: { input?: number; output?: number } }> {
  let useJson = jsonMode;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.chat(messages, useJson);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const msg = (e as Error).message ?? "";
      if (status && status >= 400 && status < 500) {
        if (useJson && /response_format|json/i.test(msg)) {
          useJson = false; // 端点不支持 JSON mode，降级纯文本
          continue;
        }
        throw new JudgeError("config", `裁判接口返回 ${status}: ${msg}`);
      }
      if (attempt === 2) throw new JudgeError("network", `裁判接口调用失败: ${msg}`);
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw new JudgeError("network", "unreachable");
}

export function extractJson(content: string): unknown {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("未找到 JSON 对象");
  return JSON.parse(text.slice(start, end + 1));
}

export async function scoreOne(
  client: JudgeModelClient,
  rubric: Rubric,
  detail: TraceDetail,
): Promise<{ output: JudgeOutput; raw: string; tokenInput?: number; tokenOutput?: number }> {
  const messages = buildJudgeMessages(rubric, detail);

  const first = await callWithRetry(client, messages, true);
  let parsed = JudgeOutputSchema.safeParse(
    (() => { try { return extractJson(first.content); } catch { return undefined; })(),
  );

  if (!parsed.success) {
    const repair: ChatMessage = {
      role: "user",
      content: "你上一次的输出无法被解析为 JSON。请只返回一个合法 JSON 对象，不要 Markdown，不要解释。",
    };
    const second = await callWithRetry(client, [...messages, repair], false);
    parsed = JudgeOutputSchema.safeParse(
      (() => { try { return extractJson(second.content); } catch { return undefined; })(),
    );
    if (!parsed.success) {
      throw new JudgeError("parse", `裁判输出无法解析: ${parsed.error.issues[0]?.message ?? "invalid json"}`);
    }
    return finalize(parsed.data, rubric, second.content, second.usage);
  }
  return finalize(parsed.data, rubric, first.content, first.usage);
}

function finalize(
  data: JudgeOutput, rubric: Rubric, raw: string,
  usage?: { input?: number; output?: number },
) {
  const scoreMap: Record<string, number> = {};
  for (const s of data.scores) scoreMap[s.dimension_key] = s.score;
  const overall = weightedScore(rubric.dimensions, scoreMap);
  const output: JudgeOutput = {
    ...data,
    overall_score: overall,
    passed: overall >= rubric.passThreshold,
  };
  return { output, raw, tokenInput: usage?.input, tokenOutput: usage?.output };
}
```

- [ ] **Step 4: 测试通过**（7 个 PASS；网络重试用例中 1s 退避会让套件稍慢，可接受；如需要可在 mock 场景通过 vi.useFakeTimers 优化，MVP 保留真实等待）。
- [ ] **Step 5: 提交** `git commit -m "feat: openai-compatible judge client with zod and retries"`

---

### Task 12: 配置、并发队列、评分/标准/设置 API、启动恢复

**Files:**
- Create: `src/lib/config.ts`、`src/lib/queue.ts`、`src/instrumentation.ts`
- Create: `src/app/api/traces/route.ts`、`src/app/api/traces/[id]/route.ts`
- Create: `src/app/api/evaluations/route.ts`、`src/app/api/evaluations/[id]/route.ts`
- Create: `src/app/api/rubrics/route.ts`、`src/app/api/rubrics/[id]/route.ts`
- Create: `src/app/api/settings/route.ts`、`src/app/api/imports/route.ts`
- Test: `src/lib/__tests__/queue.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/traces?q&status&agent&tag&passed&page`、`GET /api/traces/[id]`
  - `POST /api/evaluations {traceIds, rubricId}` → `{ batchId }`；`GET /api/evaluations?batchId=` → 状态计数
  - `POST /api/evaluations/[id]`（重试单条）→ `{ batchId }`
  - `GET/POST /api/rubrics`；`PATCH /api/rubrics/[id] { makeDefault: true }`
  - `GET/PUT /api/settings`（GET 时 apiKey 掩码）；`GET /api/imports`
  - 启动时 `running` → `error` 复位。

- [ ] **Step 1: 先写队列/执行器测试（先失败）**

`src/lib/__tests__/queue.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.TRACEEVAL_DB_PATH = join(tmpdir(), `trace-eval-queue-${process.pid}-${Date.now()}.db`);
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_BASE_URL = "http://local";
process.env.OPENAI_MODEL = "mock-model";

import { AsyncQueue, runEvaluation } from "@/lib/queue";
import { insertImportAndTraces } from "@/lib/repo";
import { normalizeTrace } from "@/lib/normalize";
import {
  createEvaluationBatch, getEvaluation,
} from "@/lib/repo-rubric";
import { getDefaultRubric } from "@/lib/repo-rubric";
import { DEFAULT_RUBRIC_DRAFT } from "@/lib/rubric-defaults";
import type { JudgeModelClient } from "@/lib/scoring/judge";

const seed = () => {
  const r = normalizeTrace({ input: "队列任务", steps: [{ type: "thought", content: "嗯" }] });
  if (!r.ok) throw new Error(r.error);
  const rep = insertImportAndTraces("q.json", "json", [{ raw: {}, normalized: r.value }], []);
  return rep;
};

const fakeClient = (fail = false): JudgeModelClient => ({
  model: "mock-model",
  async chat() {
    if (fail) throw Object.assign(new Error("boom"), { status: 500 });
    return {
      content: JSON.stringify({
        scores: DEFAULT_RUBRIC_DRAFT.dimensions.map((d) => ({ dimension_key: d.key, score: 5, rationale: "好" })),
        overall_score: 1, passed: false, summary: "不错", issues: [],
      }),
    };
  },
});

describe("AsyncQueue", () => {
  it("runs tasks with bounded concurrency", async () => {
    let active = 0; let max = 0;
    const q = new AsyncQueue(2);
    const mk = () => new Promise<void>((resolve) => {
      q.enqueue(async () => {
        active++; max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 20));
        active--; resolve();
      });
    });
    await Promise.all([mk(), mk(), mk(), mk()]);
    expect(max).toBeLessThanOrEqual(2);
  });
});

describe("runEvaluation", () => {
  it("saves success with scores via injected client", async () => {
    seed();
    const rubric = getDefaultRubric();
    const { listTraces } = await import("@/lib/repo");
    const traceId = listTraces({ page: 1, pageSize: 1 }).items[0].id;
    const [id] = createEvaluationBatch("b-q-1", [traceId], rubric.id, "mock-model");
    await runEvaluation(id, fakeClient());
    const row = getEvaluation(id)!;
    expect(row.status).toBe("success");
    expect(row.overallScore).toBe(5);
    expect(row.passed).toBe(true);
  });

  it("marks error when judge fails", async () => {
    const { listTraces } = await import("@/lib/repo");
    const traceId = listTraces({ page: 1, pageSize: 10 }).items[0].id;
    const [id] = createEvaluationBatch("b-q-2", [traceId], getDefaultRubric().id, "mock-model");
    await runEvaluation(id, fakeClient(true));
    expect(getEvaluation(id)?.status).toBe("error");
  });
});
```

- [ ] **Step 2: 运行确认失败**。

- [ ] **Step 3: 实现配置与队列**

`src/lib/config.ts`：
```ts
import { getSetting, setSetting } from "./db";
import type { JudgeConfig } from "./types";

const KEY = "judge";

export function getJudgeConfig(): JudgeConfig {
  let stored: Partial<JudgeConfig> = {};
  const raw = getSetting(KEY);
  if (raw) {
    try { stored = JSON.parse(raw); } catch { stored = {}; }
  }
  return {
    baseURL: (stored.baseURL || process.env.OPENAI_BASE_URL || "").trim(),
    apiKey: (stored.apiKey || process.env.OPENAI_API_KEY || "").trim(),
    model: (stored.model || process.env.OPENAI_MODEL || "").trim(),
    concurrency: Number.isFinite(stored.concurrency) && (stored.concurrency as number) >= 1
      ? (stored.concurrency as number)
      : Number(process.env.JUDGE_CONCURRENCY ?? 2),
  };
}

export function saveJudgeConfig(cfg: JudgeConfig): void {
  setSetting(KEY, JSON.stringify(cfg));
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 7) return "****";
  return `${key.slice(0, 6)}****${key.slice(-2)}`;
}
```

`src/lib/queue.ts`：
```ts
import { getJudgeConfig } from "./config";
import {
  getEvaluation, getRubric, markEvaluationRunning,
  saveEvaluationError, saveEvaluationSuccess,
} from "./repo-rubric";
import { getTraceDetail } from "./repo";
import { createOpenAIClient, scoreOne, type JudgeModelClient } from "./scoring/judge";

export class AsyncQueue {
  private active = 0;
  private pending: Array<() => Promise<void>> = [];
  constructor(private concurrency = 2) {}

  setConcurrency(n: number) {
    this.concurrency = Math.max(1, n);
    this.pump();
  }

  enqueue(task: () => Promise<void>) {
    this.pending.push(task);
    this.pump();
  }

  private pump() {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift()!;
      this.active++;
      void task().finally(() => {
        this.active--;
        this.pump();
      });
    }
  }
}

export const judgeQueue = new AsyncQueue(getJudgeConfig().concurrency);

export async function runEvaluation(
  evaluationId: string,
  client?: JudgeModelClient,
): Promise<void> {
  const evalRow = getEvaluation(evaluationId);
  if (!evalRow) return;
  const rubric = getRubric(evalRow.rubricId);
  const detail = getTraceDetail(evalRow.traceId);
  if (!rubric || !detail) {
    saveEvaluationError(evaluationId, "评分标准或轨迹缺失");
    return;
  }
  markEvaluationRunning(evaluationId);
  const started = Date.now();
  try {
    const judge = client ?? createOpenAIClient({
      baseURL: getJudgeConfig().baseURL,
      apiKey: getJudgeConfig().apiKey,
      model: evalRow.model,
    });
    const result = await scoreOne(judge, rubric, detail);
    saveEvaluationSuccess(evaluationId, {
      output: result.output,
      raw: result.raw,
      latencyMs: Date.now() - started,
      tokenInput: result.tokenInput,
      tokenOutput: result.tokenOutput,
      passThreshold: rubric.passThreshold,
    });
  } catch (e) {
    saveEvaluationError(evaluationId, (e as Error).message);
  }
}

export function enqueueBatch(evaluationIds: string[]) {
  for (const id of evaluationIds) judgeQueue.enqueue(() => runEvaluation(id));
}
```

`src/instrumentation.ts`：
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resetRunningEvaluations } = await import("@/lib/repo-rubric");
    resetRunningEvaluations();
  }
}
```

- [ ] **Step 4: 队列测试通过**（2 个 PASS）。

- [ ] **Step 5: 实现 API 路由**

`src/app/api/traces/route.ts`：
```ts
import { NextResponse } from "next/server";
import { listTraces, listAgents } from "@/lib/repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const page = Math.max(1, Number(u.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(u.searchParams.get("pageSize") ?? 20)));
  const passed = u.searchParams.get("passed");
  const { items, total } = listTraces({
    q: u.searchParams.get("q")?.trim() || undefined,
    status: u.searchParams.get("status") || undefined,
    agent: u.searchParams.get("agent") || undefined,
    tag: u.searchParams.get("tag") || undefined,
    passed: passed === "pass" || passed === "fail" ? passed : undefined,
    page, pageSize,
  });
  return NextResponse.json({ items, total, page, pageSize, agents: listAgents() });
}
```

`src/app/api/traces/[id]/route.ts`：
```ts
import { NextResponse } from "next/server";
import { getTraceDetail } from "@/lib/repo";
import { listEvaluationsByTrace } from "@/lib/repo-rubric";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = getTraceDetail(id);
  if (!detail) return NextResponse.json({ error: "轨迹不存在" }, { status: 404 });
  return NextResponse.json({ ...detail, evaluations: listEvaluationsByTrace(id) });
}
```

`src/app/api/evaluations/route.ts`：
```ts
import { NextResponse } from "next/server";
import { newId } from "@/lib/db";
import { getJudgeConfig } from "@/lib/config";
import { createEvaluationBatch, getBatchStatus, getRubric } from "@/lib/repo-rubric";
import { enqueueBatch } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const batchId = new URL(req.url).searchParams.get("batchId");
  if (!batchId) return NextResponse.json({ error: "缺少 batchId" }, { status: 400 });
  return NextResponse.json(getBatchStatus(batchId));
}

export async function POST(req: Request) {
  const body = (await req.json()) as { traceIds?: string[]; rubricId?: string };
  const traceIds = Array.isArray(body.traceIds) ? body.traceIds.filter((x) => typeof x === "string") : [];
  if (traceIds.length === 0) return NextResponse.json({ error: "未选择轨迹" }, { status: 400 });
  if (!body.rubricId || !getRubric(body.rubricId)) {
    return NextResponse.json({ error: "评分标准不存在" }, { status: 400 });
  }
  const cfg = getJudgeConfig();
  if (!cfg.baseURL || !cfg.apiKey || !cfg.model) {
    return NextResponse.json({ error: "尚未配置裁判模型，请先到设置页填写", code: "NO_CONFIG" }, { status: 400 });
  }
  const batchId = newId();
  const ids = createEvaluationBatch(batchId, traceIds, body.rubricId, cfg.model);
  enqueueBatch(ids);
  return NextResponse.json({ batchId });
}
```

`src/app/api/evaluations/[id]/route.ts`：
```ts
import { NextResponse } from "next/server";
import { newId } from "@/lib/db";
import { createEvaluationBatch } from "@/lib/repo-rubric";
import { enqueueBatch } from "@/lib/queue";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { getEvaluation } = await import("@/lib/repo-rubric");
  const prev = getEvaluation(id);
  if (!prev) return NextResponse.json({ error: "评分记录不存在" }, { status: 404 });
  const batchId = newId();
  const [newId2] = createEvaluationBatch(batchId, [prev.traceId], prev.rubricId, prev.model);
  enqueueBatch([newId2]);
  return NextResponse.json({ batchId, evaluationId: newId2 });
}
```

`src/app/api/rubrics/route.ts`：
```ts
import { NextResponse } from "next/server";
import { createRubric, listRubrics } from "@/lib/repo-rubric";
import { validateWeights } from "@/lib/scoring/weight";
import type { RubricDimension } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ items: listRubrics() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string; dimensions?: RubricDimension[];
    passThreshold?: number; promptTemplate?: string; makeDefault?: boolean;
  };
  if (!body.name?.trim()) return NextResponse.json({ error: "名称必填" }, { status: 400 });
  if (!Array.isArray(body.dimensions) || body.dimensions.length === 0) {
    return NextResponse.json({ error: "至少一个维度" }, { status: 400 });
  }
  if (!validateWeights(body.dimensions)) {
    return NextResponse.json({ error: "维度权重之和必须为 1（误差 ±0.01）" }, { status: 400 });
  }
  const rubric = createRubric({
    name: body.name.trim(),
    dimensions: body.dimensions,
    passThreshold: Number(body.passThreshold ?? 4),
    promptTemplate: body.promptTemplate ?? "",
    makeDefault: !!body.makeDefault,
  });
  return NextResponse.json({ item: rubric });
}
```

`src/app/api/rubrics/[id]/route.ts`：
```ts
import { NextResponse } from "next/server";
import { getRubric, setDefaultRubric } from "@/lib/repo-rubric";

export const runtime = "nodejs";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getRubric(id)) return NextResponse.json({ error: "评分标准不存在" }, { status: 404 });
  setDefaultRubric(id);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/settings/route.ts`：
```ts
import { NextResponse } from "next/server";
import { getJudgeConfig, maskKey, saveJudgeConfig } from "@/lib/config";
import type { JudgeConfig } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const cfg = getJudgeConfig();
  return NextResponse.json({
    baseURL: cfg.baseURL, model: cfg.model, concurrency: cfg.concurrency,
    apiKey: cfg.apiKey ? maskKey(cfg.apiKey) : "", hasApiKey: !!cfg.apiKey,
  });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<JudgeConfig>;
  const current = getJudgeConfig();
  const next: JudgeConfig = {
    baseURL: (body.baseURL ?? current.baseURL).trim(),
    apiKey: body.apiKey && !body.apiKey.includes("****") ? body.apiKey.trim() : current.apiKey,
    model: (body.model ?? current.model).trim(),
    concurrency: Number(body.concurrency ?? current.concurrency) || 2,
  };
  saveJudgeConfig(next);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/imports/route.ts`：
```ts
import { NextResponse } from "next/server";
import { listImports } from "@/lib/repo";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ items: listImports() });
}
```

- [ ] **Step 6: 全量测试 + 类型检查**

Run:
```powershell
$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path; cd D:\trace-eval; npx vitest run; npx tsc --noEmit
```
Expected: 全部 PASS，无类型错误。

- [ ] **Step 7: 提交** `git commit -m "feat: scoring queue, trace/rubric/evaluation/settings apis and startup recovery"`

---

### Task 13: 轨迹列表页（导入、筛选、勾选、批量评分）

**Files:**
- Create: `src/lib/http.ts`、`src/lib/format.ts`
- Create: `src/components/badges.tsx`、`src/components/ImportZone.tsx`、`src/components/EvalBatchDialog.tsx`
- Modify: `src/app/page.tsx`（替换 Task 1 占位）

**Interfaces:**
- Consumes: `GET /api/traces`、`POST /api/import`、`GET /api/rubrics`、`POST /api/evaluations`、`GET /api/evaluations?batchId=`。
- UI 契约：
  ```ts
  // http.ts
  export async function apiJson<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  // format.ts
  export function fmtDateTime(iso?: string): string;
  export function fmtDuration(ms?: number): string;
  ```

- [ ] **Step 1: 工具函数**

`src/lib/http.ts`：
```ts
export async function apiJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data as { error?: string }).error || `请求失败 (${res.status})`);
    (e as Error & { code?: string }).code = (data as { code?: string }).code;
    throw e;
  }
  return data as T;
}
```

`src/lib/format.ts`：
```ts
export function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function fmtDuration(ms?: number): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  return `${m}m${Math.round((ms % 60_000) / 1000)}s`;
}
```

- [ ] **Step 2: 语义徽章组件**

`src/components/badges.tsx`：
```tsx
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
```

- [ ] **Step 3: 导入区组件**

`src/components/ImportZone.tsx`：
```tsx
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
```

- [ ] **Step 4: 批量评分弹窗**

`src/components/EvalBatchDialog.tsx`：
```tsx
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
      const s = await apiJson<BatchStatus>(`/api/evaluations?batchId=${encodeURIComponent(id)}`);
      setStatus(s);
      if (s.pending + s.running === 0) {
        if (timer.current) clearInterval(timer.current);
        onDone();
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
```

- [ ] **Step 5: 替换首页**

`src/app/page.tsx`：
```tsx
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
```

客户端共享行类型放在 `src/lib/types-private.ts`（仅重新导出服务端接口形状，避免 client bundle 拉入 better-sqlite3）：
```ts
export type { Rubric } from "./types";

export interface TraceListItem {
  id: string; externalId?: string; agent?: string; model?: string;
  input: string; output?: string; status: string;
  startedAt?: string; endedAt?: string; durationMs?: number;
  tags: string[]; tokenInput?: number; tokenOutput?: number;
  stepCount: number; createdAt: string;
  overallScore?: number; passed?: boolean;
}
```

- [ ] **Step 6: 类型检查**：`npx tsc --noEmit` 无错误。
- [ ] **Step 7: 提交** `git commit -m "feat: trace list page with import zone, filters and batch scoring"`

---

### Task 14: 轨迹详情页（时间线 + 评分面板 + issue 锚点）

**Files:**
- Modify: `src/lib/repo-rubric.ts`（新增带维度分的评分详情查询）、`src/app/api/traces/[id]/route.ts`
- Create: `src/components/JsonBlock.tsx`、`src/components/TraceTimeline.tsx`、`src/components/EvalPanel.tsx`
- Create: `src/app/traces/[id]/page.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface EvalScoreRow { dimensionKey: string; score: number; rationale: string; }
  export interface EvaluationDetail extends EvaluationRow { scores: EvalScoreRow[] }
  export function getEvaluationDetail(id: string): EvaluationDetail | null;       // repo-rubric
  export function listEvaluationDetailsByTrace(traceId: string): EvaluationDetail[];
  ```

- [ ] **Step 1: 服务端补维度分查询**

在 `src/lib/repo-rubric.ts` 末尾追加：
```ts
export interface EvalScoreRow { dimensionKey: string; score: number; rationale: string; }
export interface EvaluationDetail extends EvaluationRow { scores: EvalScoreRow[] }

function attachScores(row: Record<string, unknown>): EvaluationDetail {
  const base = mapEval(row);
  const scores = (db.prepare(
    "SELECT dimension_key, score, rationale FROM eval_scores WHERE evaluation_id = ? ORDER BY rowid",
  ).all(row.id) as Record<string, unknown>[]).map((s) => ({
    dimensionKey: s.dimension_key as string,
    score: Number(s.score),
    rationale: s.rationale as string,
  }));
  return { ...base, scores };
}

export function getEvaluationDetail(id: string): EvaluationDetail | null {
  const r = db.prepare("SELECT * FROM evaluations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? attachScores(r) : null;
}

export function listEvaluationDetailsByTrace(traceId: string): EvaluationDetail[] {
  const rows = db.prepare(
    "SELECT * FROM evaluations WHERE trace_id = ? ORDER BY created_at DESC, rowid DESC",
  ).all(traceId) as Record<string, unknown>[];
  return rows.map(attachScores);
}
```
`src/app/api/traces/[id]/route.ts` 把 `listEvaluationsByTrace` 换成 `listEvaluationDetailsByTrace`。

- [ ] **Step 2: JSON 折叠块**

`src/components/JsonBlock.tsx`：
```tsx
export function JsonBlock({ label, text }: { label: string; text: string }) {
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* 原样展示 */ }
  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-[12px] text-accent">
        {label}（{text.length} 字符，点击展开）
      </summary>
      <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted-bg p-3 text-[12px] leading-relaxed">
        {pretty}
      </pre>
    </details>
  );
}
```

- [ ] **Step 3: 时间线组件**

`src/components/TraceTimeline.tsx`：
```tsx
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
```
在 `src/lib/types-private.ts` 追加：
```ts
export interface StepRow {
  idx: number; parentIdx: number | null; type: string;
  name?: string; input?: string; output?: string; status: string;
  startedAt?: string; endedAt?: string; durationMs?: number;
  tokenInput?: number; tokenOutput?: number;
}
```

- [ ] **Step 4: 评分面板组件**

`src/components/EvalPanel.tsx`：
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { apiJson } from "@/lib/http";
import type { Rubric } from "@/lib/types";
import { StatusBadge } from "./badges";

interface ScoreRow { dimensionKey: string; score: number; rationale: string }
interface Issue { step_idx: number | null; severity: "high" | "medium" | "low"; dimension_key: string; message: string }
export interface EvaluationDetail {
  id: string; rubricId: string; model: string; status: string;
  overallScore?: number; passed?: boolean; summary?: string;
  error?: string; scores: ScoreRow[]; issues: Issue[]; createdAt: string;
}
interface BatchStatus {
  total: number; pending: number; running: number; success: number; error: number;
  items: { id: string; traceId: string; status: string }[];
}

const SEV_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

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

  async function launch() {
    setBusy(true); setError("");
    try {
      const { batchId } = await apiJson<{ batchId: string }>("/api/evaluations", {
        method: "POST", body: JSON.stringify({ traceIds: [traceId], rubricId }),
      });
      timer.current = setInterval(async () => {
        const s = await apiJson<BatchStatus>(`/api/evaluations?batchId=${encodeURIComponent(batchId)}`);
        setProgress(s);
        if (s.pending + s.running === 0) {
          if (timer.current) clearInterval(timer.current);
          setBusy(false); setProgress(null); onChanged();
        }
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

  return (
    <div className="space-y-4">
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
              <div className="space-y-2">
                {latest.scores.map((s) => (
                  <div key={s.dimensionKey} className="rounded-lg bg-muted-bg p-2.5">
                    <div className="flex justify-between text-[12px]">
                      <span className="font-medium">{s.dimensionKey}</span>
                      <span className="text-accent">{s.score}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">{s.rationale}</div>
                  </div>
                ))}
              </div>
              {latest.issues.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[12px] font-medium text-muted">问题清单</div>
                  {latest.issues.map((iss, i) => (
                    <button
                      key={i}
                      className="block w-full rounded-lg border border-border p-2 text-left text-[12px] hover:bg-muted-bg"
                      onClick={() => {
                        if (iss.step_idx !== null) {
                          document.getElementById(`step-${iss.step_idx}`)
                            ?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                      }}
                    >
                      <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] ${
                        iss.severity === "high" ? "bg-danger-soft text-danger" : "bg-muted-bg text-fg-secondary"
                      }`}>{SEV_LABEL[iss.severity]}</span>
                      <span className="text-fg-tertiary">{iss.dimension_key} · </span>
                      {iss.message}
                      {iss.step_idx !== null && <span className="ml-1 text-accent">→ 步骤 {iss.step_idx}</span>}
                    </button>
                  ))}
                </div>
              )}
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
```

- [ ] **Step 5: 详情页**

`src/app/traces/[id]/page.tsx`：
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { apiJson } from "@/lib/http";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { StatusBadge } from "@/components/badges";
import { TraceTimeline } from "@/components/TraceTimeline";
import { EvalPanel } from "@/components/EvalPanel";
import type { Rubric, StepRow, TraceListItem } from "@/lib/types-private";

interface DetailData {
  trace: TraceListItem;
  steps: StepRow[];
  evaluations: import("@/components/EvalPanel").EvaluationDetail[];
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
```

- [ ] **Step 6: 类型检查**：`npx tsc --noEmit`。
- [ ] **Step 7: 提交** `git commit -m "feat: trace detail timeline and evaluation panel"`

---

### Task 15: 评分标准页（列表 + 维度/prompt 编辑器）

**Files:**
- Create: `src/app/rubrics/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/rubrics`、`PATCH /api/rubrics/[id]`。

- [ ] **Step 1: 实现页面**

`src/app/rubrics/page.tsx`：
```tsx
"use client";

import { useEffect, useState } from "react";
import { Star, Plus, Trash2, Loader2 } from "lucide-react";
import { apiJson } from "@/lib/http";
import type { Rubric, RubricDimension } from "@/lib/types";

interface Draft {
  name: string;
  passThreshold: number;
  promptTemplate: string;
  dimensions: RubricDimension[];
}

const emptyDraft = (base?: Rubric): Draft => ({
  name: base?.name ?? "",
  passThreshold: base?.passThreshold ?? 4,
  promptTemplate: base?.promptTemplate ?? "请依据维度 {{RUBRIC}} 评审以下 Agent 轨迹：\n\n{{TRACE}}",
  dimensions: base
    ? base.dimensions.map((d) => ({ ...d }))
    : [{ key: "task_completion", name: "任务完成度", weight: 0.3, scale: 5 }],
});

export default function RubricsPage() {
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () => apiJson<{ items: Rubric[] }>("/api/rubrics").then((d) => {
    setRubrics(d.items);
    if (!draft.name && d.items[0]) setDraft(emptyDraft(d.items[0]));
  });
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const weightSum = draft.dimensions.reduce((a, d) => a + (Number(d.weight) || 0), 0);
  const weightOk = Math.abs(weightSum - 1) <= 0.01;

  async function setDefault(id: string) {
    await apiJson(`/api/rubrics/${id}`, { method: "PATCH" });
    await load();
  }

  async function save(makeDefault: boolean) {
    setBusy(true); setMsg(""); setErr("");
    try {
      await apiJson("/api/rubrics", {
        method: "POST",
        body: JSON.stringify({
          name: draft.name.trim(),
          dimensions: draft.dimensions.map((d) => ({
            key: d.key.trim(), name: d.name.trim(),
            weight: Number(d.weight), scale: Number(d.scale),
          })),
          passThreshold: Number(draft.passThreshold),
          promptTemplate: draft.promptTemplate,
          makeDefault,
        }),
      });
      setMsg("已保存为新版本");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const updateDim = (i: number, patch: Partial<RubricDimension>) =>
    setDraft((d) => ({ ...d, dimensions: d.dimensions.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-[20px] font-semibold tracking-tight">评分标准</h1>

      <div className="card p-4">
        <div className="mb-3 text-[13px] font-semibold">已有标准（保存按同名升新版本）</div>
        <div className="space-y-2">
          {rubrics.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[13px]">
              <div className="flex items-center gap-2">
                {r.isDefault && <Star size={14} className="fill-accent text-accent" />}
                <span className="font-medium">{r.name}</span>
                <span className="text-[12px] text-fg-tertiary">v{r.version} · {r.dimensions.length} 维 · 通过线 {r.passThreshold}</span>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setDraft(emptyDraft(r))}>以此编辑</button>
                {!r.isDefault && <button className="btn-secondary" onClick={() => void setDefault(r.id)}>设为默认</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <div className="text-[13px] font-semibold">编辑器</div>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1 text-[12px] text-muted">
            名称
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例如：默认 Agent 评审" />
          </label>
          <label className="space-y-1 text-[12px] text-muted">
            通过线（加权总分 ≥）
            <input type="number" step="0.5" className="input" value={draft.passThreshold}
              onChange={(e) => setDraft({ ...draft, passThreshold: Number(e.target.value) })} />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-medium text-muted">维度</div>
            <div className={`text-[12px] ${weightOk ? "text-success" : "text-danger"}`}>
              权重和 {weightSum.toFixed(2)}（须 = 1.00）
            </div>
          </div>
          {draft.dimensions.map((d, i) => (
            <div key={i} className="grid grid-cols-[1.1fr_1.4fr_0.7fr_0.7fr_auto] items-center gap-2">
              <input className="input" placeholder="key" value={d.key} onChange={(e) => updateDim(i, { key: e.target.value })} />
              <input className="input" placeholder="名称" value={d.name} onChange={(e) => updateDim(i, { name: e.target.value })} />
              <input type="number" step="0.05" className="input" placeholder="权重" value={d.weight}
                onChange={(e) => updateDim(i, { weight: Number(e.target.value) })} />
              <input type="number" className="input" placeholder="上限" value={d.scale}
                onChange={(e) => updateDim(i, { scale: Number(e.target.value) })} />
              <button
                className="btn-secondary px-2.5"
                disabled={draft.dimensions.length <= 1}
                onClick={() => setDraft((x) => ({ ...x, dimensions: x.dimensions.filter((_, j) => j !== i) }))}
              ><Trash2 size={14} /></button>
            </div>
          ))}
          <button
            className="btn-secondary"
            onClick={() => setDraft((d) => ({ ...d, dimensions: [...d.dimensions, { key: "", name: "", weight: 0, scale: 5 }] }))}
          ><Plus size={14} /> 添加维度</button>
        </div>

        <label className="block space-y-1 text-[12px] text-muted">
          Prompt 模板（用 {"{{RUBRIC}}"} 插入维度，{"{{TRACE}}"} 插入轨迹）
          <textarea
            className="input min-h-36 font-mono text-[12px] leading-relaxed"
            value={draft.promptTemplate}
            onChange={(e) => setDraft({ ...draft, promptTemplate: e.target.value })}
          />
        </label>

        {err && <div className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{err}</div>}
        {msg && <div className="rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success">{msg}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy || !weightOk} onClick={() => void save(false)}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}保存新版本
          </button>
          <button className="btn-primary" disabled={busy || !weightOk} onClick={() => void save(true)}>保存并设为默认</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**：`npx tsc --noEmit`。
- [ ] **Step 3: 提交** `git commit -m "feat: rubric list and versioned editor"`

---

### Task 16: 设置页（裁判配置 + 导入历史与失败 CSV）

**Files:**
- Create: `src/lib/csv.ts`、`src/app/settings/page.tsx`
- Test: `src/lib/__tests__/csv.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function toCsv(rows: (string | number | null | undefined)[][]): string;
  export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void;
  ```

- [ ] **Step 1: 先写 csv 失败测试**

`src/lib/__tests__/csv.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("joins rows with commas and newlines", () => {
    expect(toCsv([["a", 1], ["b", 2]])).toBe("a,1\nb,2");
  });
  it("escapes quotes, commas and newlines", () => {
    expect(toCsv([['he,llo', 'a"b', 'x\ny']])).toBe('"he,llo","a""b","x\ny"');
  });
  it("renders nullish as empty", () => {
    expect(toCsv([[null, undefined, "z"]])).toBe(",,z");
  });
});
```

- [ ] **Step 2: 运行确认失败，再实现**

`src/lib/csv.ts`：
```ts
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          const s = String(cell);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const blob = new Blob([`﻿${toCsv(rows)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```
（`﻿` 为 UTF-8 BOM，保证 Excel 正确识别中文。）

- [ ] **Step 3: 测试通过**（3 个 PASS）。

- [ ] **Step 4: 实现设置页（含导入历史 Tab）**

`src/app/settings/page.tsx`：
```tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, Download } from "lucide-react";
import { apiJson } from "@/lib/http";
import { fmtDateTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

interface SettingsResp {
  baseURL: string; model: string; concurrency: number;
  apiKey: string; hasApiKey: boolean;
}
interface ImportRow {
  id: string; filename: string; format: string;
  total: number; succeeded: number; skipped: number; failed: number;
  errors: { line: number | null; reason: string }[]; importedAt: string;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"judge" | "imports">("judge");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-[20px] font-semibold tracking-tight">设置</h1>
      <div className="flex gap-1 border-b border-border">
        {([["judge", "裁判模型"], ["imports", "导入历史"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] ${
              tab === k ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-fg"
            }`}
          >{label}</button>
        ))}
      </div>
      {tab === "judge" ? <JudgeForm /> : <ImportsHistory />}
    </div>
  );
}

function JudgeForm() {
  const [cfg, setCfg] = useState<SettingsResp | null>(null);
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [concurrency, setConcurrency] = useState(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    apiJson<SettingsResp>("/api/settings").then((d) => {
      setCfg(d);
      setBaseURL(d.baseURL); setModel(d.model); setConcurrency(d.concurrency);
    }).catch(() => {});
  }, []);

  async function save() {
    setBusy(true); setMsg(""); setErr("");
    try {
      await apiJson("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ baseURL, apiKey, model, concurrency: Number(concurrency) }),
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

  if (!cfg) return <div className="py-10 text-center text-fg-tertiary">加载中…</div>;

  return (
    <div className="card space-y-4 p-5">
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
      <label className="block space-y-1 text-[12px] text-muted">
        评分并发数
        <input type="number" min={1} max={8} className="input w-32" value={concurrency}
          onChange={(e) => setConcurrency(Number(e.target.value))} />
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
  );
}

function ImportsHistory() {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  useEffect(() => {
    apiJson<{ items: ImportRow[] }>("/api/imports").then((d) => setRows(d.items)).catch(() => {});
  }, []);

  const exportErrors = (r: ImportRow) => {
    downloadCsv(`import-errors-${r.id.slice(0, 8)}.csv`, [
      ["文件", "行号", "原因"],
      ...r.errors.map((e) => [r.filename, e.line === null ? "" : e.line, e.reason]),
    ]);
  };

  if (!rows) return <div className="py-10 text-center text-fg-tertiary">加载中…</div>;
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted-bg text-left text-[12px] text-muted">
            <th className="px-4 py-2.5">文件</th>
            <th className="px-4 py-2.5">结果</th>
            <th className="px-4 py-2.5">时间</th>
            <th className="px-4 py-2.5">失败明细</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 align-top">
              <td className="px-4 py-3 font-medium">{r.filename}<div className="text-[12px] text-fg-tertiary">{r.format}</div></td>
              <td className="px-4 py-3 text-muted">
                共 {r.total} · <span className="text-success">成功 {r.succeeded}</span> · 跳过 {r.skipped} ·{" "}
                <span className={r.failed ? "text-danger" : ""}>失败 {r.failed}</span>
                {r.errors.length > 0 && (
                  <details className="mt-1 text-[12px]">
                    <summary className="cursor-pointer text-accent">展开原因</summary>
                    <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto">
                      {r.errors.map((e, i) => (
                        <li key={i}>{e.line === null ? "文件" : `第 ${e.line} 行`}：{e.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-[12px] text-fg-tertiary">{fmtDateTime(r.importedAt)}</td>
              <td className="px-4 py-3">
                {r.errors.length > 0 && (
                  <button className="btn-secondary" onClick={() => exportErrors(r)}>
                    <Download size={13} /> CSV
                  </button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-12 text-center text-fg-tertiary">还没有导入记录</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: 全量测试 + 类型检查**：`npx vitest run; npx tsc --noEmit`。
- [ ] **Step 6: 提交** `git commit -m "feat: settings page with judge config and import history"`

---

### Task 17: 看板（统计仓储 + API + 页面 + CSV 导出）

**Files:**
- Create: `src/lib/stats.ts`、`src/app/api/dashboard/route.ts`、`src/app/dashboard/page.tsx`
- Test: `src/lib/__tests__/stats.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DashboardStats {
    total: number; evaluated: number; passed: number; passRate: number;
    dimensionAverages: { key: string; name: string; avg: number | null }[];
    distribution: { score: number; count: number }[];
    topIssues: { dimensionKey: string; severity: string; count: number }[];
  }
  export interface DashboardRow {
    traceId: string; input: string; agent?: string; model?: string;
    score: number; passed: boolean; createdAt: string;
  }
  export function getDashboardStats(from?: string, to?: string): DashboardStats;
  export function listDashboardRows(from?: string, to?: string): DashboardRow[];
  ```
  统计口径：仅取每条轨迹**最新一条 success 评分**；时间范围过滤 `evaluations.created_at`。

- [ ] **Step 1: 先写失败测试**

`src/lib/__tests__/stats.test.ts`：
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.TRACEEVAL_DB_PATH = join(tmpdir(), `trace-eval-stats-${process.pid}-${Date.now()}.db`);

import { insertImportAndTraces } from "@/lib/repo";
import { normalizeTrace } from "@/lib/normalize";
import {
  createEvaluationBatch, getDefaultRubric, markEvaluationRunning, saveEvaluationSuccess,
} from "@/lib/repo-rubric";
import { getDashboardStats, listDashboardRows } from "@/lib/stats";
import type { JudgeOutput } from "@/lib/types";

const seedTrace = (input: string) => {
  const r = normalizeTrace({ input, steps: [{ type: "thought", content: "x" }] });
  if (!r.ok) throw new Error(r.error);
  const rep = insertImportAndTraces(`${input}.json`, "json", [{ raw: {}, normalized: r.value }], []);
  return rep.succeededIds[0];
};

const evalOne = (traceId: string, score: number, issues: JudgeOutput["issues"] = []) => {
  const rubric = getDefaultRubric();
  const [id] = createEvaluationBatch(`b-${traceId}-${score}-${Math.random()}`, [traceId], rubric.id, "mock");
  markEvaluationRunning(id);
  const output: JudgeOutput = {
    scores: rubric.dimensions.map((d) => ({ dimension_key: d.key, score, rationale: "" })),
    overall_score: score, passed: false, summary: "", issues,
  };
  saveEvaluationSuccess(id, { output, raw: "{}", latencyMs: 10, passThreshold: rubric.passThreshold });
};

beforeAll(() => {
  // 3 条已评 + 1 条未评
  const t1 = seedTrace("统计任务1");
  const t2 = seedTrace("统计任务2");
  const t3 = seedTrace("统计任务3");
  seedTrace("未评任务");
  evalOne(t1, 5, [{ step_idx: 0, severity: "high", dimension_key: "tool_use", message: "m1" }]);
  evalOne(t2, 2, [
    { step_idx: 0, severity: "high", dimension_key: "tool_use", message: "m2" },
    { step_idx: null, severity: "low", dimension_key: "task_completion", message: "m3" },
  ]);
  evalOne(t3, 4, []);
});

describe("dashboard stats", () => {
  it("counts totals and pass rate", () => {
    const s = getDashboardStats();
    expect(s.total).toBe(4);
    expect(s.evaluated).toBe(3);
    expect(s.passed).toBe(2); // 5、4 通过（阈值 4），2 不通过
    expect(s.passRate).toBeCloseTo(2 / 3, 5);
  });

  it("averages dimensions by key", () => {
    const s = getDashboardStats();
    const tc = s.dimensionAverages.find((d) => d.key === "task_completion");
    expect(tc?.avg).toBeCloseTo((5 + 2 + 4) / 3, 5);
    expect(tc?.name).toBeTruthy();
  });

  it("builds integer-score distribution", () => {
    const s = getDashboardStats();
    const byScore = Object.fromEntries(s.distribution.map((d) => [d.score, d.count]));
    expect(byScore[2]).toBe(1);
    expect(byScore[4]).toBe(1);
    expect(byScore[5]).toBe(1);
  });

  it("aggregates issues by dimension and severity", () => {
    const s = getDashboardStats();
    const top = s.topIssues[0];
    expect(top).toMatchObject({ dimensionKey: "tool_use", severity: "high", count: 2 });
  });

  it("lists export rows", () => {
    const rows = listDashboardRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveProperty("input");
  });
});
```
**注意**：Task 7 的 `insertImportAndTraces` 返回体目前不含 `succeededIds`，Step 2 需同步扩展仓储（见下）。

- [ ] **Step 2: 扩展导入仓储返回新建 trace id**

Modify `src/lib/repo.ts` 的 `insertImportAndTraces`：`ImportReport` 接口增加 `succeededIds: string[]`（不入库，仅返回）；函数内新增 `const succeededIds: string[] = []`，插入轨迹后 push `traceId`，返回对象加 `succeededIds`。Task 7 既有测试未断言该字段，保持兼容。

- [ ] **Step 3: 运行确认失败，再实现 stats**

`src/lib/stats.ts`：
```ts
import { db } from "./db";
import { getDefaultRubric } from "./repo-rubric";
import type { JudgeIssue } from "./types";

const LATEST_EVAL = `
  JOIN evaluations e ON e.id = (
    SELECT id FROM evaluations WHERE trace_id = t.id AND status = 'success'
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  )`;

function rangeWhere(from?: string, to?: string): { clause: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (from) { conds.push("e.created_at >= ?"); params.push(from); }
  if (to) { conds.push("e.created_at <= ?"); params.push(to); }
  return { clause: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

export interface DashboardStats {
  total: number; evaluated: number; passed: number; passRate: number;
  dimensionAverages: { key: string; name: string; avg: number | null }[];
  distribution: { score: number; count: number }[];
  topIssues: { dimensionKey: string; severity: string; count: number }[];
}

export function getDashboardStats(from?: string, to?: string): DashboardStats {
  const total = (db.prepare("SELECT COUNT(*) AS c FROM traces").get() as { c: number }).c;
  const { clause, params } = rangeWhere(from, to);
  const rows = db.prepare(
    `SELECT t.id AS traceId, e.overall_score AS score, e.passed AS passed, e.issues_json AS issues
     FROM traces t ${LATEST_EVAL} ${clause}`,
  ).all(...params) as { traceId: string; score: number; passed: number; issues: string }[];

  const evaluated = rows.length;
  const passed = rows.filter((r) => !!r.passed).length;

  const nameOf = new Map(getDefaultRubric().dimensions.map((d) => [d.key, d.name]));
  const sums = new Map<string, { sum: number; n: number }>();
  const dist = new Map<number, number>();
  const issueCount = new Map<string, number>();

  for (const r of rows) {
    const score = Number(r.score);
    dist.set(Math.round(score), (dist.get(Math.round(score)) ?? 0) + 1);
    const scoreRows = db.prepare(
      "SELECT dimension_key, score FROM eval_scores WHERE evaluation_id = (SELECT id FROM evaluations WHERE trace_id = ? AND status='success' ORDER BY created_at DESC, rowid DESC LIMIT 1)",
    ).all(r.traceId) as { dimension_key: string; score: number }[];
    for (const s of scoreRows) {
      const cur = sums.get(s.dimension_key) ?? { sum: 0, n: 0 };
      cur.sum += Number(s.score); cur.n += 1;
      sums.set(s.dimension_key, cur);
    }
    for (const iss of JSON.parse(r.issues ?? "[]") as JudgeIssue[]) {
      const k = `${iss.dimension_key}||${iss.severity}`;
      issueCount.set(k, (issueCount.get(k) ?? 0) + 1);
    }
  }

  return {
    total, evaluated, passed,
    passRate: evaluated ? passed / evaluated : 0,
    dimensionAverages: getDefaultRubric().dimensions.map((d) => {
      const cur = sums.get(d.key);
      return { key: d.key, name: nameOf.get(d.key) ?? d.key, avg: cur ? cur.sum / cur.n : null };
    }),
    distribution: [1, 2, 3, 4, 5].map((score) => ({ score, count: dist.get(score) ?? 0 })),
    topIssues: Array.from(issueCount.entries())
      .map(([k, count]) => {
        const [dimensionKey, severity] = k.split("||");
        return { dimensionKey, severity, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

export interface DashboardRow {
  traceId: string; input: string; agent?: string; model?: string;
  score: number; passed: boolean; createdAt: string;
}

export function listDashboardRows(from?: string, to?: string): DashboardRow[] {
  const { clause, params } = rangeWhere(from, to);
  const rows = db.prepare(
    `SELECT t.id AS traceId, t.input AS input, t.agent AS agent, t.model AS model,
            e.overall_score AS score, e.passed AS passed, e.created_at AS createdAt
     FROM traces t ${LATEST_EVAL} ${clause}
     ORDER BY e.created_at DESC, t.rowid DESC`,
  ).all(...params) as {
    traceId: string; input: string; agent: string | null; model: string | null;
    score: number; passed: number; createdAt: string;
  }[];
  return rows.map((r) => ({
    traceId: r.traceId, input: r.input,
    agent: r.agent ?? undefined, model: r.model ?? undefined,
    score: Number(r.score), passed: !!r.passed, createdAt: r.createdAt,
  }));
}
```

- [ ] **Step 4: 测试通过**（5 个 PASS）。

- [ ] **Step 5: API 与看板页**

`src/app/api/dashboard/route.ts`：
```ts
import { NextResponse } from "next/server";
import { getDashboardStats, listDashboardRows } from "@/lib/stats";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const from = u.searchParams.get("from") ?? undefined;
  const to = u.searchParams.get("to") ?? undefined;
  return NextResponse.json({ stats: getDashboardStats(from, to), rows: listDashboardRows(from, to) });
}
```

`src/app/dashboard/page.tsx`：
```tsx
"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiJson } from "@/lib/http";
import { fmtDateTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import type { DashboardStats, DashboardRow } from "@/lib/stats-types";

type RangeKey = "7d" | "30d" | "all";

const SEV_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

export default function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("all");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [rows, setRows] = useState<DashboardRow[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (range !== "all") {
      const days = range === "7d" ? 7 : 30;
      params.set("from", new Date(Date.now() - days * 86_400_000).toISOString());
    }
    apiJson<{ stats: DashboardStats; rows: DashboardRow[] }>(`/api/dashboard?${params}`)
      .then((d) => { setStats(d.stats); setRows(d.rows); }).catch(() => {});
  }, [range]);

  const exportCsv = () => {
    downloadCsv(`trace-eval-${range}.csv`, [
      ["轨迹ID", "任务", "Agent", "模型", "总分", "是否通过", "评分时间"],
      ...rows.map((r) => [r.traceId, r.input, r.agent, r.model, r.score, r.passed ? "通过" : "未通过", fmtDateTime(r.createdAt)]),
    ]);
  };

  if (!stats) return <div className="py-20 text-center text-fg-tertiary">加载中…</div>;
  const maxCount = Math.max(1, ...stats.distribution.map((d) => d.count));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold tracking-tight">看板</h1>
        <div className="flex items-center gap-2">
          <select className="input w-32" value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
            <option value="all">全部</option>
          </select>
          <button className="btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={14} /> 导出 CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "轨迹总数", value: String(stats.total) },
          { label: "已评率", value: stats.total ? `${Math.round((stats.evaluated / stats.total) * 100)}%` : "—" },
          { label: "通过率", value: stats.evaluated ? `${Math.round(stats.passRate * 100)}%` : "—" },
          { label: "已评 / 通过", value: `${stats.evaluated} / ${stats.passed}` },
        ].map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-[12px] text-muted">{c.label}</div>
            <div className="mt-1 text-[24px] font-semibold tracking-tight">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card space-y-3 p-5">
          <div className="text-[13px] font-semibold">各维度均分</div>
          {stats.dimensionAverages.map((d) => (
            <div key={d.key}>
              <div className="flex justify-between text-[12px] text-muted">
                <span>{d.name}</span>
                <span className="text-accent">{d.avg === null ? "—" : d.avg.toFixed(2)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted-bg">
                <div className="h-full rounded-full bg-accent"
                  style={{ width: `${d.avg === null ? 0 : (d.avg / 5) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card space-y-3 p-5">
          <div className="text-[13px] font-semibold">总分分布（1–5）</div>
          <div className="flex h-40 items-end gap-3">
            {stats.distribution.map((d) => (
              <div key={d.score} className="flex flex-1 flex-col items-center gap-1">
                <div className="text-[11px] text-fg-tertiary">{d.count}</div>
                <div className="w-full rounded-t bg-accent/80" style={{ height: `${(d.count / maxCount) * 120}px` }} />
                <div className="text-[11px] text-muted">{d.score}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 text-[13px] font-semibold">高频问题 Top（维度 / 严重度）</div>
        {stats.topIssues.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-fg-tertiary">暂无问题记录</div>
        ) : (
          <table className="w-full text-[13px]">
            <tbody>
              {stats.topIssues.map((iss, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium">{iss.dimensionKey}</td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${
                      iss.severity === "high" ? "bg-danger-soft text-danger" : "bg-muted-bg text-fg-secondary"
                    }`}>{SEV_LABEL[iss.severity] ?? iss.severity}</span>
                  </td>
                  <td className="py-2 text-right text-muted">{iss.count} 次</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```
客户端类型文件 `src/lib/stats-types.ts`：
```ts
export interface DashboardStats {
  total: number; evaluated: number; passed: number; passRate: number;
  dimensionAverages: { key: string; name: string; avg: number | null }[];
  distribution: { score: number; count: number }[];
  topIssues: { dimensionKey: string; severity: string; count: number }[];
}
export interface DashboardRow {
  traceId: string; input: string; agent?: string; model?: string;
  score: number; passed: boolean; createdAt: string;
}
```

- [ ] **Step 6: 全量测试 + 类型检查 + 提交**

Run:
```powershell
$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path; cd D:\trace-eval; npx vitest run; npx tsc --noEmit
```
Expected: 全绿（共约 40 个测试）。提交：
`git commit -m "feat: dashboard stats api, page and csv export"`

---

### Task 18: 样例数据、端到端验收与最终构建

**Files:**
- Create: `examples/sample-traces.json`

- [ ] **Step 1: 准备样例文件**

`examples/sample-traces.json`（canonical schema v1，2 条轨迹；第二条故意带一个失败步骤，便于观察 error 语义色）：
```json
[
  {
    "id": "sample-trace-1",
    "agent": "demo-agent",
    "model": "demo-model",
    "input": "读取 README 并总结项目用途",
    "status": "success",
    "tags": ["demo", "read"],
    "steps": [
      { "id": "s1", "type": "thought", "content": "先找到 README 文件再读取", "status": "success" },
      { "id": "s2", "type": "tool_call", "name": "glob", "input": "{\"pattern\":\"README*\"}", "status": "success" },
      { "id": "s3", "type": "tool_result", "parent_id": "s2", "output": "README.md", "status": "success" },
      { "id": "s4", "type": "tool_call", "name": "read_file", "input": "{\"path\":\"README.md\"}", "status": "success" },
      { "id": "s5", "type": "tool_result", "parent_id": "s4", "output": "# demo\n用于演示的项目。", "status": "success" }
    ]
  },
  {
    "id": "sample-trace-2",
    "agent": "demo-agent",
    "input": "删除不存在的临时文件",
    "status": "error",
    "tags": ["demo", "write"],
    "steps": [
      { "id": "t1", "type": "tool_call", "name": "shell", "input": "{\"command\":\"rm tmp/missing.tmp\"}", "status": "error" },
      { "id": "t2", "type": "error", "parent_id": "t1", "content": "rm: tmp/missing.tmp: No such file or directory", "status": "error" }
    ]
  }
]
```

- [ ] **Step 2: 全量自动化校验**

Run:
```powershell
$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path; cd D:\trace-eval; npx vitest run; npx tsc --noEmit; npm run build
```
Expected: 所有测试 PASS；类型检查无错误；`next build` 成功。

- [ ] **Step 3: 启动并人工走查**

先确认端口占用（若 3000 被占用则换 3010）：
```powershell
$env:Path = "C:\Users\21132\.coze\runtimes\desktop-runtime\current\bin;" + $env:Path; cd D:\trace-eval
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
npm run dev
```
按验收基线逐项操作（可用浏览器自动化或人工）：
1. `/`：导入 `examples/sample-traces.json`，报告显示成功 2、失败 0；重复导入同一文件，显示跳过 2。
2. 列表出现 2 行，筛选 status=失败 → 仅剩 1 行；全文搜索 `README` → 1 行；勾选与分页控件正常。
3. 未配置模型时点「批量评分」：弹窗出现「尚未配置裁判模型」错误。
4. `/settings`：保存一组 baseURL/model/apiKey（或在 `.env.local` 配 `OPENAI_*`）；页面 apiKey 掩码显示；切到「导入历史」看到 2 条批次，失败为 0。
5. `/rubrics`：默认 5 维标准存在；把某维度权重改坏（和 ≠ 1）时保存按钮禁用/报错；另存一个新版本并可设默认。
6. 回到列表勾选 2 条发起评分：进度条 2s 轮询更新，终态后停止；真实接口不可用时失败项可「重试失败项」；可用真实 OpenAI 兼容 key 验证一次完整打分。
7. `/traces/sample-trace-1`：时间线 5 步、parent 缩进、JSON 折叠展开正常；右侧面板显示总分、维度分、summary；issue 可点击锚定到步骤；error 轨迹步骤显示红色语义。
8. 重启 dev server，running 记录变为 error（「服务重启，任务中断」）。
9. `/dashboard`：卡片数字（总数 2、已评率、通过率）、维度均分、1–5 分布柱、问题聚合正确；时间范围切换正常；导出 CSV 用 Excel/编辑器打开中文无乱码、逗号转义正确。
10. 全站浅色：背景 `#fbfbfd`、紫色仅用于强调，无黄橙红装饰；导航 4 项均可跳转。

- [ ] **Step 4: 提交** `git add -A; git commit -m "chore: sample traces and end-to-end acceptance"`

---

## 自检记录

计划编写完成后逐项核对（2026-09-12）：

**Spec 覆盖**
- [x] canonical schema + 归一化别名（messages/spans/events、字段别名、秒/毫秒时间戳、custom 兜底、parent）→ Task 5
- [x] JSON/JSONL 解析、坏行隔离、行号 → Task 4（Task 9 扩 `ParsedRecord.line`）
- [x] external_id 优先 + sha1 内容哈希去重 → Task 6/7
- [x] 8 个 SQLite 对象（imports/traces/steps/rubrics/evaluations/eval_scores/app_settings/_migrations + traces_fts5）→ Task 3
- [x] 评分流水线：Markdown 序列化（200 步 / 8000 字符截断）→ Task 10；json_object 优先+纯文本回退、fence 提取、坏 JSON 修复重试 1 次、5xx 指数退避 2 次、4xx 不重试、60s 超时、overall/passed 服务端重算 → Task 11
- [x] 并发队列（默认 2）、pending 落库、running 启动复位、单条重试、整批失败重试（batch status 含 items）→ Task 12/13
- [x] 模型配置 app_settings + 环境变量回退 + key 掩码 → Task 12/16
- [x] 9 个 spec API 全覆盖（另加 dashboard 统计 API）→ Task 9/12/17
- [x] 5 个页面：列表/详情/rubrics/dashboard/settings（含导入历史 Tab）→ Task 13–17
- [x] CSV：失败明细下载 + 看板筛选结果导出（BOM、转义）→ Task 16/17
- [x] spec §9 测试项：normalize/parse/dedupe/weight/prompt/judge（含 JSON mode 回退共 7 路径）/import 集成；另加 queue、csv、stats 测试 → Task 4–17
- [x] 视觉约束：全站仅 globals.css 令牌与语义类，组件无硬编码色值；danger/success 仅语义 → Task 1/13–17
- [x] 每个 Task 均有 TDD 步骤（UI 任务按 spec §9.8 豁免自动化测试，改为 tsc + Task 18 人工走查）与 conventional commit

**占位符扫描**：`PLAN-CONTINUES / TODO / TBD / FIXME` 均为 0 命中；Task 1 的占位 `page.tsx` 在 Task 13 显式替换。

**跨 Task 一致性（已核对修正）**
- [x] 函数名/签名跨任务一致：`insertImportAndTraces / listTraces(ListParams) / getTraceDetail / listAgents / listImports`（Task 7 ↔ 9/12/13）；`createEvaluationBatch / getBatchStatus(含 items) / getEvaluation / saveEvaluationSuccess / resetRunningEvaluations / listEvaluationDetailsByTrace`（Task 8 ↔ 11/12/14/17）；`weightedScore / validateWeights / DEFAULT_RUBRIC_DRAFT / DEFAULT_PROMPT_TEMPLATE`（Task 8 ↔ 11/12）
- [x] 队列测试注入 `JudgeModelClient`，`overall_score/passed` 以 saveEvaluationSuccess 阈值落库为准
- [x] stats 子查询绑定 `traceId`（自检发现漏参，已修）；`passed` 0/1 显式转 boolean
- [x] 详情页维度分：Task 14 扩 `EvaluationDetail.scores` 并替换 traces/[id] 路由
- [x] Task 17 需要的 `ImportReport.succeededIds` 在同 Task Step 2 显式扩展仓储，旧测试不断言该字段
- [x] 客户端组件只引 `@/lib/types`、`types-private`、`stats-types`、`http/format/csv`，不直接 import 含 better-sqlite3 的服务端模块；`prompt.ts` 对 repo 的引用为 `import type`
- [x] 所有 API 路由均含 `export const runtime = "nodejs"`；better-sqlite3 在 `serverExternalPackages`
- [x] PowerShell 命令均带 Node 运行时 PATH 前缀；测试库一律 `TRACEEVAL_DB_PATH` 指向 tmpdir
- [x] 样例文件 step 使用 canonical 字段（`content` 由 normalize 映射为 input），与 Task 5 别名表一致

**已知取舍（不阻塞）**
- judge 网络重试测试保留真实 1s 退避（套件多约 3s），未用 fake timers。
- 详情页「单条重试」后依赖父组件 reload 展示 pending，不轮询新批次；列表/批量弹窗有完整 2s 轮询。
- `/api/import` 多文件中途遇非法扩展名返回 400 时，此前已处理的文件已落库（逐文件独立事务，可接受）。


