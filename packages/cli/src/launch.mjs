#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "rolldown/utils";

const packageRoot = new URL("../../../packages/", import.meta.url).href;
// Source exports use NodeNext .js specifiers; only task-owned workspace TS is transformed.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.startsWith(packageRoot) &&
      specifier.startsWith(".") &&
      specifier.endsWith(".js")
    ) {
      const candidate = new URL(
        `${specifier.slice(0, -3)}.ts`,
        context.parentURL,
      );
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (
      url.startsWith("file:") &&
      url.endsWith(".ts") &&
      url.startsWith(packageRoot)
    ) {
      const result = transformSync(
        fileURLToPath(url),
        readFileSync(new URL(url), "utf8"),
        { lang: "ts", target: "esnext" },
      );
      if (result.errors.length)
        throw new Error("CLI source transformation failed");
      return { format: "module", source: result.code, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
try {
  const { main } = await import("./main.ts");
  process.exitCode = await main(process.argv.slice(2));
} catch {
  const result = {
    status: "failed",
    failureClass: "internal",
    code: "OMEGA-CLI-STARTUP-INTERNAL",
  };
  process.stdout.write(
    `${JSON.stringify(
      process.argv.includes("--events=jsonl")
        ? { type: "result", result }
        : result,
    )}\n`,
  );
  process.exitCode = 4;
}
