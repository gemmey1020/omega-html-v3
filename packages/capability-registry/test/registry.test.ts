import { createHash } from "node:crypto";
import { canonicalizeJson } from "@omega/spec-frontend";
import { expect, test } from "vitest";
import {
  createEmptyCapabilitySnapshot,
  createMinimalCapabilityRegistry,
  NARRATIVE_REPRESENTATION,
  snapshotCapabilities,
} from "../src/index.js";

test("minimal_registry_is_one_versioned_immutable_capability_snapshot", () => {
  const snapshot = createMinimalCapabilityRegistry();
  expect(snapshot).toMatchObject({
    version: "omega-capabilities/1.0",
    intents: ["narrative"],
    contentKinds: ["prose"],
    representations: ["omega.core.editorial.prose-flow@1"],
    profiles: ["prime"],
  });
  expect(snapshot.representationEntries).toHaveLength(1);
  expect(snapshot.representationEntries[0]).toMatchObject({
    id: "omega.core.editorial.prose-flow@1",
    version: "1",
    intents: ["narrative"],
    requiredContentKinds: ["prose"],
  });
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.representationEntries[0]?.fallbacks)).toBe(
    true,
  );
  const { snapshotHash, ...body } = snapshot;
  expect(snapshotHash).toBe(
    createHash("sha256").update(canonicalizeJson(body)).digest("hex"),
  );
});

test("snapshot_owns_values_and_normalizes_registry_enumeration_order", () => {
  const first = structuredClone(createMinimalCapabilityRegistry());
  const body = { ...first, policyVersions: ["policy-b", "policy-a"] };
  const snapshot = snapshotCapabilities(body);
  const reordered = snapshotCapabilities({
    ...body,
    policyVersions: ["policy-a", "policy-b"],
  });
  expect(snapshot).toEqual(reordered);
  body.policyVersions.push("late-mutation");
  expect(snapshot.policyVersions).toEqual(["policy-a", "policy-b"]);
  expect(Object.isFrozen(body.policyVersions)).toBe(false);
});

test("exported_capability_descriptor_cannot_change_future_snapshots", () => {
  expect(Object.isFrozen(NARRATIVE_REPRESENTATION)).toBe(true);
  expect(Object.isFrozen(NARRATIVE_REPRESENTATION.intents)).toBe(true);
});

test("snapshot_hash_excludes_runtime_context_even_on_representation_entries", () => {
  const baseline = createMinimalCapabilityRegistry();
  const entry = {
    ...NARRATIVE_REPRESENTATION,
    buildId: "correlation",
    time: 99,
    hostPath: "/private/host",
    character: { ...NARRATIVE_REPRESENTATION.character, runtime: "host" },
  };
  const actual = snapshotCapabilities({
    ...baseline,
    representationEntries: [entry],
    buildId: "correlation",
    hostPath: "/private/host",
  } as Parameters<typeof snapshotCapabilities>[0]);
  expect(actual).toEqual(baseline);
  expect(JSON.stringify(actual)).not.toMatch(
    /buildId|hostPath|\/private\/host|runtime/,
  );
});

test("empty_snapshot_has_no_installed_provider_or_capability", () => {
  const empty = createEmptyCapabilitySnapshot();
  expect(empty.intents).toEqual([]);
  expect(empty.contentKinds).toEqual([]);
  expect(empty.profiles).toEqual([]);
  expect(empty.representations).toEqual([]);
  expect(empty.representationEntries).toEqual([]);
  expect(empty.renderers).toEqual([]);
  expect(Object.isFrozen(empty)).toBe(true);
});
