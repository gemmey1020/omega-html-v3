import type { CommandContext } from "./types.js";
export function inspect(context: CommandContext) {
  return context.engine.inspect(
    { operation: "inspect", source: context.source },
    context.control,
  );
}
