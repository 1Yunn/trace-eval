# trace-eval

Offline evaluation workbench for LLM traces. Import trace JSON, define weighted rubrics, batch-evaluate with an LLM judge, and drill into failure cases with diagnostic insights and repair suggestions.

## ✨ Features

- **Trace Import** — Drag-and-drop JSON trace files (LangSmith / OpenAI / generic format)
- **Rubric Builder** — Define scoring dimensions with custom weights and thresholds
- **LLM-as-Judge** — Batch evaluation powered by configurable model with prompt templating
- **Failure Diagnostics** — Auto-detect error patterns, hallucinations, and low-confidence steps
- **Repair Suggestions** — Actionable fixes for failed traces with before/after comparison
- **Timeline View** — Visual step-by-step trace inspection with per-node scoring

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS 4 |
| Database | better-sqlite3 |
| AI | OpenAI SDK |
| Validation | Zod |
| Testing | Vitest |

## 🚀 Live Demo

[trace-eval.space](https://www.trace-eval.space/)

## 📦 Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000 to view it.

## 📄 License

For demonstration / portfolio purposes.
