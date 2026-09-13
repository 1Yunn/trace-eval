import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// 迁移 SQL 内联：Vercel serverless 不会打包 src/lib/migrations/*.sql，
// 运行时 scandir 会报 ENOENT。此处直接内嵌，本地与线上行为一致。
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_init.sql",
    sql: `
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY, filename TEXT NOT NULL, format TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0, succeeded INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]', imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES imports(id),
  external_id TEXT, content_hash TEXT NOT NULL UNIQUE, agent TEXT, model TEXT,
  input TEXT NOT NULL, output TEXT, status TEXT NOT NULL,
  started_at TEXT, ended_at TEXT, duration_ms INTEGER,
  tags_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}',
  token_input INTEGER, token_output INTEGER, raw TEXT NOT NULL,
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
  id TEXT PRIMARY KEY, trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, parent_idx INTEGER, type TEXT NOT NULL, name TEXT,
  input TEXT, output TEXT, status TEXT NOT NULL,
  started_at TEXT, ended_at TEXT, duration_ms INTEGER,
  token_input INTEGER, token_output INTEGER, raw TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_steps_trace ON steps(trace_id, idx);
CREATE TABLE IF NOT EXISTS rubrics (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, version INTEGER NOT NULL,
  dimensions_json TEXT NOT NULL, pass_threshold REAL NOT NULL,
  prompt_template TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY, batch_id TEXT NOT NULL,
  trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
  rubric_id TEXT NOT NULL REFERENCES rubrics(id), model TEXT NOT NULL,
  status TEXT NOT NULL, overall_score REAL, passed INTEGER, summary TEXT,
  issues_json TEXT, judge_raw TEXT, error TEXT,
  token_input INTEGER, token_output INTEGER, latency_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eval_batch ON evaluations(batch_id);
CREATE INDEX IF NOT EXISTS idx_eval_trace ON evaluations(trace_id);
CREATE INDEX IF NOT EXISTS idx_eval_status ON evaluations(status);
CREATE TABLE IF NOT EXISTS eval_scores (
  id TEXT PRIMARY KEY, evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  dimension_key TEXT NOT NULL, score REAL NOT NULL, rationale TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_eval ON eval_scores(evaluation_id);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);
`,
  },
];

const dbPath =
  process.env.TRACEEVAL_DB_PATH ??
  (process.env.VERCEL ? "/tmp/trace-eval.db" : join(process.cwd(), "data", "app.db"));
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY, applied_at TEXT NOT NULL
)`);

function runMigrations() {
  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  for (const { name, sql } of MIGRATIONS) {
    if (applied.has(name)) continue;
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations(name, applied_at) VALUES (?, ?)").run(
        name,
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
