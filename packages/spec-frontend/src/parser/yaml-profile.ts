import type { ParseOptions, SchemaOptions } from "yaml";

/** Fixed YAML 1.2 core resolution; only JSON-model explicit tags are allowed. */
export const OMEGA_YAML_OPTIONS = Object.freeze({
  version: "1.2" as const,
  schema: "core",
  merge: false,
  resolveKnownTags: false,
  intAsBigInt: true,
  uniqueKeys: true,
  strict: true,
  keepSourceTokens: true,
  prettyErrors: false,
  logLevel: "silent" as const,
}) satisfies ParseOptions & SchemaOptions;

export function isJsonModelTag(tag: string): boolean {
  return /^tag:yaml\.org,2002:(str|int|float|bool|null|map|seq)$/.test(tag);
}

/** Logical modules may have portable relative segments, never host locators. */
export function isLogicalModuleId(module: string): boolean {
  return (
    module.length > 0 &&
    !/^[~/]|[:\\]/u.test(module) &&
    [...module].every(
      (character) =>
        character.charCodeAt(0) >= 0x20 && character.charCodeAt(0) !== 0x7f,
    ) &&
    module
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== "..") &&
    invalidUnicodeOffset(module) === undefined
  );
}

/** I-JSON text excludes unpaired surrogates and Unicode noncharacters. */
export function invalidUnicodeOffset(
  text: string,
  start = 0,
): number | undefined {
  for (let offset = start; offset < text.length; offset++) {
    const code = text.codePointAt(offset);
    if (code === undefined) break;
    if (
      (code >= 0xd800 && code <= 0xdfff) ||
      (code >= 0xfdd0 && code <= 0xfdef) ||
      (code & 0xffff) >= 0xfffe
    )
      return offset;
    if (code > 0xffff) offset++;
  }
  return undefined;
}
