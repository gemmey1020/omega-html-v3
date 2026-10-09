import type { CommandContext } from "./types.js";
export function plan(context: CommandContext) {
  return context.engine.plan(
    { operation: "plan", source: context.source },
    context.control,
  );
}
