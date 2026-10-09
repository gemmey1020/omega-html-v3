import type { CommandContext } from "./types.js";
export function validate(context: CommandContext) {
  return context.engine.validate(
    { operation: "validate", source: context.source },
    context.control,
  );
}
