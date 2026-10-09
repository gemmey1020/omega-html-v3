import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { createServer } from "vite";

const composerRoot = new URL("../../", import.meta.url);
const layoutPath = fileURLToPath(
  new URL("./layouts/ArtifactLayout.astro", import.meta.url),
);

// Keep the pinned compiler/render plugins; the HTTP dev handler owns unused
// background app compilation and process listeners unsuitable for container SSR.
async function staticPlugins(options) {
  const retained = [];
  for (const pending of options ?? []) {
    const plugin = await pending;
    if (Array.isArray(plugin)) retained.push(...(await staticPlugins(plugin)));
    else if (plugin && plugin.name !== "astro:server") retained.push(plugin);
  }
  return retained;
}

/** Narrow pinned-library bridge; its public boundary is declared in runtime.d.mts. */
export async function renderPlanToHtml(plan, checkCancellation) {
  const config = await getViteConfig(
    {
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
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
  const plugins = await staticPlugins(config.plugins);
  checkCancellation();
  const server = await createServer({
    ...config,
    configFile: false,
    plugins,
    server: {
      ...config.server,
      middlewareMode: true,
      hmr: false,
      ws: false,
      watch: null,
    },
  });
  try {
    // Check the actual Vite result, not just requested options. Fail closed.
    if (
      server.config.server.middlewareMode !== true ||
      server.config.server.hmr !== false ||
      server.config.server.ws !== false ||
      server.config.server.watch !== null ||
      server.httpServer !== null ||
      Object.keys(server.watcher.getWatched()).length !== 0
    ) {
      throw new Error("Static Astro server resource isolation failed.");
    }
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
