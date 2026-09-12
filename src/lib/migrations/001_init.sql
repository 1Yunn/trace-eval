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
