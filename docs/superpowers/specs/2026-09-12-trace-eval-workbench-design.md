# Agent 轨迹评测工作台 — 设计文档（Spec）

- 日期：2026-09-12
- 状态：待用户审阅
- 项目位置：`D:\trace-eval`（独立新项目，与 FateCipher 隔离）

## 1. 背景与目标

需要一个本地工具，用于评测 **AI Agent 的多步执行轨迹**（思考、文本、工具调用及参数、工具返回、报错）。轨迹来自外部 Agent 运行，以 **JSON / JSONL 文件手动导入**；评测方式为 **LLM 裁判自动打分**，人工只做结果查看与抽检。

### 1.1 目标

1. 手动导入单条或批量轨迹文件，容错解析、去重，原始数据全量保留。
2. 以时间线方式查看一条轨迹的完整执行过程。
3. 配置评分标准（rubric），调用 OpenAI 兼容接口的大模型对轨迹批量自动评分，输出分维度分数、理由、问题清单与 pass/fail。
4. 查看批次进度、单条评分结果、整体统计看板，并可导出 CSV。
5. 单机单人使用，零外部服务依赖（裁判 API 除外），一条命令启动。

### 1.2 非目标（MVP 明确不做）

- Agent SDK 实时埋点/自动上报
- 人工逐步骤标注界面（评分完全由 LLM 完成；人工仅浏览结果）
- 多用户、登录鉴权、权限体系
- 多模型同时打分对比（配置里选一个模型即可）
- 成本/价格报表（仅记录 token 数，不做费用换算）
- 规则引擎式确定性检查（后续版本再议）

## 2. 技术选型

| 项 | 选型 | 理由 |
|---|---|---|
| 框架 | Next.js（App Router）+ TypeScript（全栈单体） | 一个进程跑 UI + API；与现有技术栈一致 |
| 样式 | Tailwind CSS | 快速、轻量 |
| 数据库 | SQLite，驱动 `better-sqlite3`（同步 API） | 本地文件、零运维；批处理简单 |
| 迁移 | 手写 SQL 迁移表 + 启动时顺序执行 | 不引入重型迁移框架 |
| LLM | `openai` SDK，连接可配置的 OpenAI 兼容端点 | 一套适配 OpenAI / DeepSeek / 豆包 / Kimi / vLLM |
| 校验 | `zod` | 导入格式与裁判输出双重校验 |
| 测试 | `vitest` | 纯函数 TDD 为主 |
| 视觉 | **浅色主题**，Apple / Notion / Linear 风格，信息密度优先，不做复杂动效 | 用户确认 |

运行环境：Node 20+；Windows 本地。数据库文件位于项目内 `./data/app.db`（gitignore）。

## 3. 通用 Trace 数据模型（canonical schema v1）

原则：导入时**归一化**为统一内部模型落库；原始 JSON 原样保存在 `raw` 字段，未来归一化规则升级后可基于 raw 重放，不必重新找文件。

### 3.1 标准导入格式

单条轨迹 JSON：

```json
{
  "id": "可选；来源系统唯一 ID",
  "agent": "可选；agent 名称",
  "model": "可选；执行模型",
  "input": "必填；用户的原始任务/提问（字符串）",
  "output": "可选；最终交付结果",
  "status": "success | error | unknown",
  "started_at": "可选；ISO8601",
  "ended_at": "可选；ISO8601",
  "tags": ["可选"],
  "metadata": { "任意键值" },
  "token_usage": { "input": 0, "output": 0 },
  "steps": [
    {
      "id": "可选；步骤自身 ID，供其他步骤的 parent_id 引用",
      "type": "thought | text | tool_call | tool_result | error | system",
      "name": "工具名（仅 tool_call / tool_result）",
      "input": "字符串或对象：思考内容 / 文本 / 工具入参",
      "output": "字符串或对象：工具返回",
      "status": "running | success | error",
      "parent_id": "可选；父步骤引用，支持嵌套（子 agent / 子 span）",
      "started_at": "可选；ISO8601",
      "ended_at": "可选；ISO8601",
      "token_usage": { "input": 0, "output": 0 }
    }
  ]
}
```

- `.json`：整个文件是一条轨迹，或一个轨迹数组。
- `.jsonl`：每行一条轨迹，适合批量。
- `input` 缺失的行记为导入失败（这是唯一必填字段）。

### 3.2 归一化容错映射

| 来源形态 | 归一化结果 |
|---|---|
| `spans` / `events` / `messages` 数组字段 | 映射为 `steps` |
| chat message `role: assistant` 且带 `tool_calls` | 每个 tool_call 生成一个 `tool_call` 步（思考文本若有则单独生成 `thought` 步） |
| chat message `role: tool` | 生成 `tool_result` 步 |
| `role: user` 顶层 | 仅在顶层 input 缺失时用于回填 input，不成为 step |
| 字段别名 `task` / `prompt` / `query` / `question` | → `input`（取第一个存在的） |
| 字段别名 `result` / `final_answer` / `response` | → `output` |
| step 字段别名 `arguments` / `args` / `params` | → step.input |
| step 字段别名 `result` / `observation` / `response` / `content` | → step.output |
| 布尔类失败标记 `error: true` / `is_error` | step.status = error |
| 无法识别的 step | `type: custom`，原始内容保留在 raw |
| 时间为数字 | 自动判断秒/毫秒时间戳 → ISO8601 |
| 缺失 status | 顶层/步骤一律默认 `unknown` / `running`（步骤缺失按 success 处理，除非带错误标记） |

步骤缺失 status 的细化规则：带 error 信息 → `error`；否则 → `success`。

### 3.3 去重

- 优先使用来源 `id`（external_id）判重；
- 缺失时计算内容哈希：`sha1(normalizedInput + stepsCount + started_at)`；
- 同一内容重复导入 → 跳过并计入导入报告 `skipped`，不覆盖已有数据及评分。

## 4. 数据库设计（SQLite，6 张核心表 + 1 张设置表）

### 4.1 imports — 导入批次

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID |
| filename | TEXT | 原始文件名。**每个导入文件对应一行**，多文件上传产生多行 |
| format | TEXT | `json` / `jsonl`（由扩展名决定） |
| total | INTEGER | 解析出的记录总数 |
| succeeded | INTEGER | |
| skipped | INTEGER | 去重跳过数 |
| failed | INTEGER | |
| errors_json | TEXT | 失败明细 `[{line, reason}]`（最多保留 200 条） |
| imported_at | TEXT | ISO8601 |

### 4.2 traces — 轨迹

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID（内部） |
| import_id | TEXT FK → imports.id | |
| external_id | TEXT | 来源 ID，可空 |
| content_hash | TEXT UNIQUE | 去重哈希 |
| agent | TEXT | |
| model | TEXT | |
| input | TEXT NOT NULL | |
| output | TEXT | |
| status | TEXT | success/error/unknown |
| started_at / ended_at | TEXT | ISO8601，可空 |
| duration_ms | INTEGER | 由起止时间推导，可空 |
| tags_json | TEXT | |
| metadata_json | TEXT | |
| token_input / token_output | INTEGER | 可空 |
| raw | TEXT | 原始 JSON 全文 |
| created_at | TEXT | |

索引：`status`、`agent`、`external_id`、`content_hash`；input 用 FTS5 虚拟表 `traces_fts(input)` 支持全文搜索（通过触发器同步）。

### 4.3 steps — 执行步骤

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | |
| trace_id | TEXT FK → traces.id ON DELETE CASCADE | |
| idx | INTEGER | 在轨迹内的顺序（0 起） |
| parent_idx | INTEGER | 父步骤 idx，可空（一层嵌套展示） |
| type | TEXT | thought/text/tool_call/tool_result/error/system/custom |
| name | TEXT | 工具名 |
| input | TEXT | 归一化为字符串（对象则 JSON.stringify） |
| output | TEXT | 同上 |
| status | TEXT | running/success/error |
| started_at / ended_at | TEXT | |
| duration_ms | INTEGER | |
| token_input / token_output | INTEGER | |
| raw | TEXT | 该步骤原始 JSON |

索引：`(trace_id, idx)`。

### 4.4 rubrics — 评分标准

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | |
| name | TEXT | |
| version | INTEGER | 同 name 自增 |
| dimensions_json | TEXT | 维度数组，见 4.7 |
| pass_threshold | REAL | 加权总分通过线（默认 4.0） |
| prompt_template | TEXT | 裁判 prompt 模板（含默认值，可编辑） |
| is_default | INTEGER | 是否默认 rubric（全局仅一个为 1） |
| created_at | TEXT | |

评分引用 rubric 时按 id 快照绑定，rubric 可新建版本但不删除被引用过的版本。

### 4.5 evaluations — 评分记录

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | |
| batch_id | TEXT | 一次「批量评分」操作生成一个 UUID，同批共享；轮询进度的依据，建索引 |
| trace_id | TEXT FK | |
| rubric_id | TEXT FK | |
| model | TEXT | 裁判模型名（创建时快照） |
| status | TEXT | pending/running/success/error |
| overall_score | REAL | 加权总分 |
| passed | INTEGER | overall_score >= pass_threshold |
| summary | TEXT | 裁判总体评语 |
| issues_json | TEXT | `[{step_idx, severity, dimension_key, message}]` |
| judge_raw | TEXT | 裁判模型原始响应 |
| error | TEXT | 失败原因 |
| token_input / token_output | INTEGER | |
| latency_ms | INTEGER | |
| created_at | TEXT | |

一条轨迹可针对多个 rubric、多次评分；列表默认展示每轨迹最新一次 success 评分。

### 4.6 eval_scores — 维度分数

| 列 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | |
| evaluation_id | TEXT FK ON DELETE CASCADE | |
| dimension_key | TEXT | |
| score | REAL | |
| rationale | TEXT | 裁判给该维度的理由 |

### 4.7 rubric 结构与默认模板

```json
{
  "dimensions": [
    { "key": "task_completion", "name": "任务完成度", "weight": 0.30, "scale": 5 },
    { "key": "tool_accuracy",  "name": "工具调用正确性", "weight": 0.30, "scale": 5 },
    { "key": "trajectory",     "name": "路径效率", "weight": 0.20, "scale": 5 },
    { "key": "recovery",       "name": "错误自修复", "weight": 0.10, "scale": 5 },
    { "key": "safety",         "name": "安全与合规", "weight": 0.10, "scale": 5 }
  ],
  "pass_threshold": 4.0
}
```

权重之和必须为 1.0（rubric 保存时校验，误差 ±0.01）。每个维度 1 至 scale 分。

裁判被要求返回严格 JSON：

```json
{
  "scores": [{ "dimension_key": "...", "score": 4, "rationale": "..." }],
  "overall_score": 3.7,
  "passed": false,
  "summary": "总体评语",
  "issues": [{ "step_idx": 3, "severity": "high|medium|low", "dimension_key": "tool_accuracy", "message": "..." }]
}
```

## 5. 导入与评分流水线

### 5.1 导入流程

1. UI 拖拽/选择一个或多个 `.json` / `.jsonl` 文件，调用导入 API（multipart）。
2. 服务端解析：JSON 数组/单对象/JSONL 逐行；记录行号。
3. 每条：zod 校验 → 归一化 → 哈希去重 → 事务内写 traces/steps。
4. 单行失败隔离，不影响整批；返回 `{ total, succeeded, skipped, failed, errors[] }`。
5. 失败明细可在导入历史里下载（CSV：行号 + 原因）。

### 5.2 评分流程

1. 轨迹列表勾选若干条 → 选择 rubric（默认模板预选）→ 创建批次（evaluations 先写 pending）。
2. 服务端队列执行，并发数可配置（默认 2，防止触发 API 限流）。
3. 单条执行：
   - 把轨迹序列化为紧凑 Markdown（任务、元信息、按 idx 的步骤列表，工具参数/返回做截断保护）；
   - 套 rubric 的 prompt_template；
   - 调用 `chat.completions.create`，优先 `response_format: { type: "json_object" }`（端点不支持时回退纯文本提取 JSON）；
   - zod 解析裁判输出；解析失败重试 1 次（在消息中追加「上次输出无法解析，请只返回合法 JSON」）；仍失败 → status=error 并保留 judge_raw；
   - 网络错误/超时 → status=error，可单条重试；
   - 记录 token、latency。
4. 前端按 `batch_id` 轮询 `GET /api/evaluations?batch_id=...`（返回各状态计数，每 2s），全部终态后展示结果。
5. **启动恢复**：队列是进程内的，服务重启后会有悬挂的 `running` 记录；启动时统一把 `running` 置为 `error`（error = "服务重启，任务中断"），用户可整批重试。
6. 超大轨迹保护：steps > 200 时，送裁判的内容截断到前 200 步并在 prompt 中显式注明截断步数；详情页仍展示全量。单条工具输入/输出各自截断到 8000 字符。
7. 评分可对单条/整批重跑；历史评分全部保留。

### 5.3 裁判模型配置

设置页填写 `baseURL`、`apiKey`、`model`，保存在 SQLite 表 `app_settings(key, value)`（第 7 张辅助表；apiKey 在界面遮罩显示）。未配置时回退读环境变量 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`（`.env.local`）。

## 6. 页面设计（浅色）

全局：浅色底（白 / `#fbfbfd` 类近白），灰阶文字，紫色作为唯一强调色；圆角卡片、极弱阴影；不用黄橙红（红色仅保留给错误状态语义色）。内部工具，无复杂入场动效，hover 反馈轻量即可。

| 路由 | 内容 |
|---|---|
| `/` 轨迹列表 | 顶部导入区（拖拽上传）+ 新建评分入口；筛选栏（status / agent / tag / 最新评分 passed）；input 全文搜索框；表格列：任务摘要、agent、模型、状态、步骤数、耗时、最新总分/pass、时间；批量勾选 |
| `/traces/[id]` 详情 | 头部：任务全文、元信息（模型/起止/耗时/token/tags/status）；主体左 2/3 **时间线**：类型图标 + 工具名 + 状态点，参数/返回用代码块（JSON 高亮、超长折叠），error 红标，parent 嵌套缩进；右 1/3 评分面板：rubric 选择、各维度分+理由、加权总分、问题清单（点击锚点滚动定位到 step）、重跑按钮 |
| `/rubrics` | rubric 列表 + 编辑器：维度增删、名称/权重/分值上限、pass 线（权重和实时校验）、prompt_template 编辑、保存为新版本、设默认 |
| `/dashboard` | 卡片：总轨迹数、已评率、通过率、各维度均分；分数分布柱状；issues 的 dimension/severity 聚合 Top；时间范围筛选；导出当前筛选结果 CSV |
| `/settings` | 裁判模型配置（baseURL/apiKey/model）、并发数；Tab 并入「导入历史」（批次列表 + 失败明细下载） |

## 7. 项目结构

```
D:\trace-eval\
├─ data/app.db                  # 运行时生成，gitignore
├─ docs/superpowers/specs/      # 本设计文档
├─ src/
│  ├─ app/
│  │  ├─ page.tsx               # 轨迹列表
│  │  ├─ traces/[id]/page.tsx
│  │  ├─ rubrics/page.tsx
│  │  ├─ dashboard/page.tsx
│  │  ├─ settings/page.tsx
│  │  └─ api/
│  │     ├─ import/route.ts
│  │     ├─ traces/route.ts            # 列表/搜索
│  │     ├─ traces/[id]/route.ts
│  │     ├─ evaluations/route.ts       # 创建批次/查询进度
│  │     ├─ evaluations/[id]/route.ts  # 重试单条
│  │     ├─ rubrics/route.ts
│  │     └─ settings/route.ts
│  ├─ lib/
│  │  ├─ db.ts                   # better-sqlite3 连接、迁移执行
│  │  ├─ migrations/001_init.sql
│  │  ├─ schema.ts               # zod 规范：导入格式 + 裁判输出
│  │  ├─ normalize.ts            # 归一化（纯函数，TDD 核心）
│  │  ├─ dedupe.ts               # 哈希
│  │  ├─ scoring/
│  │  │  ├─ prompt.ts            # 时间线序列化 + prompt 构建
│  │  │  ├─ judge.ts             # 调模型 + 解析 + 重试
│  │  │  └─ weight.ts            # 加权总分
│  │  ├─ queue.ts                # 简单内存并发队列
│  │  └─ csv.ts
│  └─ components/                # 时间线、评分面板、表格、筛选栏等
└─ src/lib/__tests__/            # vitest 测试紧邻或集中
```

## 8. 错误处理边界

- 不支持的文件扩展名 / 空文件：整文件拒绝，明确提示。
- JSON 语法错误（JSONL）：定位到行号，记该行失败，继续其余行。
- 必填缺失（input）：该行失败，原因写明字段名。
- 裁判模型：超时 60s、5xx 可重试错误最多重试 2 次（指数退避）、4xx（鉴权/参数）不重试直接 error 并提示检查设置。
- 裁判输出非合法 JSON：按 5.2 修复重试 1 次。
- 未配置模型且无环境变量：创建批次时前置校验，直接提示去设置页。
- 超大字段：按 5.2 截断，UI 标注。

## 9. 测试策略（TDD）

先写测试再写实现，重点覆盖纯函数：

1. `normalize.test.ts`：标准格式直通；messages（assistant.tool_calls / role:tool）映射；spans/events 别名；字段别名；时间戳秒/毫秒；未知 step → custom；缺 status 推断；parent 关系。
2. JSONL：多记录、坏行隔离、行号上报；JSON 数组形式。
3. `dedupe.test.ts`：external_id 优先；无 id 时同内容哈希一致、异内容不同。
4. `scoring/weight.test.ts`：加权总分、pass 判定、权重和校验。
5. `scoring/prompt.test.ts`：序列化含全部步骤；超 200 步截断标注；8000 字符截断。
6. `scoring/judge.test.ts`：mock openai client —— 正常 JSON、JSON mode 回退、坏 JSON 修复重试一次、4xx 不重试、超时重试。
7. API 路由：`/api/import` 用内存/临时 db 做轻量集成测试（成功/跳过/失败计数）。
8. UI 不强制自动化测试。

验收基线：上述测试全部通过；手动走通「导入样例文件 → 批量评分（mock 或真实 key）→ 详情查看 → 看板统计 → CSV 导出」全链路。

## 10. 开放问题（不阻塞，实施时采用默认决策）

- 无。已确认：浅色主题；独立项目 D:\trace-eval；Next.js + SQLite + OpenAI 兼容接口；LLM 自动打分；手动文件导入；canonical schema v1 如第 3 节。
