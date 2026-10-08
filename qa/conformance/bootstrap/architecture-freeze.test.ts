import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const architecture = resolve(root, "docs/architecture");
const references = [
  {
    file: "OMEGA_HTML_V3_FORMAL_ARCHITECTURE_SPEC_v1.0-FROZEN.md",
    sha256: "0412443952d3f7e3944a6e48acca953ea884fdd35cb46d2f0b62cf0ff9e7910e",
  },
  {
    file: "OMEGA_HTML_V3_FOUNDER_APPROVAL_2026-10-08.md",
    sha256: "b6b946bc5d3ec7832f73e519a5bf6f5311db1089e7381088cb1dbf67c72fc64f",
  },
];

test("architecture_status_is_frozen_for_v3_only", () => {
  const path = resolve(architecture, "ARCHITECTURE_STATUS.md");
  expect(existsSync(path), "Missing architecture status index").toBe(true);
  const status = readFileSync(path, "utf8");
  expect(status).toContain("ARCHITECTURE FROZEN FOR IMPLEMENTATION PLANNING");
  expect(status).toMatch(/V2 status:\*\* frozen, preserved, untouched/);
  expect(status).toContain(
    "This architecture freeze does not authorize V2 mutation.",
  );
  expect(status).toContain("P00 bootstrap only");
  for (const reference of references) {
    expect(status, `Missing local reference link: ${reference.file}`).toContain(
      `](${reference.file})`,
    );
  }
});

test.each(references)(
  "approved_reference_preserves_bytes: $file",
  ({ file, sha256 }) => {
    const path = resolve(architecture, file);
    expect(
      existsSync(path),
      `Missing approved architecture reference: ${file}`,
    ).toBe(true);
    const bytes = readFileSync(path);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
    expect(bytes.toString("utf8")).toContain(
      "ARCHITECTURE FROZEN FOR IMPLEMENTATION PLANNING",
    );
  },
);

test("implementation_docs_do_not_authorize_v2_mutation", () => {
  const immutableReferences = new Set(
    references.map(({ file }) => resolve(architecture, file)),
  );
  function checkDirectory(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) checkDirectory(path);
      if (
        !entry.isFile() ||
        !entry.name.endsWith(".md") ||
        immutableReferences.has(path)
      )
        continue;
      const text = readFileSync(path, "utf8").replace(/\*\*/g, "");
      expect(text, `V2 mutation authorization claim in ${path}`).not.toMatch(
        /(?:spec(?:ification)?|architecture(?: freeze)?|approval)\s+(?:(?:hereby|explicitly|directly|also|now)\s+)*(?:authorizes?|permits?|allows?)\s+(?:modification (?:of|to) V2|changes? to V2|V2 (?:mutation|modification|changes?))/i,
      );
      expect(text, `V2 mutation authorization claim in ${path}`).not.toMatch(
        /V2 (?:mutation|modification|changes?)\s+(?:is|are)\s+(?:authorized|permitted|allowed)\s+by\s+(?:the\s+)?(?:spec(?:ification)?|architecture|approval)/i,
      );
    }
  }
  checkDirectory(resolve(root, "docs"));
});
