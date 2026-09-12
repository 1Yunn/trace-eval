import { tmpdir } from "node:os";
import { join } from "node:path";

// 在任何测试模块（及其依赖，如 @/lib/db）被导入前注入临时 DB 路径，
// 保证 better-sqlite3 单例不会落到项目 data/app.db。
process.env.TRACEEVAL_DB_PATH = join(
  tmpdir(),
  `trace-eval-test-${process.pid}.db`,
);
