import type {
  CanonicalContract,
  Diagnostic,
  SourceMap,
  SourceMapEntry,
} from "@omega/contracts";
import type {
  RawArtifactSpec,
  RawSection,
} from "../validation/validate-raw.js";

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

/** Canonical pointer -> Raw pointer, including body insertion at every section depth. */
export function canonicalPointerToRaw(
  path: string,
  raw: RawArtifactSpec,
): string {
  if (path === "/contractVersion") return "/omega/schema";
  if (path === "/metadata/idOrigin") return "/metadata/id";
  if (path === "/spec/document/direction") return "/spec/document/language";
  const tokens = path.split("/").slice(1);
  if (tokens[0] !== "spec" || tokens[1] !== "sections") return path;
  let values: readonly RawSection[] = raw.spec.sections;
  let index = 2;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined || !/^(0|[1-9][0-9]*)$/.test(token)) return path;
    const section = values[Number(token)];
    if (!section) return path;
    const prefix = `/${tokens.slice(0, index + 1).join("/")}`;
    const field = tokens[index + 1];
    if (field === "idOrigin") return `${prefix}/id`;
    if (field === "content") {
      const blockToken = tokens[index + 2];
      if (blockToken === undefined) return `${prefix}/content`;
      const blockIndex = Number(blockToken);
      if (section.body !== undefined && blockIndex === 0)
        return `${prefix}/body`;
      const rawIndex = blockIndex - (section.body !== undefined ? 1 : 0);
      const blockPath = `${prefix}/content/${rawIndex}`;
      const blockField = tokens[index + 3];
      // Rich-text descendants all originate in one authoring scalar. Markdown
      // AST offsets are intentionally not projected onto YAML source positions.
      if (blockField === "text") return `${blockPath}/text`;
      if (blockField === "idOrigin") return `${blockPath}/id`;
      return `${blockPath}${blockField === undefined ? "" : `/${tokens.slice(index + 3).join("/")}`}`;
    }
    if (field !== "sections") return path;
    values = section.sections ?? [];
    index += 2;
  }
  return path;
}

/** One entry for each actual canonical node; authoring-only fields are excluded. */
export function buildSourceMap(
  raw: RawArtifactSpec,
  canonical: CanonicalContract,
  rawSourceMap: SourceMap,
): SourceMap {
  const entries: SourceMapEntry[] = [];
  function visit(value: unknown, path: string) {
    const location = nearestSourceLocation(
      canonicalPointerToRaw(path, raw),
      rawSourceMap,
    );
    if (location) entries.push({ path, location });
    if (value !== null && typeof value === "object")
      for (const [key, child] of Object.entries(value))
        visit(
          child,
          `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        );
  }
  visit(canonical, "");
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { entries };
}

/** ID-stage paths refer to canonical positions; failures expose only authored diagnostics. */
export function mapIdDiagnosticsToRaw(
  diagnostics: readonly Diagnostic[],
  raw: RawArtifactSpec,
  rawSourceMap: SourceMap,
): readonly Diagnostic[] {
  function origin(path: string | undefined) {
    if (path === undefined) return {};
    const rawPath = canonicalPointerToRaw(path, raw);
    const location = nearestSourceLocation(rawPath, rawSourceMap);
    return { path: rawPath, ...(location ? { location } : {}) };
  }
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    ...origin(diagnostic.path),
    ...(diagnostic.related
      ? {
          related: diagnostic.related.map((reference) => ({
            ...reference,
            ...origin(reference.path),
          })),
        }
      : {}),
  }));
}
