export async function register() {
  // 注意：此处不要 import 任何数据库模块（repo/seed）。
  // Vercel serverless 中 instrumentation 与 API 路由不在同一模块上下文，
  // 在这里碰 DB 会让同一 lambda 进程出现两个 better-sqlite3 连接指向
  // 同一个 /tmp WAL 文件，配合实例冻结/恢复易触发 SQLite 原生断言
  // 崩溃（SIGABRT → 500）。播种由各 API 路由内的 seedIfEmpty 单飞处理。
  void process.env.NEXT_RUNTIME;
}
