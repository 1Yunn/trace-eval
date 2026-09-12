import { afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// 在任何测试模块（及其依赖，如 @/lib/db）被导入前注入临时 DB 路径，
// 保证 better-sqlite3 单例不会落到项目 data/app.db。
// setupFiles 会在每个测试文件中重新执行，但 worker 进程会被多个文件复用，
// 因此仅用 process.pid 会让同一 worker 内的多个文件共享同一个库（残留行污染）。
// 这里用进程级自增序号 + VITEST_POOL_ID，保证每个测试文件拿到独立 DB 文件，
// 并在该文件所有用例结束后删除 DB 及其 WAL/SHM 附属文件。
const g = globalThis as unknown as { __traceEvalDbSeq?: number };
g.__traceEvalDbSeq = (g.__traceEvalDbSeq ?? 0) + 1;
const dbPath = join(
  tmpdir(),
  `trace-eval-test-${process.pid}-${process.env.VITEST_POOL_ID ?? "0"}-${g.__traceEvalDbSeq}.db`,
);
process.env.TRACEEVAL_DB_PATH = dbPath;

afterAll(async () => {
  // Windows 上文件句柄未释放时 unlink 会报 EBUSY，先关闭本文件模块注册表内
  // 的 better-sqlite3 单例连接（若测试引入了 @/lib/db），再删除磁盘文件。
  try {
    const { db } = await import("@/lib/db");
    db.close();
  } catch {
    // 测试未引入 db 或关闭失败时，仍继续尝试删除文件
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(dbPath + suffix, { force: true });
  }
});
