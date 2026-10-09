import type { CommandContext } from "./types.js";
export function build(context: CommandContext) {
  return context.engine.build(
    {
      operation: "build",
      source: context.source,
      settings: {
        ...context.settings,
        outputDirectory: context.output ?? "dist",
      },
    },
    context.control,
  );
}
