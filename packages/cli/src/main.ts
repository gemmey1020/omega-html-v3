import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { EngineResult, ExecutionControl } from "@omega/engine";
import { CancellationTokenSource, createProductionEngine } from "@omega/engine";
import { build } from "./commands/build.js";
import { capabilities } from "./commands/capabilities.js";
import { explain } from "./commands/explain.js";
import { inspect } from "./commands/inspect.js";
import { migrate } from "./commands/migrate.js";
import { plan } from "./commands/plan.js";
import { validate } from "./commands/validate.js";

const commands = {
  validate,
  plan,
  build,
  inspect,
  explain,
  migrate,
  capabilities,
};
export function exitCode(result: EngineResult): number {
  return result.status === "succeeded"
    ? 0
    : result.status === "cancelled"
      ? 130
      : result.failureClass === "internal"
        ? 4
        : 3;
}
export async function main(args: readonly string[]): Promise<number> {
  const command = args[0];
  let sourcePath: string | undefined;
  let output: string | undefined;
  let targetVersion: string | undefined;
  let json = false;
  let events = false;
  const usage = () => {
    process.stdout.write(
      `${JSON.stringify({ status: "usage", code: "OMEGA-CLI-USAGE" })}\n`,
    );
    return 2;
  };
  if (!command || !Object.hasOwn(commands, command)) return usage();
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--json") json = true;
    else if (arg === "--events=jsonl" && command === "build") events = true;
    else if (arg === "--output" && command === "build") {
      output = args[++index];
      if (!output || output.startsWith("--")) return usage();
    } else if (arg === "--target" && command === "migrate") {
      targetVersion = args[++index];
      if (!targetVersion || targetVersion.startsWith("--")) return usage();
    } else if (arg && !arg.startsWith("-") && !sourcePath) sourcePath = arg;
    else return usage();
  }
  if (
    (command === "capabilities" && sourcePath) ||
    (command !== "capabilities" && !sourcePath)
  )
    return usage();
  const cancellation = new CancellationTokenSource();
  const onInterrupt = () => cancellation.cancel();
  process.on("SIGINT", onInterrupt);
  const control: ExecutionControl = {
    cancellationToken: cancellation.token,
    ...(events
      ? {
          onEvent: (event) =>
            process.stdout.write(
              `${JSON.stringify({ type: "event", event })}\n`,
            ),
        }
      : {}),
  };
  try {
    let bytes = new Uint8Array();
    if (sourcePath) {
      try {
        bytes = new Uint8Array(await readFile(sourcePath));
      } catch (error) {
        if (
          !["ENOENT", "EACCES", "EISDIR"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
        const result = {
          operation: command,
          status: "failed",
          failureClass: "execution",
          stage: "preflight",
          diagnostics: [
            {
              code: "OMEGA-SOURCE-UNAVAILABLE",
              severity: "ERROR",
              stage: "preflight",
              message: "The requested source cannot be read.",
            },
          ],
          stages: [],
        };
        process.stdout.write(
          events
            ? `${JSON.stringify({ type: "result", result })}\n`
            : `${JSON.stringify(result)}\n`,
        );
        return 3;
      }
    }
    const source = {
      module: sourcePath ? basename(sourcePath) : "cli",
      text: bytes,
    };
    const context = {
      engine: createProductionEngine(),
      control,
      source,
      ...(output ? { output } : {}),
      ...(targetVersion ? { targetVersion } : {}),
    };
    const result = await commands[command as keyof typeof commands](context);
    process.stdout.write(
      events
        ? `${JSON.stringify({ type: "result", result })}\n`
        : json
          ? `${JSON.stringify(result)}\n`
          : `${command}: ${result.status}\n`,
    );
    return exitCode(result);
  } catch {
    const result = {
      operation: command,
      status: cancellation.token.signal.aborted ? "cancelled" : "failed",
      failureClass: "internal",
      code: "OMEGA-CLI-INTERNAL",
    };
    process.stdout.write(
      events
        ? `${JSON.stringify({ type: "result", result })}\n`
        : `${JSON.stringify(result)}\n`,
    );
    return cancellation.token.signal.aborted ? 130 : 4;
  } finally {
    process.off("SIGINT", onInterrupt);
  }
}
