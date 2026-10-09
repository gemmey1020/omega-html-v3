import { createMinimalCapabilityRegistry } from "@omega/capability-registry";
import { createMinimalPlan } from "@omega/presentation-engine";
import { compileRawSpec } from "@omega/spec-frontend";

export const protectedCode =
  'e\u0301 <tag> & "quote"\n  $HOME /tmp/file\n' +
  "identifier_".repeat(40) +
  "\n";
export function standalonePlan() {
  const compiled = compileRawSpec({
    source: {
      module: "offline.omega.yaml",
      text: `omega: {schema: '3.0'}
kind: artifact
metadata: {id: offline}
spec:
  document: {title: 'تقرير Prime', language: ar}
  sections:
    - id: intro
      title: المقدمة
      body: |
        محتوى أساسي واضح مع **Prime** ورابط [مرجع](https://example.test/reference).

        رمز ${"`BUILD_ID_01`"} واسم ثابت.

        طويل ${"ASCII_identifier_".repeat(35)}

        ${"```"}text
${protectedCode
  .slice(0, -1)
  .split("\n")
  .map((line) => `        ${line}`)
  .join("\n")}
        ${"```"}
      sections:
        - id: details
          title: التفاصيل
          body: تفاصيل ثابتة دون اتصال.
`,
    },
    engineVersion: "0.0.0",
  });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const planned = createMinimalPlan({
    canonical: compiled.canonical,
    capabilities: createMinimalCapabilityRegistry(),
    engineVersion: "0.0.0",
  });
  if (!planned.ok) throw new Error(JSON.stringify(planned.diagnostics));
  return planned.plan;
}
