import type { CommandContext } from "./types.js";
export function migrate(context: CommandContext) {
  return context.engine.migrate(
    {
      operation: "migrate",
      source: context.source,
      targetVersion: context.targetVersion ?? "3.0",
    },
    context.control,
  );
}
