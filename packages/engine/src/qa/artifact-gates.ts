import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { RichTextBlock, RichTextInline } from "@omega/contracts";
import { sha256 } from "@omega/spec-frontend";
import { chromium } from "@playwright/test";
import type { CandidateInput } from "../api/types.js";
import { throwIfCancellationRequested } from "../lifecycle/cancellation.js";
import type { StageContext } from "../lifecycle/stages.js";
import type { GateEvidence, QaCheck } from "./types.js";
export function evidence(
  stage: GateEvidence["stage"],
  artifactHash: string,
  checks: readonly QaCheck[],
  acceptance?: GateEvidence["acceptance"],
): GateEvidence {
  return Object.freeze({
    stage,
    artifactHash,
    policy: "qa.phase.p02.walking-skeleton.v1",
    checks: Object.freeze(checks.map((check) => Object.freeze({ ...check }))),
    ...(acceptance ? { acceptance } : {}),
  });
}
/** Real, per-candidate browser verification; infrastructure errors throw internally. */
export async function verifyArtifact(
  input: CandidateInput,
  context: StageContext,
): Promise<GateEvidence> {
  const before = await readFile(input.candidate.workspacePath);
  const signal = context.cancellationToken;
  throwIfCancellationRequested(signal);
  const browser = await chromium.launch({ headless: true });
  const requests: string[] = [];
  const errors: string[] = [];
  try {
    const isolated = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 320, height: 900 },
    });
    const url = pathToFileURL(input.candidate.workspacePath).href;
    isolated.on("request", (request) => {
      if (request.url() !== url) requests.push(request.url());
    });
    await isolated.route("**/*", (route) =>
      route.request().url() === url
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    const page = await isolated.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    throwIfCancellationRequested(signal);
    const title = page.getByRole("heading", { level: 1 });
    const staticCount = await page
      .locator("script,link[rel=stylesheet],astro-island")
      .count();
    const noJs =
      (await title.isVisible()) &&
      (await title.textContent()) === input.plan.document.title;
    const sections = await page.locator("section[data-canonical-id]").count();
    const expected = canonicalVisibleText(input.plan.sections);
    const essential = async () => {
      const body = collapseProseWhitespace(
        await page.locator("body").innerText(),
      );
      const code = await page.locator("code").allTextContents();
      return (
        expected.prose.every((text) =>
          body.includes(collapseProseWhitespace(text)),
        ) &&
        code.length === expected.code.length &&
        code.every((text, index) => text === expected.code[index])
      );
    };
    const content = await essential();
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    await page.emulateMedia({ media: "print" });
    const print = (await title.isVisible()) && (await essential());
    await page.emulateMedia({
      media: "screen",
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    const fallback = (await title.isVisible()) && (await essential());
    const after = await readFile(input.candidate.workspacePath);
    const rules: readonly [string, boolean][] = [
      [
        "exact-artifact-bytes",
        sha256(before) === input.candidate.artifactHash &&
          sha256(after) === input.candidate.artifactHash,
      ],
      ["offline-zero-attempted-requests", requests.length === 0],
      ["no-client-js", staticCount === 0],
      [
        "essential-no-js-content",
        noJs && content && sections === countSections(input.plan.sections),
      ],
      ["320px-reflow", dimensions.width === 320 && dimensions.scroll <= 320],
      ["print-title", print],
      ["forced-colors-reduced-motion-title", fallback],
      ["browser-errors", errors.length === 0],
      [
        "no-runtime-dependencies",
        input.candidate.runtimeDependencies.length === 0 &&
          input.candidate.resourceDependencies.length === 0,
      ],
      [
        "no-workspace-path-leak",
        !before.toString("utf8").includes(input.candidate.workspaceDirectory),
      ],
    ];
    return evidence(
      "verify",
      input.candidate.artifactHash,
      rules.map(([rule, pass]) => ({ rule, outcome: pass ? "PASS" : "FAIL" })),
    );
  } finally {
    await browser.close();
  }
}
function countSections(sections: CandidateInput["plan"]["sections"]): number {
  return sections.reduce(
    (sum, section) => sum + 1 + countSections(section.sections),
    0,
  );
}

/** Browser collapses ordinary prose whitespace; protected code is compared byte-for-byte as textContent. */
function collapseProseWhitespace(value: string): string {
  return value.replace(/[ \t\n\r\f]+/g, " ").replace(/^ +| +$/g, "");
}
function canonicalVisibleText(sections: CandidateInput["plan"]["sections"]): {
  prose: string[];
  code: string[];
} {
  const prose: string[] = [];
  const code: string[] = [];
  function inlines(nodes: readonly RichTextInline[]): void {
    for (const node of nodes) {
      if (node.kind === "text") prose.push(node.value);
      else if (node.kind === "inline-code") code.push(node.value);
      else if (
        node.kind === "emphasis" ||
        node.kind === "strong" ||
        node.kind === "link"
      )
        inlines(node.children);
    }
  }
  function blocks(nodes: readonly RichTextBlock[]): void {
    for (const node of nodes) {
      if (node.kind === "paragraph") inlines(node.children);
      else if (node.kind === "code-block") code.push(node.value);
      else if (node.kind === "blockquote") blocks(node.blocks);
      else if (node.kind === "ordered-list" || node.kind === "bullet-list")
        for (const item of node.items) blocks(item.blocks);
    }
  }
  function visit(nodes: CandidateInput["plan"]["sections"]): void {
    for (const section of nodes) {
      if (section.title !== null) prose.push(section.title);
      for (const block of section.content) blocks(block.text.blocks);
      visit(section.sections);
    }
  }
  visit(sections);
  return { prose, code };
}
