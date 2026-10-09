/** Stable representation identity; renderer bindings are provider-owned. */
export const NARRATIVE_REPRESENTATION_ID =
  "omega.core.editorial.prose-flow@1" as const;
export interface NarrativeRepresentation {
  readonly id: typeof NARRATIVE_REPRESENTATION_ID;
  readonly version: "1";
  readonly stability: "phase-p02";
  readonly intents: readonly ["narrative"];
  readonly requiredContentKinds: readonly ["prose"];
  readonly optionalContentKinds: readonly [];
  readonly contentShape: "canonical-rich-text";
  readonly character: { readonly editorial: 1; readonly expressive: 0 };
  readonly costs: {
    readonly complexity: 0;
    readonly attention: 0;
    readonly interaction: 0;
  };
  readonly responsiveVariants: readonly ["reflow"];
  readonly fallbacks: readonly [
    "print",
    "no-js",
    "reduced-motion",
    "forced-colors",
  ];
  readonly accessibilityContract: "semantic-prose/1";
  readonly rendererBinding: "editorial.prose-flow/1";
  readonly stressFixtures: readonly [
    "canonical-prose",
    "mixed-bidi",
    "nested-sections",
  ];
  readonly qaPolicy: "qa.phase.p02.walking-skeleton.v1";
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const NARRATIVE_REPRESENTATION: NarrativeRepresentation =
  freeze<NarrativeRepresentation>({
    id: NARRATIVE_REPRESENTATION_ID,
    version: "1",
    stability: "phase-p02",
    intents: ["narrative"],
    requiredContentKinds: ["prose"],
    optionalContentKinds: [],
    contentShape: "canonical-rich-text",
    character: { editorial: 1, expressive: 0 },
    costs: { complexity: 0, attention: 0, interaction: 0 },
    responsiveVariants: ["reflow"],
    fallbacks: ["print", "no-js", "reduced-motion", "forced-colors"],
    accessibilityContract: "semantic-prose/1",
    rendererBinding: "editorial.prose-flow/1",
    stressFixtures: ["canonical-prose", "mixed-bidi", "nested-sections"],
    qaPolicy: "qa.phase.p02.walking-skeleton.v1",
  });
