import type { CommandContext } from "./types.js";
export async function explain(context: CommandContext) {
  const planned = await context.engine.plan(
    { operation: "plan", source: context.source },
    context.control,
  );
  if (planned.status !== "succeeded")
    return { ...planned, operation: "explain" as const };
  return context.engine.explain(
    { operation: "explain", plan: planned.value.plan },
    context.control,
  );
}
