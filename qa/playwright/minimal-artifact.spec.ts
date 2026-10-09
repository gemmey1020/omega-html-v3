import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import {
  buildStandaloneHtml,
  cleanupArtifactCandidate,
} from "../../packages/composer/src/index.js";
import {
  protectedCode,
  standalonePlan,
} from "../../packages/composer/test/standalone-fixture.js";

test.use({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
test("standalone_candidate_is_one_offline_no_js_document", async ({
  page,
  context,
}, testInfo) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "omega-browser-t5-"));
  const requests: string[] = [];
  const errors: string[] = [];
  context.on("request", (request) => {
    if (!/^file:/i.test(request.url())) requests.push(request.url());
  });
  await context.route("**/*", (route) =>
    /^file:/i.test(route.request().url())
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const result = await buildStandaloneHtml({
      plan: standalonePlan(),
      temporaryRoot,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    const { candidate } = result;
    expect(await readdir(candidate.workspaceDirectory)).toEqual([
      "artifact.html",
    ]);
    await page.goto(pathToFileURL(candidate.workspacePath).href);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "تقرير Prime",
    );
    await expect(
      page.getByRole("heading", { name: "المقدمة", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("تفاصيل ثابتة دون اتصال.")).toBeVisible();
    await expect(page.locator("pre code")).toHaveText(protectedCode, {
      useInnerText: false,
    });
    expect(await page.locator("pre code").textContent()).toBe(protectedCode);
    expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
    await expect(
      page.locator('code[dir="ltr"]').filter({ hasText: "BUILD_ID_01" }),
    ).toHaveText("BUILD_ID_01");
    expect(
      await page
        .locator('code[dir="ltr"]')
        .filter({ hasText: "BUILD_ID_01" })
        .evaluate((element) => getComputedStyle(element).unicodeBidi),
    ).toBe("isolate");
    await expect(
      page.locator('section[data-canonical-id="intro"]'),
    ).toHaveCount(1);
    expect(await page.locator("html").getAttribute("lang")).toBe("ar");
    expect(
      await page.locator("script, link[rel=stylesheet], astro-island").count(),
    ).toBe(0);
    expect(
      await page.locator("pre").evaluate((element) => ({
        dir: getComputedStyle(element).direction,
        bidi: getComputedStyle(element).unicodeBidi,
      })),
    ).toEqual({ dir: "ltr", bidi: "isolate" });
    await page.screenshot({
      path: testInfo.outputPath("desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      })),
    ).toEqual({ width: 320, scroll: 320 });
    await expect(page.locator("pre")).toBeVisible();
    await expect(page.getByText("تفاصيل ثابتة دون اتصال.")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("mobile-320.png"),
      fullPage: true,
    });
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.locator("body").evaluate((element) => ({
        color: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
      })),
    ).toEqual({ color: "rgb(0, 0, 0)", background: "rgb(255, 255, 255)" });
    expect(await page.locator("pre code").textContent()).toBe(protectedCode);
    await page.screenshot({
      path: testInfo.outputPath("print.png"),
      fullPage: true,
    });
    await page.emulateMedia({
      media: "screen",
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    await expect(page.getByText("تفاصيل ثابتة دون اتصال.")).toBeVisible();
    expect(
      await page.evaluate(() => ({
        forced: matchMedia("(forced-colors: active)").matches,
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      })),
    ).toEqual({ forced: true, reduced: true });
    expect(await page.locator("pre code").textContent()).toBe(protectedCode);
    expect(
      await page
        .locator("body")
        .evaluate((element) => getComputedStyle(element).color),
    ).toBe(
      await page
        .locator("pre")
        .evaluate((element) => getComputedStyle(element).color),
    );
    expect(
      await page.locator("article").evaluate((element) => ({
        animation: getComputedStyle(element).animationName,
        transition: getComputedStyle(element).transitionDuration,
      })),
    ).toEqual({ animation: "none", transition: "0s" });
    await page.getByRole("link", { name: "مرجع" }).focus();
    expect(
      await page
        .getByRole("link", { name: "مرجع" })
        .evaluate((element) => getComputedStyle(element).outlineWidth),
    ).toBe("2px");
    await page.screenshot({
      path: testInfo.outputPath("forced-colors-reduced-motion.png"),
      fullPage: true,
    });
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    await testInfo.attach("offline-evidence", {
      body: JSON.stringify(
        {
          javaScriptEnabled: false,
          attemptedExternalRequests: requests,
          pageErrors: errors,
          viewport: 320,
          protectedCodeExact: true,
          print: true,
          forcedColors: true,
          reducedMotion: true,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await cleanupArtifactCandidate(candidate);
    expect(await readdir(temporaryRoot)).toEqual([]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

// Runs outside Vitest: the real private Astro bridge must clean process resources.
test("concurrent_real_rendering_closes_resources_without_dev_server_listeners", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "omega-concurrent-t5-"));
  const baseline = process.listenerCount("unhandledRejection");
  try {
    const results = await Promise.all([
      buildStandaloneHtml({ plan: standalonePlan(), temporaryRoot }),
      buildStandaloneHtml({ plan: standalonePlan(), temporaryRoot }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(process.listenerCount("unhandledRejection")).toBe(baseline);
    for (const result of results)
      if (result.ok) await cleanupArtifactCandidate(result.candidate);
    expect(await readdir(temporaryRoot)).toEqual([]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("production_engine_promotes_only_the_exact_phase_accepted_artifact", async ({
  page,
  context,
}, testInfo) => {
  const { createProductionEngine } = await import(
    "../../packages/engine/src/index.js"
  );
  const { readFile, writeFile } = await import("node:fs/promises");
  const { sha256 } = await import("../../packages/spec-frontend/src/index.js");
  const root = await mkdtemp(join(tmpdir(), "omega-engine-browser-t6-"));
  const requests: string[] = [];
  context.on("request", (request) => {
    if (!request.url().startsWith("file:")) requests.push(request.url());
  });
  await context.route("**/*", (route) =>
    route.request().url().startsWith("file:")
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  try {
    const result = await createProductionEngine().build({
      operation: "build",
      source: {
        module: "phase-accepted.omega.yaml",
        text: "omega: {schema: '3.0'}\nkind: artifact\nspec:\n  document: {title: 'تقرير Prime', language: ar}\n  sections:\n    - id: intro\n      title: المقدمة\n      body: |\n        محتوى أساسي واضح مع **Prime** ورمز `BUILD_ID_01`.\n\n        ```text\n        e\u0301 /tmp/path $HOME\n        ```\n",
      },
      settings: { outputDirectory: join(root, "dist") },
    });
    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") throw new Error(JSON.stringify(result));
    const bytes = await readFile(result.value.finalArtifactPath);
    const receipt = JSON.parse(
      await readFile(result.value.finalReceiptPath, "utf8"),
    );
    expect(receipt.artifactHash).toBe(sha256(bytes));
    expect(receipt.normalizedHash).toBe(result.value.compiled.normalizedHash);
    expect(receipt.acceptancePolicy).toBe("qa.phase.p02.walking-skeleton.v1");
    expect(receipt.gates.acceptance.acceptance).toBe("ACCEPTED");
    expect(
      Object.values(receipt.gates).every(
        (gate) =>
          (gate as { artifactHash: string }).artifactHash ===
          receipt.artifactHash,
      ),
    ).toBe(true);
    await page.goto(pathToFileURL(result.value.finalArtifactPath).href);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "تقرير Prime",
    );
    await expect(
      page.getByText("محتوى أساسي واضح", { exact: false }),
    ).toBeVisible();
    expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
    expect(await page.locator("pre code").textContent()).toBe(
      "e\u0301 /tmp/path $HOME\n",
    );
    expect(
      await page.locator("script,link[rel=stylesheet],astro-island").count(),
    ).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath("phase-accepted-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await page.screenshot({
      path: testInfo.outputPath("phase-accepted-mobile-320.png"),
      fullPage: true,
    });
    expect(requests).toEqual([]);
    await writeFile(testInfo.outputPath("phase-accepted-artifact.html"), bytes);
    await writeFile(
      testInfo.outputPath("phase-accepted-receipt.json"),
      JSON.stringify(receipt, null, 2),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
