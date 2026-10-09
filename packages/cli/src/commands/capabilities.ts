import type { CommandContext } from "./types.js";
export function capabilities(context: CommandContext) {
  return context.engine.capabilities(
    { operation: "capabilities" },
    context.control,
  );
}
