# ADR-0002: Parent-scoped convenience IDs and typed reference authority

Status: Adopted for the P01 artifact/prose slice

## Context

T4 produces a normalized `DraftCanonicalContract`, preserving authored IDs and
omitting unauthored IDs. The public canonical ABI requires an ID on artifact
metadata, every section, and every prose block. Raw/local IDs use the frozen
nonempty ASCII grammar `A-Z a-z 0-9 . _ -`, case-sensitive. Human titles remain
Unicode. `/` belongs to namespace/reference structure, never to a local ID.

## Decision

`assignCanonicalIds` is a pure, separate stage that consumes T4 success and
returns either a complete `CanonicalContract` or fatal structured diagnostics.
Final metadata, section, and prose DTOs require `idOrigin: explicit | generated`.
Before-ID draft DTOs prohibit origin fields. The runtime pass also rejects any
own `idOrigin` field, including on nested sections/blocks, with
`OMEGA-ID-ALREADY-ASSIGNED`; reapplying never silently labels a generated ID as
explicit. T6 owns orchestration and must stop when this stage fails.

There are three kinds of semantic scope:

- Artifact metadata is a singleton identity at the document root.
- A collection of sibling sections is local to its semantic parent (artifact
  root or owning section).
- A collection of sibling content blocks is local to its owning section and
  distinct from that section's child-section collection.

The same local ID can exist under different parents or in different typed
collections. Two explicit IDs in the same typed sibling collection are fatal
duplicates, even when generated IDs would otherwise be unnecessary. IDs are
case-sensitive: `State` and `state` differ. Diagnostic related references point
to the first duplicate's semantic JSON path. Those paths are diagnostics, not
identity namespaces or generation inputs.

### Generation algorithm

1. Validate every explicit ID against the full-token frozen ASCII grammar;
   preserve its exact bytes/case and mark it `explicit`. Reserve all valid
   explicit IDs in a sibling collection before generating any sibling ID,
   including explicit IDs that occur later in the array. Invalid IDs and
   duplicate explicit IDs are fatal and never return a usable partial value.
2. Select a slug source: normalized document title for artifact metadata,
   normalized section title for sections, and the existing `prose` kind for
   prose blocks. Never derive identity from block prose or infer narrative
   meaning. Missing, null, or entirely non-ASCII/non-alphanumeric titles use
   the fallback `artifact` or `section` respectively.
3. For titles, lowercase ASCII `A-Z`, replace each maximal run outside
   `[a-z0-9]` with one `-`, then remove leading/trailing `-`. No transliteration,
   locale operation, additional text normalization, or Unicode case mapping.
4. Traverse the ordered sibling array. Maintain a separate ordinal counter for
   each slug within that typed parent scope. An omitted ID uses `slug-N`,
   starting at `N=1` and increasing until the candidate is not reserved. Reserve
   the generated candidate and mark it `generated`. Explicit IDs do not advance
   counters; their reservations can cause ordinal skips. Reset counters for
   each sibling collection; artifact metadata uses the singleton ordinal `1`.

Example: siblings `{title: State}`, `{id: state-1}`, `{title: State}`,
`{id: state-3}`, `{title: State}` become `state-2`, `state-1`, `state-4`,
`state-3`, `state-5`. Child section collections can each use `state-1`.

No map iteration, host/module path, filesystem state, timestamp, hash, random
value, network operation, or input mutation participates. Reordering map keys
does not affect IDs. Ordered content arrays are semantically meaningful:
reordering repeated-title sections/prose can change the item-to-ordinal
association. Renaming titles or inserting colliding siblings can also change
generated IDs. These are conveniences and never promises of durable identity.

### Reference address space and authority

Only already known canonical identities are accepted by the pure
`createCanonicalReference(identity, usage)` policy helper. It neither parses
Raw references nor looks up identities, resolves imports, fetches resources,
or implements a future capability. The caller supplies actual identity origins
and the semantic section ancestry. P01 Raw schemas still reject reference
authoring fields. No reference fields are introduced into the artifact payload.

Resolved DTOs have the common address `{kind, artifactId, sectionPath, id}`:

| Type | kind | sectionPath |
| --- | --- | --- |
| ArtifactRef | artifact | Empty; artifactId equals id |
| SectionRef | section | IDs of ancestor sections, excluding target |
| ContentBlockRef | content-block | IDs of ancestor sections, including owner |

`kind` disambiguates section and block collections; `artifactId` identifies
the artifact resource; `sectionPath` describes semantic parent ancestry; `id`
is the target's local ID. A block requires an owning section. Every address
component is validated against the same local ASCII grammar. Scope arrays
encode reference structure without embedding namespace separators in IDs.
String namespace serialization and cross-resource lookup are deferred.

An `internal` reference can name a generated identity already known within a
canonical value. An `external` reference requires explicit origin for the
artifact resource, every section ancestor, and the target. An explicit child
under a generated parent or generated artifact is insufficient: its address
contains unstable authority. Generated components produce the fatal
`OMEGA-REF-GENERATED-AUTHORITY` diagnostic and no resolved value. Required
origins cannot be invented by the helper; it validates supplied provenance,
without claiming existence or lookup beyond the caller's known identity.

## Consequences

Authors retain simple omitted-ID authoring, while external references require
authored stable authority. Duplicate rejection is local and typed, avoiding
accidental global-ID constraints on semantic hierarchy. The canonical ABI now
records provenance explicitly; final values cannot be reused as before-ID
drafts. Existing Raw grammar, parser, and omitted-ID authoring remain intact.
