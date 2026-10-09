import type { SourceMap } from "@omega/contracts";

/** Missing/synthesized fields inherit the nearest authored parent, never coordinates invented inside prose. */
export function nearestSourceLocation(path: string, sourceMap?: SourceMap) {
  let current = path;
  while (true) {
    const location = sourceMap?.entries.find(
      (entry) => entry.path === current,
    )?.location;
    if (location) return location;
    if (!current) return undefined;
    current = current.slice(0, current.lastIndexOf("/"));
  }
}
