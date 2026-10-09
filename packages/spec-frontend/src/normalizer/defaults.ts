import type { TextDirection } from "@omega/contracts";
import type { RawSection } from "../validation/validate-raw.js";

// Fixed compiler policy; no runtime locale database, prose detection or I/O.
// Explicit script subtags override the primary-language default. Unknown
// languages/scripts and neutral und default to ltr, without changing the tag.
const RTL_SCRIPTS = new Set([
  "adlm",
  "arab",
  "armi",
  "avst",
  "chrs",
  "elym",
  "hatr",
  "hebr",
  "hung",
  "khar",
  "lydi",
  "mand",
  "mani",
  "mend",
  "merc",
  "mero",
  "narb",
  "nbat",
  "nkoo",
  "orkh",
  "palm",
  "phli",
  "phlp",
  "phnx",
  "prti",
  "rohg",
  "samr",
  "sarb",
  "sogd",
  "sogo",
  "syrc",
  "thaa",
  "yezi",
]);
const RTL_LANGUAGES = new Set([
  "ar",
  "arc",
  "ckb",
  "dv",
  "fa",
  "he",
  "iw",
  "ks",
  "nqo",
  "ps",
  "sd",
  "syr",
  "ug",
  "ur",
  "yi",
]);

export function directionForLanguage(language: string): TextDirection {
  const subtags = language.toLowerCase().split("-");
  // Only pre-extension subtags declare the language script. A four-letter
  // private-use token (en-x-arab) must not impersonate an explicit script.
  let script: string | undefined;
  for (const subtag of subtags.slice(1)) {
    if (subtag.length === 1) break;
    if (/^[a-z]{4}$/.test(subtag)) {
      script = subtag;
      break;
    }
  }
  return (
    script
      ? RTL_SCRIPTS.has(script)
      : RTL_LANGUAGES.has(subtags[0] ?? "")
  )
    ? "rtl"
    : "ltr";
}

/** Narrow syntactic convenience, never a classifier for authored prose. */
export function defaultSectionIntent(section: RawSection): string | undefined {
  return (
    section.intent ??
    (section.body !== undefined &&
    !section.content?.length &&
    !section.sections?.length
      ? "narrative"
      : undefined)
  );
}
