import { canonicalizeJson, sha256 } from "@omega/spec-frontend";
import {
  NARRATIVE_REPRESENTATION,
  type NarrativeRepresentation,
} from "./core/narrative.js";

export const CAPABILITY_SNAPSHOT_VERSION = "omega-capabilities/1.0" as const;
export interface CapabilitySnapshotData {
  readonly version: typeof CAPABILITY_SNAPSHOT_VERSION;
  readonly intents: readonly string[];
  readonly contentKinds: readonly string[];
  readonly representations: readonly string[];
  readonly profiles: readonly string[];
  readonly targets: readonly string[];
  readonly renderers: readonly string[];
  readonly plugins: readonly string[];
  readonly qaRules: readonly string[];
  readonly policyVersions: readonly string[];
  readonly profileVersion: "1";
  readonly representationEntries: readonly NarrativeRepresentation[];
}
export interface CapabilitySnapshot extends CapabilitySnapshotData {
  readonly snapshotHash: string;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const ordered = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort();

/** Whitelisted declared state only; no runtime context, time or host locators. */
export function snapshotCapabilities(
  data: CapabilitySnapshotData,
): CapabilitySnapshot {
  const body: CapabilitySnapshotData = {
    version: data.version,
    intents: ordered(data.intents),
    contentKinds: ordered(data.contentKinds),
    representations: ordered(data.representations),
    profiles: ordered(data.profiles),
    targets: ordered(data.targets),
    renderers: ordered(data.renderers),
    plugins: ordered(data.plugins),
    qaRules: ordered(data.qaRules),
    policyVersions: ordered(data.policyVersions),
    profileVersion: data.profileVersion,
    representationEntries: data.representationEntries
      .map(
        (entry): NarrativeRepresentation => ({
          id: entry.id,
          version: entry.version,
          stability: entry.stability,
          intents: [...entry.intents],
          requiredContentKinds: [...entry.requiredContentKinds],
          optionalContentKinds: [...entry.optionalContentKinds],
          contentShape: entry.contentShape,
          character: {
            editorial: entry.character.editorial,
            expressive: entry.character.expressive,
          },
          costs: {
            complexity: entry.costs.complexity,
            attention: entry.costs.attention,
            interaction: entry.costs.interaction,
          },
          responsiveVariants: [...entry.responsiveVariants],
          fallbacks: [...entry.fallbacks],
          accessibilityContract: entry.accessibilityContract,
          rendererBinding: entry.rendererBinding,
          stressFixtures: [...entry.stressFixtures],
          qaPolicy: entry.qaPolicy,
        }),
      )
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      ),
  };
  return freeze({ ...body, snapshotHash: sha256(canonicalizeJson(body)) });
}

/** An uninstalled Engine has no registered capabilities. */
export function createEmptyCapabilitySnapshot(): CapabilitySnapshot {
  return snapshotCapabilities({
    version: CAPABILITY_SNAPSHOT_VERSION,
    intents: [],
    contentKinds: [],
    representations: [],
    profiles: [],
    targets: [],
    renderers: [],
    plugins: [],
    qaRules: [],
    policyVersions: [],
    profileVersion: "1",
    representationEntries: [],
  });
}

/** P02-only registry. Declared QA/fallback contracts are not acceptance evidence. */
export function createMinimalCapabilityRegistry(): CapabilitySnapshot {
  return snapshotCapabilities({
    version: CAPABILITY_SNAPSHOT_VERSION,
    intents: ["narrative"],
    contentKinds: ["prose"],
    representations: [NARRATIVE_REPRESENTATION.id],
    profiles: ["prime"],
    targets: ["standalone-html"],
    renderers: ["astro-static/1"],
    plugins: [],
    qaRules: ["semantic-prose/1"],
    policyVersions: ["qa.phase.p02.walking-skeleton.v1"],
    profileVersion: "1",
    representationEntries: [NARRATIVE_REPRESENTATION],
  });
}
