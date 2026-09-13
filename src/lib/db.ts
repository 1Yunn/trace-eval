import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const dbPath =
  process.env.TRACEEVAL_DB_PATH ??
  (process.env.VERCEL ? "/tmp/trace-eval.db" : join(process.cwd(), "data", "app.db"));
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
