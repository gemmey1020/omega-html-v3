import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { createServer } from "vite";

const composerRoot = new URL("../../", import.meta.url);
const layoutPath = fileURLToPath(
  new URL("./layouts/ArtifactLayout.astro", import.meta.url),
);

/** Narrow pinned-library bridge; its public boundary is declared in runtime.d.mts. */
export async function renderPlanToHtml(plan, checkCancellation) {
  const config = await getViteConfig(
    {
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    },
    {
      root: composerRoot,
      srcDir: "./src/astro/",
      configFile: false,
      cacheDir: fileURLToPath(
        new URL("../../../../.tools/astro-composer/", import.meta.url),
      ),
      devToolbar: { enabled: false },
      logLevel: "error",
      output: "static",
    },
  )({ command: "serve", mode: "production" });
  checkCancellation();
  const server = await createServer({ ...config, configFile: false });
  try {
    checkCancellation();
    const module = await server.ssrLoadModule(layoutPath);
    checkCancellation();
    const container = await AstroContainer.create({ streaming: false });
    checkCancellation();
    const html = await container.renderToString(module.default, {
      props: { plan },
      partial: false,
    });
    checkCancellation();
    return html;
  } finally {
    // Middleware has no HTTP listener; HMR/watchers disabled; close all owned resources.
    await server.close();
  }
}
