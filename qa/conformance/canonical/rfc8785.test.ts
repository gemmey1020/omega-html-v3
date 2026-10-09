import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { canonicalizeJson } from "../../../packages/spec-frontend/src/canonical/canonicalize.js";

function fixture(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

// Expected values are independently transcribed from the published RFC, not
// produced by canonicalizeJson or JSON.stringify in the test setup.
test.each(["primitives", "sorting"])("RFC8785 published %s vector", (name) => {
  const value: unknown = JSON.parse(fixture(`rfc8785-${name}.input.json`));
  expect(canonicalizeJson(value)).toBe(
    fixture(`rfc8785-${name}.expected.txt`).trimEnd(),
  );
});

const numericCorpus: {
  vectors: { ieee754: string; expected: string | null }[];
} = JSON.parse(fixture("rfc8785-numbers.json"));
test.each(numericCorpus.vectors)(
  "RFC8785 Appendix B $ieee754 -> $expected",
  ({ ieee754, expected }) => {
    const value = Buffer.from(ieee754, "hex").readDoubleBE();
    if (expected === null)
      expect(() => canonicalizeJson(value)).toThrow("finite");
    else expect(canonicalizeJson(value)).toBe(expected);
  },
);

test("JCS preserves Unicode, sorts UTF16 recursively, and preserves array order", () => {
  const value = {
    "\ufb33": 6,
    "😀": 5,
    ö: 4,
    "10": 1,
    "2": 2,
    a: [{ z: "ا\u0654", a: "أ" }, 3, 1],
  };
  expect(canonicalizeJson(value)).toBe(
    '{"10":1,"2":2,"a":[{"a":"أ","z":"أ"},3,1],"ö":4,"😀":5,"דּ":6}',
  );
  expect(canonicalizeJson({ "\n": 1, "": 2, a: 3 })).toBe(
    '{"":2,"\\n":1,"a":3}',
  );
});

test("published numeric corpus cannot be silently truncated", () => {
  expect(numericCorpus.vectors).toHaveLength(26);
});
