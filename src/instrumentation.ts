export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resetRunningEvaluations } = await import("@/lib/repo-rubric");
    resetRunningEvaluations();
    const { seedIfEmpty } = await import("@/lib/seed");
    seedIfEmpty();
  }
}
