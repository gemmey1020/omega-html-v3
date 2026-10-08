# Ω OMEGA HTML V3 — Formal Architecture Specification v1.0 — FROZEN

**Status:** ARCHITECTURE FROZEN FOR IMPLEMENTATION PLANNING — Founder approved the written specification on 2026-10-08.  
**Owner:** Jemy / OMEGA Founder  
**Date:** 2026-10-08  
**Applies to:** OMEGA HTML V3 / OMEGA Artifact Platform  
**Implementation authorization:** **NOT GRANTED BY THIS DOCUMENT.**  
**V2 status:** frozen, preserved, untouched as the evolution baseline.  
**Next gate:** formal implementation planning only. Implementation remains separately gated.

---

# 0. Purpose of this specification

This document is the canonical frozen architecture specification for **OMEGA HTML V3**. It consolidates the approved design decisions into one coherent system specification so that implementation can later proceed without relying on conversational memory, scattered handoffs, or implicit assumptions.

It is intentionally an **architecture specification**, not a coding plan. It defines system boundaries, contracts, invariants, responsibilities, authority, data flow, extension points, rendering philosophy, quality gates, and target adapters. It does not authorize modification of OMEGA HTML V2 and does not prescribe task-by-task implementation order.

The specification replaces the role of a conversational handoff. The Founder approved this written document on 2026-10-08; the system is therefore **ARCHITECTURE FROZEN FOR IMPLEMENTATION PLANNING**. This freeze authorizes planning only, not implementation changes.

---

# 1. Executive architectural decision

OMEGA HTML V3 is not a report template engine and not a prettier continuation of V2. It is designed as a **deterministic, extensible artifact platform** that converts portable semantic source into high-quality web artifacts while preserving truth, provenance, presentation discipline, accessibility, reproducibility, and maintainability.

The product direction is:

```text
Ω OMEGA ARTIFACT PLATFORM

Human / ChatGPT / Codex / Studio / CLI
                  │
                  ▼
            Ω Raw Spec
             .omega.yaml
                  │
                  ▼
          Spec Compiler Front-End
                  │
                  ▼
        Ω Canonical Contract
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 Semantic / Evidence    Presentation Policy
        │                   │
        └─────────┬─────────┘
                  ▼
      Representation + Rhythm
                  │
                  ▼
         Treatment / Profile
                  │
                  ▼
              Render Spec
                  │
          ┌───────┴────────┐
          ▼                ▼
   Artifact Adapter      Site Adapter
          │                │
          ▼                ▼
 Standalone HTML      Static Multi-Page Site
          │                │
          └───────┬────────┘
                  ▼
       Verification / Quality
       Regression / Acceptance
                  │
                  ▼
        Accepted / Promoted Output
```

The engine is independent from any LLM. LLMs are clients or planners; they are never required runtime dependencies for a valid OMEGA build.

---

# 2. Scope

OMEGA V3 is responsible for:

- portable human/agent authoring through `.omega.yaml`;
- deterministic normalization into a strict canonical contract;
- semantic content modeling;
- adaptive truth/evidence/provenance handling;
- representation eligibility and selection;
- document/page rhythm and composition planning;
- OMEGA presentation profiles and treatment resolution;
- static-first rendering through appropriate web technologies;
- standalone HTML packaging;
- multi-page static site composition;
- diagnostics, receipts, traceability, QA, regression, and acceptance;
- human authoring through a local Studio;
- plugin/capability extensibility under strong contracts;
- reproducibility-oriented build inputs and artifact identities.

OMEGA V3 is not primarily responsible for:

- general-purpose desktop publishing;
- pixel-position page building;
- arbitrary CSS customization by artifact authors;
- arbitrary JavaScript injection;
- full CMS/server/backend functionality;
- deployment-provider-specific infrastructure;
- hidden AI reasoning storage;
- claiming real-world truth merely because evidence links exist;
- replacing browser accessibility preferences with branding;
- forcing every document through a heavyweight evidence model;
- acting as a general templating language or programming language.

---

# 3. Foundational system laws

These laws are architectural invariants. Implementation may refine mechanics but must not violate them without a new formal architecture revision.

## 3.1 V2 Freeze Law

OMEGA HTML V2 remains intact. V3 is implemented independently. V2 may be inspected for lessons, semantics, regression fixtures, and migration knowledge, but is not the main mutation path.

## 3.2 Engine Independence Law

OMEGA Engine must function without ChatGPT, Codex, cloud APIs, or any LLM. Human Studio and CLI workflows are first-class.

## 3.3 Canonical Raw Spec Law

`.omega.yaml` is the portable human/agent authoring contract. It must remain understandable, versioned, strict, and independent from renderer implementation names.

## 3.4 Strong Separation Law

Meaning, observation, interpretation, decision, representation, treatment, rendering, verification, quality evaluation, regression detection, and acceptance are separate responsibilities.

## 3.5 Semantic Content Law

> **Model meaning, not markup and not appearance.**

Risk data is modeled as risk data, not “red cards.” Architecture is modeled as graph/hierarchy/process data, not a specific React component.

## 3.6 Large Capability / Selective Output Law

OMEGA should maintain a large vocabulary of capabilities so that a given artifact can use the few that fit best. Diversity is a capability pool, not a quota.

## 3.7 Constraint-Driven Selection Law

Hard constraints filter candidates. Soft preferences score remaining candidates. Unsatisfied hard requirements produce diagnostics rather than silent degradation.

## 3.8 Static-First Law

Prefer semantic HTML/CSS, then SVG, then minimal JavaScript, then richer client frameworks only when interaction or capability genuinely requires them.

## 3.9 Least-Powerful Renderer Law

Use the least powerful rendering technology that satisfies the representation contract.

## 3.10 Brand / Semantic Firewall

Brand expression and semantic status are separate. Founder Sand is a brand-warmth stop, not a generic status color.

## 3.11 Accessibility Supremacy Law

User accessibility requirements and browser/OS accessibility environments override decorative brand expression where necessary.

## 3.12 No Hidden Semantic State Law

Any state that changes artifact meaning or presentation policy must be representable in OMEGA contracts. Studio may keep transient UI/session state, but never private semantic truth.

## 3.13 Desired State / Generated State Law

Raw authoring describes desired artifact state. Plans, selections, receipts, snapshots, diagnostics, QA evidence, and build results are generated state and live separately.

## 3.14 Traceability Law

Important generated conclusions and build outputs must be traceable to canonical input identities, capability versions, resource identities, and policy versions.

## 3.15 Determinism Law

The same canonical inputs, capability snapshot, policies, engine versions, and defined build environment should produce the same semantic plan; release modes should support reproducible artifacts where declared.

## 3.16 Research Gate Law

Major architectural extensions must be researched against mature external patterns before they are introduced. OMEGA does not add complexity because a technology is fashionable.

---

# 4. V2 relationship and inheritance boundaries

V2 contributes lessons, not implementation constraints.

The following V2 strengths are explicitly preserved conceptually:

```text
Input
  ↓
Truth / Evidence
  ↓
Reader / Strategy
  ↓
Authored Content
  ↓
Semantic Composition
  ↓
Truth Lock / Validation
  ↓
Rendering
  ↓
Artifact + semantic evidence/receipt
```

V3 corrects major V2 limitations:

- semantic section vocabulary was too narrow;
- representation vocabulary was significantly too narrow;
- repeated use of cards/tables/lists created visual monoculture;
- renderer logic and presentation profile logic were overly coupled;
- some profile rules and legacy palettes were hard-coded;
- old tests encoded historical visual assumptions too tightly;
- particle presentation logic modified unrelated document structures;
- renderer implementation concerns could leak too close to composition.

V3 therefore preserves the semantic discipline but rebuilds presentation, registry, rendering, tooling, and target architecture independently.

---

# 5. Product surfaces and clients

OMEGA has one engine and multiple clients.

```text
                       Ω ENGINE API
                            ▲
             ┌──────────────┼───────────────┐
             │              │               │
            CLI           Studio         Agents
                                            │
                                     ChatGPT / Codex
```

The principal workflows are:

### LLM-assisted

An LLM may author or edit `.omega.yaml`, propose representation preferences, or interpret diagnostics. It does not render arbitrary final HTML outside the engine contract.

### Human Studio

A local Studio allows authoring, inspection, preview, evidence review, QA, and release without requiring an LLM.

### Raw Spec / CLI

A user can receive a portable `.omega.yaml` anywhere, copy it to a machine, and run OMEGA locally.

### Programmatic

External software may invoke the Engine API or the local Engine Protocol without scraping CLI text.

---

# 6. Canonical end-to-end pipeline

The canonical conceptual pipeline is:

```text
Ω RAW SPEC
    │
    ▼
BYTE / ENCODING GATE
    │
    ▼
Ω YAML PARSER
    │
    ▼
RAW AST / SOURCE MODEL
    │
    ▼
RAW SCHEMA VALIDATION
    │
    ▼
MODULE + RESOURCE RESOLUTION
    │
    ▼
SHORTHAND EXPANSION
    │
    ▼
DEFAULT EXPANSION
    │
    ▼
TEXT / TYPE NORMALIZATION
    │
    ▼
REFERENCE BINDING
    │
    ▼
Ω CANONICAL CONTRACT
    │
    ├──────────────► SOURCE MAP SIDECAR
    │
    └──────────────► RESOLUTION MANIFEST SIDECAR
    │
    ▼
SEMANTIC / EVIDENCE VALIDATION
    │
    ▼
PRESENTATION POLICY COMPILER
    │
    ▼
CONTENT SHAPE ANALYSIS
    │
    ▼
REPRESENTATION SELECTION
    │
    ▼
RHYTHM / COMPOSITION PLAN
    │
    ▼
PROFILE / TREATMENT PLAN
    │
    ▼
Ω RENDER SPEC
    │
    ▼
RENDER
    │
    ▼
PACKAGE
    │
    ▼
VERIFICATION
    │
    ▼
QUALITY EVALUATION
    │
    ▼
REGRESSION DETECTION
    │
    ▼
ACCEPTANCE
    │
    ▼
ATOMIC PROMOTION
    │
    ▼
ARTIFACT + RECEIPTS
```

Each boundary is deliberate and must remain observable in diagnostics and debug intermediates.

---

# 7. Ω Raw Spec — public authoring architecture

## 7.1 Role

`.omega.yaml` is the public human/agent authoring format. It is ergonomic, declarative, portable, strict, and intentionally smaller than the internal canonical model.

The Raw Spec describes desired artifact state. It must not contain generated runtime state such as selected scores, final DOM, final CSS, validation outcomes, screenshots, build timestamps, or renderer measurements.

## 7.2 Root envelope

Canonical authoring direction:

```yaml
omega:
  schema: "3.0"
  requires_engine: ">=3.0.0 <4.0.0"   # optional

kind: artifact

metadata:
  id: phase-b-review

spec:
  ...
```

`kind` is extensible. Initial architectural kinds are:

```text
artifact
site
fragment
```

## 7.3 Human simplicity

A minimal artifact must remain small:

```yaml
omega:
  schema: "3.0"

kind: artifact

spec:
  document:
    title: "Project Review"
    language: ar

  sections:
    - title: "الحالة الحالية"
      body: |
        المشروع يعمل، لكن ما زالت هناك نقاط مفتوحة.
```

The normalizer expands omitted defaults and shorthand. Convenience ends at the compiler boundary.

## 7.4 Ω YAML profile

OMEGA uses a deliberately restricted YAML profile:

- UTF-8 only;
- JSON-compatible primitive model: object, array, string, number, boolean, null;
- comments and multiline strings allowed;
- duplicate keys are fatal;
- custom tags are not semantic input;
- YAML anchors/aliases/merge keys are not part of canonical authoring architecture;
- map order has no semantic meaning;
- ordered content uses arrays/sequences;
- missing field is different from explicit `null`.

## 7.5 Strict fields

Unknown fields are errors unless they are explicitly under a namespaced extension container. Typos must not silently alter behavior.

Example diagnostic intent:

```text
OMEGA-SCHEMA-0042
Path: /spec/presentation/profil
Unknown field "profil".
Did you mean "profile"?
```

## 7.6 Extensions

Core unknown properties are rejected. Future extensions are contained under explicit namespaces rather than arbitrary extra keys throughout the contract.

## 7.7 No general templating language

V3 core does not introduce general loops, conditions, arbitrary functions, or Jinja-like interpolation inside Raw Spec. Reuse is handled through definitions, references, imports, and later typed parameter capabilities if proven necessary.

---

# 8. Raw Spec kinds

## 8.1 `artifact`

Represents a single authored artifact such as a report, audit, brief, ledger, proposal, technical document, or context document.

## 8.2 `site`

Represents a static multi-page OMEGA site with information architecture, routes, shared shell, navigation, page contracts, metadata, and site-level QA.

## 8.3 `fragment`

Represents reusable semantic definitions, content, assets, or source declarations intended for explicit import and reference. A fragment is not independently promoted as a final artifact unless a separate target explicitly wraps it.

---

# 9. Canonical Contract and compiler front-end

## 9.1 Three independent versions

OMEGA tracks three separate version families:

```text
Raw Spec Schema Version
Canonical Contract Version
Engine Version
```

Example:

```text
Raw Schema 3.2
    ↓
Canonical Contract 1.0
    ↓
Engine 3.8.1
```

This lets authoring syntax evolve without forcing internal engine ABI churn.

## 9.2 Canonical Contract as engine ABI

Downstream systems do not parse `.omega.yaml` directly. The canonical contract is the machine contract consumed by semantic, evidence, planning, and rendering subsystems.

## 9.3 One authoritative normalizer

V3 core has one authoritative spec compiler/normalizer implementation. The current stack recommendation assigns this responsibility to TypeScript.

Python receives canonical contracts; it does not duplicate Raw YAML normalization rules.

Any future second implementation must pass the normalization conformance corpus against exact expected canonical semantics, hashes, and diagnostic codes.

## 9.4 Immutable staged compiler

Normalization is not a mutable mega-function. Each compiler stage has defined input/output and does not mutate previous stages.

## 9.5 Allowed normalization work

The compiler may:

- parse syntax;
- validate raw structure;
- resolve imports/resources;
- expand shorthand;
- apply documented defaults;
- normalize approved scalar/text forms;
- derive deterministic direction from explicit language;
- parse approved Markdown into structured text;
- bind typed references;
- generate convenience IDs where allowed;
- compile presentation requirement/preference syntax.

It may not:

- infer truth from prose;
- invent evidence;
- classify arbitrary prose using an LLM;
- choose final representation;
- choose rhythm;
- write new narrative;
- decide acceptance;
- perform hidden network operations.

## 9.6 Canonical payload restrictions

Canonical contracts must not contain:

- unresolved imports;
- YAML aliases;
- authoring shorthand;
- host-specific filesystem paths;
- random UUIDs;
- build timestamps;
- selected representations;
- final renderer state;
- source formatting/comments.

Source mapping and resolution details are sidecars.

---

# 10. Canonical serialization, text, numbers, and hashing

## 10.1 I-JSON-compatible model

Canonical payloads remain interoperable JSON. NaN and infinities are rejected.

## 10.2 Exact numbers

Numbers that cannot be represented safely as normal JSON numbers must use typed exact representations, especially:

- very large integers;
- exact financial decimals;
- source lexemes requiring exact preservation.

Semantic numeric value and source lexeme are separate when both matter.

## 10.3 Identifiers

OMEGA internal/public IDs use a constrained ASCII grammar and are case-sensitive. Human display text remains Unicode.

Recommended identifier character set:

```text
A-Z a-z 0-9 . _ -
```

`/` is reserved for namespace/reference structure.

## 10.4 Unicode

Normal human-authored text may be normalized to NFC. Protected/exact lexemes, cryptographic data, and opaque external identifiers are preserved exactly unless their own contract says otherwise.

## 10.5 Canonical serialization

After OMEGA semantic/text normalization, canonical JSON serialization uses a deterministic JSON canonicalization scheme. The canonical semantic hash is computed from the canonical serialization, not from raw YAML formatting.

## 10.6 Identity hashes

OMEGA distinguishes at least:

```text
RAW SOURCE HASH
NORMALIZED SPEC HASH
BUILD INPUT FINGERPRINT
ARTIFACT HASH
```

These answer different questions and must not be conflated.

---

# 11. Source map and resolution sidecars

## 11.1 Source map

Source maps connect semantic/canonical JSON Pointer locations to authoring locations:

```text
module
line
column
span
```

They enable Studio and CLI diagnostics without polluting semantic hashes.

## 11.2 Resolution manifest

Physical resource resolution details are recorded separately, potentially including:

```text
logical resource ID
original locator
resolved path/URI
digest
media type
module
```

Sensitive host paths are internal and do not leak into public artifacts by default.

---

# 12. Artifact schema and section model

## 12.1 Artifact envelope

Architectural shape:

```yaml
spec:
  assurance: auto
  target: ...
  document: ...
  presentation: ...
  assets: ...
  evidence: ...
  defs: ...
  sections: ...
```

Not all fields are mandatory in lightweight artifacts.

## 12.2 Metadata versus document

`metadata` identifies the OMEGA resource and is not necessarily reader-facing.

`document` contains reader-facing semantics such as title, subtitle, language, audience, or artifact intent.

## 12.3 Section contract

A section is a semantic document hierarchy node, conceptually:

```yaml
- id: architecture
  intent: architecture
  title: "البنية الحالية"
  body: |
    ...
  claims:
    - CLAIM.ARCH.001
  content:
    - kind: graph
      ...
  presentation:
    representation: auto
  sections:
    ...
```

## 12.4 Section versus block

A **Section** creates document hierarchy. A **Content Block** creates ordered content flow inside a section.

OMEGA does not model `heading-2` blocks to create hierarchy and does not create semantic sections merely to obtain visual card wrappers.

## 12.5 `body` shorthand

`body` is authoring convenience only. It normalizes into a prose block and has no special renderer downstream.

## 12.6 Heading hierarchy

Authors do not manually encode `h2`, `h3`, etc. Heading levels derive from semantic document hierarchy. A title may be visually hidden while remaining semantically present.

---

# 13. Semantic intent versus content kind

This is a core separation.

```text
SECTION INTENT
= Why does this section exist?

CONTENT KIND
= What structured data/content exists?

REPRESENTATION
= How should this meaning be communicated?
```

Fifty semantic intents do not require fifty distinct data schemas.

The architecture uses reusable typed content shapes plus a broad semantic intent taxonomy.

---

# 14. Semantic intent taxonomy direction

The registry is designed to support a large, extensible vocabulary. Major semantic families include:

- Decision & Judgment;
- Evidence & Epistemics;
- Comparison & Difference;
- Metrics & Performance;
- Time & Evolution;
- Process & Workflow;
- Systems & Architecture;
- Hierarchy & Classification;
- Relationship & Network;
- Flow & Transfer;
- Risk & Failure;
- Planning & Delivery;
- People & Responsibility;
- Commercial & Financial;
- Distribution & Statistical Shape;
- Correlation & Multivariate;
- Composition & Part-to-whole;
- Spatial & Geographic;
- Narrative & Editorial;
- Technical & Engineering;
- Knowledge & Reference;
- Media & Visual Proof;
- Status & State;
- Requirements & Compliance.

The registry should grow by meaning, not by visual variation.

---

# 15. Canonical content kinds

The initial content registry should provide approximately 25–30 strong reusable semantic shapes rather than one schema per visual intent.

Core direction includes:

```text
prose
quote
statement
definition-set
fact-set
record-list
checklist
metric-set
dataset
matrix
tabular (escape hatch only)
timeline
sequence
phase-set
comparison
option-set
graph
hierarchy
process
risk-set
requirement-set
responsibility-set
code
diff
log
media
gallery
geo
```

Domain-specific kinds are preferred over generic tables when domain meaning exists.

Example:

```text
risk data          → risk-set
requirements       → requirement-set
metrics            → metric-set
options            → option-set
```

A tabular renderer may still be selected later.

---

# 16. Structured prose and rich text

Human authoring may use a pinned Markdown dialect for prose convenience. Downstream planner/renderer layers do not parse Markdown directly.

```text
Markdown source
   ↓
Normalizer
   ↓
Structured Rich Text AST
   ↓
Renderer
```

Raw HTML is disabled by default. Structured media, diagrams, metrics, tables, and other complex data use typed content blocks rather than embedded HTML.

The recommended base dialect is pinned CommonMark semantics, versioned as part of compiler behavior.

---

# 17. Content shape analyzer

The Content Shape Analyzer derives generated characteristics from normalized content, for example:

```text
graph:
- node count
- edge count
- groups
- cycles
- hierarchy properties

 timeline:
- item count
- durations present?
- chronological density
- label length

 dataset:
- field types
- series count
- sparsity
```

Authors do not manually supply generated shape scores. Shape analysis feeds representation eligibility and scoring.

---

# 18. Evidence, claims, provenance, and traceability

## 18.1 Evidence is a role

Evidence is not a generic blob copied into a separate object. Something becomes evidence through its relationship to a claim.

## 18.2 Canonical evidence chain

```text
SOURCE
  ↓
SNAPSHOT
  ↓
OBSERVATION
  ↓
CLAIM
  ↓
INTERPRETATION
  ↓
DECISION
```

`AGENT` and `ACTIVITY` describe who/what produced, captured, transformed, or approved relevant entities.

## 18.3 Source versus snapshot

A source locator identifies an ongoing source. A snapshot is a captured immutable state of that source at a point or revision and may have a cryptographic digest.

## 18.4 Observation

An observation records what was actually seen/measured/extracted. It must not silently embed interpretation.

## 18.5 Claim

A claim is a proposition under evaluation. Its existence does not make it true.

## 18.6 Interpretation

Interpretation combines claims/evidence into a conclusion. It stores explicit inputs, method/rule identity, concise rationale, and conclusion, but not private chain-of-thought transcripts.

## 18.7 Decision

Decisions are separate from interpretations. Decision states include concepts such as proposed, approved, rejected, deferred, and superseded.

Human approval authority cannot be fabricated by an agent.

---

# 19. Evidence relation model

Support is modeled through explicit relations rather than loose source arrays in the canonical model.

Initial semantic relation families include:

```text
supports
contradicts
qualifies
contextualizes
corroborates
refines
supersedes
depends-on
```

Provenance graph relationships are distinct from claim-support relationships.

```text
Claim Graph:
supports / contradicts / refines / depends-on / supersedes

Provenance Graph:
generated-by / derived-from / used / attributed-to / captured-from
```

The graphs may intersect but are not semantically interchangeable.

---

# 20. Evidence state axes

OMEGA avoids overloading one “epistemic state” field. Relevant axes are separated:

### Origin

```text
supplied
observed
extracted
derived
imported
```

### Support state

```text
unassessed
unsupported
supported
corroborated
contradicted
inconclusive
```

### Resolution state

```text
open
partial
resolved
blocked
superseded
withdrawn
```

### Materiality

```text
material
supporting
contextual
```

### Risk

Risk is independent from certainty/support.

Generic LLM numeric confidence without a defined method is rejected. Numeric confidence is allowed only when grounded in a real confidence methodology.

---

# 21. Assurance modes

Evidence architecture is adaptive rather than mandatory for every artifact.

```text
basic
traceable
evidence
auto
```

### Basic

Structure/content validation without a required evidence graph.

### Traceable

Stable IDs and resolvable trace links are required where explicit claims exist.

### Evidence

Material claims receive stronger requirements appropriate to modality, including source/snapshot identity where obtainable, observations/locators where appropriate, support relations, freshness checks, contradiction handling, and provenance validation.

### Auto

Artifact intent/content can deterministically escalate assurance needs according to policy.

Evidence validation verifies integrity and traceability properties; it does not claim metaphysical truth.

---

# 22. Freshness, contradiction, and supersession

Freshness is contextual. A source’s age alone is not the freshness result.

Contracts may express claim/use freshness requirements such as maximum age or relevant validity period. Freshness results are generated:

```text
fresh
aging
stale
unknown
```

Contradictory claims are preserved and explicitly linked. OMEGA must not silently pick one unless a later interpretation/decision resolves the conflict under explicit rules.

Temporal and contextual scope prevent false contradiction detection across different times, branches, environments, regions, or populations.

Superseded claims remain historically traceable.

---

# 23. Protected values and exact lexemes

OMEGA supports values/tokens that must survive authoring and rendering exactly, such as identifiers, paths shown as evidence, exact versions, or contract language.

Protected value policies may include:

```text
exact-token
case-sensitive
preserve-whitespace
identifier
```

Semantic structured value and exact source lexeme are separate when both are needed.

---

# 24. Resources, assets, sources, and imports

## 24.1 Shared Resource Core + typed roles

Asset, Source, and Import share low-level resource-resolution infrastructure but remain distinct semantic roles.

```text
              RESOURCE CORE
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
        Asset     Source     Import
```

Definitions and references are not resources.

## 24.2 Asset

A resource used for presentation/packaging, such as image, audio, video, font, document, or data payload.

## 24.3 Source

A resource/authority used in evidence/provenance.

## 24.4 Import

An OMEGA module loaded to provide reusable definitions, assets, sources, or content.

The same bytes may play both asset and source roles, but the roles retain separate semantic identities.

---

# 25. Resource identity and portability

Logical identity is separate from physical location.

```text
asset id: omega-logo
physical locator: ./assets/omega.svg
```

Host paths are not semantic IDs.

Relative paths resolve against the declaring module, not process current working directory.

Absolute host paths are denied by default for portable authoring. Workspace escape attempts are rejected after realpath/symlink resolution.

Host filesystem paths do not leak into public output by default.

---

# 26. Imports, namespaces, and definitions

## 26.1 Explicit namespaces

Imports require explicit aliases/namespaces:

```yaml
imports:
  - as: common
    from: ./shared/common.omega.yaml
```

Cross-module reference:

```text
common/release-summary
```

No global search or implicit merging is allowed.

## 26.2 Import graph

Imports form a directed acyclic graph. Import cycles are errors.

Each module resolves its own relative paths using its own module base.

## 26.3 Definitions and exports

Fragments may define reusable semantic values and explicitly export public definitions. Private definitions remain module implementation details.

## 26.4 Definition versus instance

A reusable definition identity is not the same as the identity of each instantiated section/block.

`use` means exact semantic instantiation, not magical inheritance/merge. General override/inheritance syntax is not part of V3 core.

---

# 27. Typed references

References are typed by context rather than using one generic `ref` string for everything.

Examples:

```text
AssetRef
SourceRef
ClaimRef
DefinitionRef
PageRef
SectionRef
```

Human syntax remains concise; canonical contracts resolve references into explicit typed identities.

Namespace separator is reserved and local IDs do not contain it.

---

# 28. Remote resources, locking, and hermetic direction

Network is denied by default for standalone release builds.

Remote presentation dependencies/imports must be content-pinned for reproducible release workflows.

OMEGA distinguishes:

```text
Evidence Snapshot
≠
Dependency/Resource Lock
```

A generated lock file may record requested/resolved resources, digest, size, and media type. Lock state is generated execution state, not hand-authored truth.

Preferred release flow:

```text
ACQUIRE
  ↓
RESOLVE / LOCK
  ↓
LOCAL CONTENT STORE
  ↓
NETWORK-OFF BUILD
```

Renderer stages do not perform opportunistic HTTP requests.

---

# 29. Asset architecture

## 29.1 Core asset kinds

Initial direction:

```text
image
audio
video
font
document
data
```

Generic user-provided HTML/CSS/JavaScript are not core assets. Presentation code enters through registered renderer/plugin contracts.

## 29.2 Accessibility semantics at use site

Alt text/decorative intent belongs to the content usage context, not globally to the binary asset, because the same image may be informative in one context and decorative in another.

## 29.3 Original versus derived resource

Optimized/resized/transcoded outputs are new derived resources with their own digest, dimensions/media metadata, and transform provenance.

## 29.4 SVG

Untrusted SVG is validated/sanitized. Arbitrary SVG is not blindly injected into DOM as trusted active markup.

## 29.5 Fonts

Custom font embedding must respect known embedding/license metadata. If embedding is unavailable or not permitted, controlled fallback stacks preserve usable output.

## 29.6 Standalone packaging

A target claiming standalone/offline integrity must package required presentation resources into the artifact. Large resource budgets may require explicit policy or a different target.

---

# 30. Presentation Policy Contract

OMEGA distinguishes:

```text
TARGET CONTRACT
AUTHOR REQUIREMENTS
AUTHOR PREFERENCES
PROFILE POLICY
RUNTIME ENVIRONMENT
SYSTEM INVARIANTS
```

Hard constraints filter feasible candidates; preferences score survivors.

Conceptually:

```text
Feasible Set
=
System Invariants
∩ Target Constraints
∩ Author Requirements
∩ Capability Constraints
```

Preferences are applied only after feasibility is established.

---

# 31. Presentation authoring syntax

Canonical user control vocabulary:

```text
AUTO
PREFER
REQUIRE
LIMIT
```

Example:

```yaml
presentation:
  profile: prime

  prefer:
    page_mode: technical-atlas
    density: balanced
    hero: signature-particle

  limits:
    motion: ambient
    interaction: inspect
```

Section example:

```yaml
presentation:
  prefer:
    representation: architecture.layered-system-map
```

An explicit shorthand representation may normalize into a hard requirement where documented.

---

# 32. Presentation settings intentionally excluded from Raw Spec

Raw Spec must not become CSS configuration.

Authors do not directly set:

```text
raw colors
shadow blur
border radius
grid column count
breakpoint pixels
CSS classes
Astro/React component names
D3/Canvas implementation choice
animation CSS durations
internal planner weights
```

These belong to profiles, treatment policy, representation contracts, or renderer implementation.

---

# 33. Target versus environment

```text
TARGET
= What is being built?

RUNTIME / USER ENVIRONMENT
= Where/how is the output currently consumed?

BUILD ENVIRONMENT
= What defined software/tool environment produced it?
```

These are separate concepts.

Actual viewport size, pointer type, current contrast preference, or browser state are not authored artifact truth.

Preview environments live in Studio/QA execution settings rather than Raw Spec.

---

# 34. Responsive and accessibility environment adaptation

Prefer CSS/browser-native adaptation for browser-known conditions:

```text
@media
@container
print
prefers-reduced-motion
prefers-contrast
forced-colors
```

Responsive design is based on available space and content characteristics rather than device labels.

Author motion/interaction settings are ceilings, not quotas.

Environment adaptation may alter layout, interaction, representation variant, or treatment, but must not silently remove essential meaning.

Forced-colors is an environment adaptation, not a fifth OMEGA profile.

Print is an adaptation/surface mode, not an OMEGA profile.

---

# 35. Motion and interaction policy

Motion grammar levels:

```text
none
feedback
transition
reveal
narrative
ambient
```

An author/profile can set a maximum allowance; the planner may choose less.

Reduced-motion produces monotonic reduction and appropriate static/manual equivalents.

Interaction similarly uses a capability ceiling such as:

```text
none
reveal
select
inspect
filter
navigate
manipulate
```

Essential data must never require hover-only discovery.

---

# 36. Representation taxonomy and registry

The representation system is intentionally much larger than V2.

Representative families include:

- editorial/document;
- decision;
- evidence;
- time;
- systems/architecture;
- process/workflow;
- quantitative/data;
- hierarchy;
- relationship/network;
- risk/failure;
- commercial/financial;
- technical;
- people/ownership;
- narrative/editorial;
- media/visual proof;
- compound compositions.

One intent can have many representations.

Example timeline candidates:

```text
horizontal-milestones
vertical-spine
alternating-storyline
phase-bands
roadmap-lanes
release-train
radial-cycle
stepped-path
scroll-chapters
compact-ledger-timeline
```

Architecture candidates may include:

```text
layer-stack
node-graph
dependency-tree
system-boundaries
swimlane
data-flow
sequence-map
topology
nested-domains
hub-and-spoke
```

Variety is enabled through registry breadth, not arbitrary decorative randomness.

---

# 37. Representation Registry contract

A representation entry must describe, at minimum:

```text
stable capability ID
version / stability
target semantic intents
required/optional content kinds
content-shape constraints
character vector
complexity cost
attention cost
interaction cost
responsive variants
print/no-JS/reduced-motion fallbacks
accessibility contract
renderer binding
stress fixtures
QA/conformance metadata
```

Representations are not UI component filenames.

---

# 38. Representation Selection Engine

Selection is deterministic by default.

Conceptual flow:

```text
Intent
+
Content Shape
+
Target
+
Hard Requirements
+
Capability Snapshot
        ↓
Eligibility Filter
        ↓
Candidate Set
        ↓
Soft Scoring
        ↓
Global Rhythm / Document Fit
        ↓
Tie-Breaking
        ↓
Representation Decision
```

Candidate elimination reasons and selected score components are receipted.

Optional agent influence may propose preferences or rankings, but final rendering remains constrained by registered capabilities and hard rules.

---

# 39. Selection scoring dimensions

The exact numeric weights are policy implementation details, but the architecture considers dimensions such as:

```text
semantic fit
content-shape fit
reader fit
profile affinity
target/medium fit
density fit
accessibility capability
fallback quality
complexity cost
attention cost
interaction cost
document-level repetition
rhythm benefit
```

Local best is not automatically global best.

---

# 40. Compound representations

OMEGA may match meaningful patterns across multiple content blocks.

Example incident section:

```text
timeline (primary)
+
graph (evidence)
+
risk-set (action)
```

A compound representation can consume the pattern as a coherent composition without forcing the source model to become a special monolithic “incident card.”

---

# 41. Rhythm and composition architecture

OMEGA prevents visual monoculture through explicit page/document rhythm planning.

It reasons at three scales:

```text
MACRO
whole-document/page acts and density wave

MESO
adjacent section transitions and repetition

MICRO
internal spacing/structure inside representation
```

The rhythm engine considers enclosure, density, dominance, elevation, interaction, motion, visual family, copy length, and previous/next sections.

It is not allowed to change semantic meaning merely for variety.

---

# 42. Section Character Vector

Each planned section/representation may be described using generated character dimensions such as:

```text
enclosure
width
visual mass
density
dominance
elevation
interaction
motion
narrative openness
technicality
```

The character vector supports anti-repetition and transition scoring.

---

# 43. Document/page composition concepts

OMEGA supports page composition modes such as:

```text
executive brief
technical atlas
evidence room
narrative chapter
operational ledger
showcase / high-expression
```

These are composition grammars, not hard templates.

Documents/pages can be modeled as acts to ensure progression rather than repeated section cards.

---

# 44. Rhythm budgets

OMEGA uses quality budgets rather than rigid quotas:

```text
complexity budget
attention budget
interaction budget
elevation budget
dominance budget
motion budget
```

Budgets prevent a page where every section is “special.”

---

# 45. Profiles and design identity

OMEGA presentation profiles are not simple color skins. They are presentation personalities over the same capability/representation system.

## 45.1 Ω Prime — default

Default strongest OMEGA identity. Dark layered navy system with Cyan + Electric Blue + Founder Sand brand blend. High expressive capacity without turning into generic neon sci-fi.

## 45.2 Ω Silver

Dense evidence/context/ledger mode. Strong for internal truth, traceability, detailed records, audit, and evidence-room surfaces.

## 45.3 Ω Gold

High-level executive/board/external mode. Elegant, restrained, authoritative.

## 45.4 Ω Cyan

Operational, technical, system explanation, demo, and technical-sharing mode.

Profiles share OMEGA design DNA and capability system. They are not four independent applications.

---

# 46. Canonical OMEGA Prime token foundation

Approved core token direction:

```css
--bg:#0f151d;
--bg-deep:#0b1118;
--surface:#151d27;
--surface-2:#1b222b;
--surface-3:#212f3f;
--line:#283a48;
--line-soft:#223543;
--text:#eef6fb;
--muted:#8da7b5;
--dim:#64818d;
--cyan:#29e3e8;
--blue:#66a6ff;
--sand:#cab28a;
--green:#45caa0;
--warn:#d9bd74;
--danger:#d97868;
--brand:linear-gradient(135deg,#29e3e8 0%,#66a6ff 56%,#cab28a 100%);
--brand-soft:linear-gradient(135deg,rgba(41,227,232,.13),rgba(102,166,255,.08) 56%,rgba(202,178,138,.15));
--brand-field:radial-gradient(80% 120% at 0% 0%,rgba(41,227,232,.13),transparent 55%),radial-gradient(75% 120% at 100% 0%,rgba(202,178,138,.11),transparent 60%);
--r-xl:28px;
--r-lg:22px;
--r-md:16px;
--r-sm:12px;
--sans:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI","Noto Sans Arabic",Arial,sans-serif;
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
```

These values belong to the design/token system, not authoring Raw Spec.

---

# 47. Founder Sand rule

Founder Sand `#CAB28A` is part of the brand blend/aura/warmth field.

It must not be used as a standalone status semantic such as warning, owner, human state, risk level, or success/failure state simply because it is visually warm.

Allowed examples:

```text
brand gradient stop
ambient brand aura
particle blend
subtle profile warmth
```

Disallowed pattern:

```text
status = sand
warning = sand
human = sand
```

Semantic states use semantic tokens.

---

# 48. Treatment architecture

Presentation is decomposed into:

```text
CONTENT / SEMANTIC INTENT
        ↓
REPRESENTATION
        ↓
VISUAL TREATMENT
```

Treatments include concepts such as:

```text
elevation
surface
edge
shadow
glow
gradient
blur
mask
clip
texture
depth
emphasis
motion
typography
```

A `box-shadow` is not a section type. A card is not a semantic content kind.

---

# 49. Elevation grammar

Canonical depth concepts:

```text
depth-0     flat document field
depth-1     subtle separation
depth-2     raised functional surface
depth-3     important/selected object
depth-4     hero/floating layer
depth-inner inset operational surface
depth-glow  brand energy only
```

Each profile may express depth differently. Depth is not synonymous with shadow strength.

---

# 50. Token layering and profile purity

Visual values resolve through layered token systems rather than component hardcoding.

Conceptually:

```text
Foundation Tokens
      ↓
Semantic Tokens
      ↓
Profile Tokens
      ↓
Representation Treatment Tokens
      ↓
Environment Overlay
      ↓
Resolved Render Tokens
```

Representations do not hard-code profile colors or shadows.

Profile purity QA detects cross-profile values, illegal token use, isolated Founder Sand semantics, and other canon violations.

---

# 51. Ω Signature Particle Hero v1

The approved signature hero is a reusable capability, not a full-profile transformer.

Identity:

```text
Display name: Ω Signature Particle Hero v1
Machine ID direction: omega-signature-particle-hero-v1
```

Core contract:

- hero-only responsibility;
- no mutation of unrelated tables/sections;
- three default scenes maximum: Ω, sphere, helix/wave;
- chapter labels derive from authored semantic material, never invented facts;
- default cycle around 8.5s when motion is allowed;
- pointer interaction for suitable non-touch contexts;
- pause/resume control;
- animation suspends offscreen/hidden;
- reduced-motion uses a static/manual form;
- canvas is `aria-hidden` and essential content is available without it;
- print hides motion/canvas controls while preserving title/summary;
- Founder Sand only participates in blend/brand particles, not status;
- static/compact fallback required;
- RTL/LTR/mobile/no-overflow QA required.

The component is “earned,” not automatically placed on every page or site surface.

---

# 52. Component and representation hierarchy

OMEGA uses distinct implementation layers:

```text
Primitive
Component
Representation
Compound Representation
Section Adapter
Artifact / Page Composer
Target Packager
```

### Primitive

Low-level semantic/presentation building element.

### Component

Reusable interface/presentation unit with bounded responsibility.

### Representation

A concrete way to communicate a semantic content pattern.

### Compound Representation

A representation coordinating multiple content blocks.

### Section Adapter

Bridges a semantic section plan into representation-specific render input.

### Composer

Coordinates document/page output, shared shell, and target-level assembly.

---

# 53. Renderer technology roles

## TypeScript

Primary presentation/contracts/planning language.

## Astro

Static-first document/site composition shell and build-time HTML publisher.

## React

Used selectively for interactive islands where its ecosystem/state model materially helps. It is not the default wrapper around every static component.

## SVG

Primary vector/diagram medium for static/scalable structured visuals.

## D3

Used for bespoke data-to-SVG/data-visualization logic where simpler primitives are insufficient.

## Canvas

Used for cases such as particle/continuous visual systems where DOM/SVG is not the best model.

## React Flow

Optional specialized capability for complex node/edge interactive inspectors, not a default architecture renderer.

## Mermaid

Fallback/text-driven diagram capability, not the canonical Prime visual renderer.

## Python

Semantic/truth/evidence domain, analysis, and appropriate validation logic.

## Rust / Go / Java / PHP

Not part of the baseline V3 architecture without a measured future need. “More languages” is not considered architectural strength.

---

# 54. Rendering contract and Render Spec

Raw authoring must never expose implementation component names.

The planning pipeline produces a Render Spec that contains the resolved representation/treatment/environment requirements needed by renderers.

Renderer inputs are typed and bounded. Renderer outputs declare:

```text
render fragment
runtime dependencies
asset dependencies
fallbacks
diagnostics
cost metadata where applicable
```

Renderer code must not perform hidden acquisition/network work.

---

# 55. Progressive enhancement

Core semantic information must remain available without JavaScript where target requirements demand it.

Interactive implementations must define no-JS/static fallbacks when they carry essential content.

JavaScript permission means “allowed if needed,” not “must be used.”

A target may explicitly deny client JavaScript, which filters representation/implementation choices.

---

# 56. Representation Lab

OMEGA requires a local Representation Lab for development and verification. It is not the normal authoring surface.

The Lab should allow systematic variation across:

```text
profile
LTR / RTL
short / normal / stress content
wide / narrow / reflow
screen / print
normal / reduced motion
normal / forced colors
JS on / off
interaction modes
```

Stable representations require conformance evidence across their declared capability envelope.

---

# 57. Engine API architecture

The CLI is a client of the Engine, not the Engine itself.

```text
                Ω ENGINE API
          ┌────────┼────────┐
          ▼        ▼        ▼
      Direct TS   OEP      CLI
      Consumer  Adapter  Adapter
```

V3 does not require a permanent daemon.

Local Studio/agent inter-process use should employ a versioned protocol over a simple local transport such as stdio.

---

# 58. Ω Engine Protocol (OEP)

OEP is the versioned local machine protocol between Engine and external clients.

Conceptual methods:

```text
omega.initialize
omega.validate
omega.plan
omega.build
omega.inspect
omega.explain
omega.capabilities
omega.migrate
omega.cancel
omega.shutdown
```

The protocol version is independent from Engine, Raw Schema, and Canonical Contract versions.

Human CLI text is presentation. Machine clients consume structured protocol/events rather than scraping terminal strings.

---

# 59. Engine operations

## Validate

Compile and validate through capability preflight without producing final render/package output.

## Plan

Produce semantic/presentation build plan before rendering. Plans may be saved and later checked for staleness.

## Build

Validate, plan, render, package, verify, evaluate quality/regression/acceptance, and promote when allowed.

## Inspect

Expose structured state such as canonical contract, module DAG, resource graph, capability snapshot, artifact hashes, and stage status.

## Explain

Explain structured decision receipts such as why a representation was selected or rejected. This is not hidden chain-of-thought.

## Migrate

Produce a new authoring source/version rather than silently rewriting source during normal build.

## Capabilities

Expose the registered targets, profiles, content kinds, intents, representations, renderers, plugins, QA rules, and stability metadata.

---

# 60. Build Request versus Artifact Contract

Artifact Raw Spec says **what** the artifact should be.

Build Request says **how this execution attempt should run**.

Execution settings may include axes such as:

```text
quality: fast | release
diagnostics: normal | full
cache: use | refresh | off
lock: frozen | update
watch: true | false
output directory
```

These do not belong in portable artifact semantics.

---

# 61. Build lifecycle

Canonical build lifecycle:

```text
ACCEPT
  ↓
PREFLIGHT
  ↓
COMPILE
  ↓
SEMANTIC
  ↓
PLAN
  ↓
RENDER
  ↓
PACKAGE
  ↓
VERIFY
  ↓
QUALITY
  ↓
REGRESSION
  ↓
ACCEPTANCE
  ↓
COMMIT
  ↓
RECEIPT
```

Candidate output is built in a workspace. Final output paths are atomically promoted only after required acceptance conditions pass.

A failed/cancelled build must not corrupt the previous successful artifact.

---

# 62. Build events and observability

Long-running operations emit a versioned structured event stream.

Event classes include:

```text
engine.ready
build.started
stage.started
stage.progress
stage.completed
diagnostic.emitted
cache.hit
cache.miss
artifact.produced
qa.completed
build.completed
build.failed
build.cancelled
```

Build session IDs are ephemeral correlation identities. Build fingerprints and artifact hashes are deterministic identities.

External telemetry adapters may map OMEGA events/spans into systems such as OpenTelemetry, but OMEGA does not require OTel to function.

---

# 63. Cancellation

Cancellation is first-class:

```text
request cancellation
→ stop scheduling new work
→ signal cancellable current work
→ terminate child processes after grace period if needed
→ discard uncommitted outputs
→ emit cancelled result
```

Cancellation is not a generic internal failure.

---

# 64. Build actions and caching

OMEGA may model coarse build actions with declared inputs, versioned implementation, outputs, and cacheability.

Initial caching should remain coarse enough to be maintainable:

```text
canonical contract cache
semantic analysis cache
planning cache
render cache
asset transform cache
eligible QA cache
```

Architecture supports later per-section/per-representation incremental builds if profiling justifies them.

Cache hits must never change correctness. Cache-on and cache-off builds for the same deterministic inputs must remain semantically equivalent.

---

# 65. Capability snapshot

At build start, OMEGA resolves and freezes an immutable capability snapshot containing relevant:

```text
semantic intents
content kinds
representations
profiles
targets
renderers
plugins
QA rules
policy versions
```

Registry changes during a build do not mutate the current build.

---

# 66. QA architecture — two planes

OMEGA separates:

```text
ENGINE QA
≠
GENERATED ARTIFACT QA
```

Engine QA validates compiler/planner/renderer/system behavior.

Artifact QA validates the specific produced output.

A passing engine test suite does not prove every artifact is good, and a good-looking artifact does not prove engine correctness.

---

# 67. QA stages

Artifact acceptance is deliberately separated into:

```text
VERIFICATION
QUALITY EVALUATION
REGRESSION DETECTION
RELEASE ACCEPTANCE
```

“Tests passed” does not automatically equal “artifact accepted.”

---

# 68. QA result states

Rules support outcomes including:

```text
PASS
FAIL
NOT_APPLICABLE
NEEDS_REVIEW
```

Execution infrastructure may additionally report `ERROR` or `SKIPPED`, but those are not substitutes for applicability/result semantics.

Automated accessibility success does not claim full WCAG conformance.

---

# 69. Artifact QA families

Core QA families include:

```text
Contract
Semantic
Evidence
Structural Web
Representation Fit
Document Quality / Rhythm
Profile Purity
Accessibility
Responsive / Environment
Runtime / Performance
Packaging / Offline
Visual Regression
Cross-Browser
Determinism / Reproducibility
Release Acceptance
```

Each rule declares applicability, procedure, expected outcomes, automation level, severity/blocking policy, and evidence produced.

---

# 70. Accessibility QA

The release direction is WCAG 2.2 AA-oriented, but OMEGA does not make a full conformance claim merely because automated tools pass.

Accessibility testing is layered:

```text
static contract checks
browser automated checks
interaction/keyboard checks
manual/review-required checks
```

Complex graphs, alt-text quality, reading order, screen-reader journeys, and other areas may require human review.

---

# 71. Responsive/environment QA

Testing is capability-driven rather than a brute-force cross product.

Relevant axes include:

```text
LTR / RTL
wide / medium / narrow / 320px reflow
screen / print
normal / reduced motion
normal / increased contrast / forced colors
fine pointer / coarse pointer
hover / no hover
JavaScript on / off
```

The QA Planner selects the required matrix from target, render spec, assurance, and capability risks.

---

# 72. Performance QA

Standalone artifact performance and hosted site performance are different domains.

Standalone artifacts emphasize controllable budgets such as:

```text
final file size
embedded assets
runtime JavaScript bytes
hydrated island count
DOM complexity
startup work
long tasks
canvas load
layout stability
```

Hosted sites may additionally adopt field/web metrics and network budgets.

Performance budgets are policies, not arbitrary Raw Spec tuning knobs.

---

# 73. Offline integrity

For standalone offline-required artifacts, browser verification should run with network blocked and verify:

```text
no unexpected external requests
required assets available
essential content available without JS where promised
no host-path leakage
resource integrity valid
```

Static grep alone is not sufficient because runtime code could attempt network access after load.

---

# 74. Visual regression

Visual regression detects change; it does not determine aesthetic quality.

Baseline environments are pinned by browser/version/fonts/viewport/DPR/locale/motion state and other relevant factors.

Baseline updates require intentional review rather than blind regeneration.

Animated visual systems use deterministic test modes, fixed seeds/frames, or paused states where needed.

---

# 75. Cross-browser strategy

The default strategy uses tiers:

```text
Canonical deterministic visual baseline: pinned Chromium
Compatibility: Firefox + WebKit/Safari-equivalent
Targeted real-device checks: high-risk/release-critical scenarios
```

Browser support claims are scoped to exact tested environments; untested environments are not implicitly green.

---

# 76. Reproducibility QA

OMEGA distinguishes:

```text
DETERMINISTIC SEMANTICS
DETERMINISTIC PLAN
REPRODUCIBLE ARTIFACT
```

The strongest reproducibility claim requires controlled source, environment, instructions, and bit-for-bit comparison.

Generated timestamps/random data are excluded from semantic artifact bytes unless they are explicitly authored content.

---

# 77. Acceptance, review, and waivers

Acceptance consumes immutable QA evidence and policy; it does not rewrite test results.

Possible acceptance states include:

```text
ACCEPTED
REJECTED
REVIEW_REQUIRED
ACCEPTED_WITH_WAIVERS
```

Manual review is first-class evidence tied to the exact artifact hash.

Waivers are explicit, scoped, attributed, justified, and optionally expiring. Critical non-waivable gates may exist.

A release claim must never be broader than the evidence/QA scope that supports it.

---

# 78. Engine QA

Engine QA layers include:

```text
unit
contract
property
fuzz
normalization conformance
integration
mutation
regression
end-to-end
performance
```

Every important production bug should become a permanent regression fixture where practical.

Mutation testing should focus on critical architectural invariants, not vanity scores. Examples include intentionally disabling evidence freshness, profile firewalls, no-JS fallback requirements, or representation constraints and verifying that the suite detects the mutation.

---

# 79. Studio architecture

OMEGA Studio is a human client of the Engine, not a second hidden engine.

`.omega.yaml` remains the portable authored source of truth.

Studio uses one source document with multiple synchronized projections.

```text
              STUDIO DOCUMENT SESSION
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
     Raw YAML       Structured        Evidence
        │             Editor          Workspace
        └───────────────┼────────────────┘
                        ▼
                    Ω Engine
                        │
             Preview / Explain / QA
```

---

# 80. Studio document state

A document session keeps separate notions of:

```text
working source
last valid raw model
last valid canonical contract
last successful preview
```

Invalid in-progress source is allowed while editing, but stale previews must be visibly marked and may not masquerade as current results.

Preview state concepts include:

```text
CURRENT
BUILDING
STALE
INVALID_SOURCE
FAILED
```

---

# 81. Studio authoring views

Major surfaces include:

```text
Structure
Content
Raw
Preview
Evidence
Assets
Explain
QA / Release
```

These are views of one source/session, not separate documents.

---

# 82. Structured editing

Structured editors generate semantic source mutations, not proprietary database state.

OMEGA separates artifact schemas from **Studio Authoring Descriptors**, which may specify labels, field grouping, help text, preferred input controls, primary/advanced fields, and examples.

Studio metadata may shape UX but must not redefine semantic validation.

---

# 83. Progressive authoring depth

Studio uses progressive disclosure rather than separate incompatible “simple” and “advanced” document formats.

Conceptual authoring depth:

```text
FOCUS
STRUCTURED
ADVANCED
RAW
```

Changing authoring depth does not change artifact semantics.

---

# 84. Direct manipulation boundary

Visual preview may support semantic actions such as:

```text
edit section
reorder section
choose representation alternative
edit media/alt
apply profile preference
```

It does not become a pixel canvas. Authors do not drag elements to arbitrary coordinates, set widths in pixels, paint raw colors, or tune radius/shadows directly.

Human representation control maps to:

```text
AUTO
PREFER THIS
REQUIRE THIS
```

---

# 85. Source-preserving round-trip

Studio should use a source-aware YAML document/CST model so structured edits can patch the authoring source while preserving untouched comments/organization where practical.

The canonical contract is not the editing model.

Studio maintains:

```text
SOURCE MODEL
CANONICAL MODEL
VIEW MODELS
```

with explicit conversion boundaries.

---

# 86. Studio transactions and history

Semantic edits use a unified transaction model across raw and structured surfaces.

Example transaction types:

```text
SetProfile
MoveSection
AddBlock
RequireRepresentation
EditProse
ApproveDecision
```

Undo/redo must not be split into competing stacks for Raw and Structured modes.

External filesystem edits are detected using source revisions/hashes and never silently overwritten when conflicts exist.

Crash recovery is workspace/session state, not artifact truth.

---

# 87. Studio evidence and authority surfaces

Evidence can be inspected through multiple projections over the same evidence model:

```text
Ledger
Graph
Claim Inspector
Contradictions
Freshness
Coverage
```

Human authority actions are explicit. A Founder approval is a real authority event attached to the relevant decision/artifact identity; an agent cannot synthesize it.

---

# 88. Studio preview overrides

Studio may preview temporary environments/profiles such as:

```text
Silver instead of current Prime
320px width
Print
Reduced Motion
Forced Colors
No JavaScript
```

Such overrides are clearly marked as preview-only and do not mutate the source until the user explicitly applies a semantic/presentation change.

---

# 89. Studio/AI boundary

V3 Studio core does not require embedded AI.

Future agent assistance must operate through proposed source transactions/diffs that the user can review and accept. Agent suggestions must not create hidden state or bypass authority gates.

---

# 90. Capability and plugin architecture

The central extensibility law is:

> **Capability is the architectural unit. Plugin is only a provider/package.**

Core and external capabilities live in one capability registry. Built-ins may be statically linked but still expose the same public capability contracts.

---

# 91. Capability classes

Extensible capability classes include:

```text
Semantic Intent
Content Kind
Content Shape Analyzer
Representation
Compound Representation
Renderer
Target Adapter
Asset Processor
Profile
Token Extension
QA Rule
Migration
Studio Authoring Descriptor
```

Not every plugin may modify every class with equal authority.

---

# 92. Plugin manifest and discovery

Capability discovery is declarative and must not require arbitrary plugin code execution.

A plugin manifest declares:

```text
plugin identity/version
engine/SDK compatibility
capabilities contributed
capability versions/stability
permissions
execution mode
determinism class
```

Plugin package version, capability-contract version, and implementation version are distinct concepts.

Third-party capability IDs are globally namespaced. Core capability IDs cannot be monkey-patched or silently overridden.

---

# 93. Plugin authority boundaries

Plugins contribute through typed extension points rather than generic global lifecycle mutation.

Protected core authorities include:

```text
selection policy authority
truth/evidence invariants
human authority gates
brand/semantic firewall
core accessibility invariants
acceptance evaluator invariants
```

A plugin may add QA rules but may not suppress core QA rules.

A representation plugin describes eligibility/cost/fallbacks; it does not arbitrarily set its own planner score.

---

# 94. Capability stability lifecycle

Capabilities have lifecycle states such as:

```text
experimental
preview
stable
deprecated
retired
```

Release AUTO selection uses stable capabilities by default.

Experimental capability use requires explicit build policy/opt-in when relevant.

Deprecated capabilities are not auto-selected but may remain temporarily buildable for compatibility/migration.

---

# 95. Plugin installation and locking

Builds do not install or update plugins automatically.

Plugin environment state is separate from artifact resource lock state.

A plugin lock records exact provider versions/artifacts/digests, compatible SDK data, and exported capability identities.

Build fingerprints incorporate the plugin environment/capability snapshot.

Install scripts and permission escalation require explicit review/approval; updates that request broader permissions cannot silently inherit previous approval.

---

# 96. Plugin execution tiers

Architectural trust tiers:

```text
Tier 0 — Declarative
Tier 1 — Trusted In-Process
Tier 2 — Isolated Process
Tier 3 — Sandboxed Component / future WASM
```

Third-party executable plugins default toward isolated execution, not in-process trust.

V3 primary executable SDK is TypeScript, but capability contracts remain language-independent.

WebAssembly Component Model/WASI is a future strategic isolation backend, not a V3.0 implementation dependency.

---

# 97. Plugin permissions and determinism

Permissions are deny-by-default and least-privilege.

Relevant capability classes include:

```text
filesystem
network
process
environment
clock
randomness
```

Plugins should receive logical declared resources rather than ambient host access where possible.

Release rendering/planning must not rely on uncontrolled network/time/random state.

Determinism classes:

```text
pure
declared-io
nondeterministic
```

Nondeterministic capabilities are excluded from normal release production paths by default.

Seeded randomness may be provided as a deterministic build input when a visual capability genuinely needs randomness.

---

# 98. Ω Plugin Protocol (OPP)

Engine-to-plugin communication is a separate restricted protocol from Engine-to-client OEP.

Plugins receive the minimum typed data needed for their capability. They do not receive arbitrary mutable engine internals or the entire workspace by default.

The SDK exposes DTO/contracts, diagnostics, cancellation, deterministic utilities, and test helpers—not internal planner classes or global service locators.

---

# 99. Plugin QA and supply-chain records

Stable plugins/capabilities require conformance evidence appropriate to their type, including determinism, declared fallback behavior, permissions, stress fixtures, and failure/cancellation behavior.

Build receipts record capabilities/providers actually used.

Architecture is prepared for future package signatures/provenance verification, but cryptographic marketplace-style signing is not a mandatory local V3.0 dependency.

---

# 100. Technology architecture summary

Baseline technology split:

```text
Python
Truth / semantic / evidence domain logic where appropriate
        │
        ▼
Canonical / semantic contracts
        │
        ▼
TypeScript
Spec compiler + presentation planning + registries + engine orchestration
        │
        ▼
Astro
Static document/site composition
        │
        ├── Native Astro components
        ├── React interactive islands
        ├── D3 / SVG / Canvas capabilities
        └── CSS Design System
        │
        ▼
Artifact / Site Packagers
```

No server/backend language is selected merely for theoretical performance. Additional languages require measured benefit.

---

# 101. Recommended repository/package architecture

Conceptual package layout:

```text
omega-html-v3/
├── spec-frontend/           # TypeScript Raw Spec compiler
│   ├── parser/
│   ├── schemas/
│   ├── normalizer/
│   ├── resolver/
│   ├── diagnostics/
│   └── conformance/
│
├── semantic-core/           # Python where appropriate
│   ├── truth/
│   ├── evidence/
│   ├── claims/
│   ├── provenance/
│   └── validation/
│
├── presentation-engine/     # TypeScript
│   ├── policy/
│   ├── shape-analysis/
│   ├── selection/
│   ├── rhythm/
│   ├── treatment/
│   └── receipts/
│
├── capability-registry/
│   ├── intents/
│   ├── content-kinds/
│   ├── representations/
│   ├── renderers/
│   ├── profiles/
│   └── qa-rules/
│
├── design-system/
│   ├── foundations/
│   ├── tokens/
│   ├── primitives/
│   ├── components/
│   └── profiles/
│
├── visual-engines/
│   ├── svg/
│   ├── d3/
│   ├── canvas/
│   ├── particle/
│   └── diagrams/
│
├── composer/
│   ├── astro/
│   ├── artifact/
│   ├── site/
│   ├── islands/
│   └── packaging/
│
├── engine/
│   ├── api/
│   ├── protocol/
│   ├── lifecycle/
│   ├── cache/
│   └── events/
│
├── studio/
│   ├── source-model/
│   ├── transactions/
│   ├── structured-editor/
│   ├── preview/
│   ├── evidence/
│   └── qa/
│
├── plugin-sdk/
│   ├── manifest/
│   ├── contracts/
│   ├── protocol/
│   └── test-harness/
│
├── lab/
│   └── representation-lab/
│
└── qa/
    ├── engine/
    ├── artifact/
    ├── regression/
    ├── visual/
    ├── accessibility/
    └── acceptance/
```

This is a conceptual boundary map, not an implementation task list.

---

# 102. Artifact target architecture

`kind: artifact` produces a single logical document and uses an Artifact Adapter.

Primary target:

```text
standalone-html
```

Baseline standalone contract direction:

```text
single file
semantic HTML
required resources packaged
no external runtime dependency by default
print adaptation
no-JS essential content fallback
portable/offline-capable output
```

Packaging choices are target concerns, not representation concerns.

---

# 103. Site target architecture

`kind: site` is a Site Adapter over the same OMEGA Platform—not a separate website engine.

The site model includes:

```text
Site Contract
Site Information Architecture
Site Shell
Navigation
Logical Pages
Page Variants / Locales
Page Contracts
Publication Context
Site Packager
Page QA
Site QA
```

Each page reuses the same semantic/content/representation/rhythm/treatment engine as artifact documents.

---

# 104. Site graph versus document sequence

A document has a mostly linear reader journey. A site is a graph of possible entries and navigational paths.

Therefore OMEGA uses:

```text
Page Rhythm
+
Site Information Architecture
+
Site Coherence
```

There is no assumption of one canonical cross-page reading order.

---

# 105. Site page identity and routing

Page identity is separate from route.

```text
Page ID: about
Route: /about/
```

Internal links use typed page/section references, not hard-coded routes wherever possible.

Site route policy controls route grammar consistently and validates collisions/broken routes before publication.

Astro’s route filesystem is an implementation detail behind the Site Adapter.

---

# 106. Static MPA first

OMEGA Site v3 is static multi-page by default.

```text
semantic HTML document
→ normal <a> navigation
→ another semantic HTML document
```

Native cross-document view transitions may enhance continuity.

A client-side router is only introduced when a genuine capability requires it; premium appearance alone is not sufficient justification for SPA architecture.

---

# 107. Site shell and page composition

Shared Site Shell includes concepts such as:

```text
skip navigation
site header
primary navigation
utility navigation
page main region
optional breadcrumbs/context
site footer
```

Site Shell is not a page template. Individual page composition remains driven by page meaning and rhythm.

---

# 108. Site identity profile versus page content profile

OMEGA separates:

```text
SITE IDENTITY PROFILE
→ shared shell

PAGE CONTENT PROFILE
→ page main content
```

Default site identity is Prime. Page content inherits by default but may switch to Silver/Gold/Cyan where semantically appropriate.

This allows an Evidence Room to feel Silver while remaining inside a clearly Prime OMEGA site family.

---

# 109. Site navigation and breadcrumbs

Pages are not automatically primary navigation items.

Navigation structures can include:

```text
primary
utility
footer
contextual
breadcrumbs
```

All navigation entries reference logical page identities.

Breadcrumb hierarchy derives from explicit information architecture/relationships rather than blindly splitting URL paths.

---

# 110. Multilingual site model

Architecture supports one logical page with language variants.

```text
Logical Page: about
   ├── en variant
   └── ar variant
```

Variants can carry locale-specific route, title, content, direction, and metadata while retaining shared logical identity.

Language alternates and locale navigation are generated from this relationship.

---

# 111. Publication Context

Portable Site Contract contains routes and site semantics but not necessarily final deployment origin.

Publication Context supplies environment-specific publication data such as:

```text
origin/domain
base path
hosting/deployment properties
```

Canonical URLs are derived from route + publication context for release/public builds.

Local preview origins are not production canonical origins.

---

# 112. Site metadata and SEO boundaries

OMEGA generates/validates structural publication metadata based on known semantics:

```text
document title
description
language
canonical URL
index/noindex policy
sitemap
language alternates
structured data when supported by real semantic facts
```

Structured metadata may encode known facts; it must not invent facts to fill SEO schemas.

Site SEO is structural/semantic, not keyword-stuffing configuration.

---

# 113. Site asset packaging

Unlike standalone HTML, a multi-page site may share hashed assets across pages:

```text
/assets/app.hash.css
/assets/hero.hash.js
/assets/logo.hash.svg
```

Representations continue to declare dependencies; the Site Packager decides shared bundle/code-splitting strategy.

Site architecture does not turn every page into a React application.

---

# 114. Site search and generated page sets

Search is an optional capability driven by site size/purpose, not a mandatory core feature.

Generated page sets/collections are deferred until a typed use case is justified. V3 core does not introduce a general template programming language for site loops.

---

# 115. 404, redirects, and deployment boundary

The Site Adapter can produce a styled 404 artifact and represent redirect intent.

Actual HTTP status codes, redirect configuration, headers, and hosting behavior belong to deployment adapters/publication infrastructure.

```text
SITE BUILD
→ static site tree

DEPLOYMENT
→ puts that tree on a host
```

Hosting provider syntax never enters the core site content contract.

---

# 116. Site QA and acceptance

Page acceptance and site acceptance are separate.

Page QA reuses artifact rules for semantics, presentation, accessibility, responsiveness, profile purity, performance, and visual behavior.

Site QA adds:

```text
route graph validation
internal link integrity
navigation consistency
orphan page detection
canonical/sitemap consistency
locale alternate consistency
shared shell semantics
unique/descriptive page metadata
site-level profile coherence
cross-page accessibility behavior
```

A site is not accepted merely because every page passes individually.

---

# 117. Site build graph and incrementality

Site build graph distinguishes shared dependencies and per-page dependencies.

```text
Site Manifest
├── Shell
├── Navigation
├── Shared Assets
├── Page A
├── Page B
└── Page C
```

A page-only content change should not require unrelated page rendering once fine-grained caching is justified and implemented.

Site/page fingerprints and output hashes remain distinguishable.

---

# 118. Security and trust boundaries

Major trust boundaries include:

```text
Raw user input
Imported modules/resources
Remote acquisition
Plugins
Renderer outputs
Studio external edits
Browser runtime
```

Security rules include:

- safe/restricted YAML profile;
- input size/depth/resource limits;
- duplicate-key rejection;
- workspace path confinement;
- no ambient network in render/planning;
- no arbitrary HTML/CSS/JS author injection;
- plugin least privilege;
- SVG validation/sanitization;
- sensitive locator redaction from public artifacts;
- no raw environment-secret inheritance by plugins;
- no hidden install scripts/permission escalation;
- explicit target/runtime dependency declarations.

---

# 119. Determinism and non-determinism boundaries

Determinism-sensitive stages must avoid hidden dependence on:

```text
current time
unseeded randomness
ambient environment variables
host filesystem order
network state
floating plugin/resource versions
browser timing races
machine-specific paths
```

Where time/randomness are semantically required, they become declared inputs or authored content.

---

# 120. Diagnostics architecture

Diagnostics are structured and machine-readable.

Core fields include:

```text
stable code
severity
stage
semantic/JSON path
source location where available
message
value/context
suggestions
related references
```

Severity classes:

```text
ERROR
WARNING
DEPRECATION
INFO
```

Errors accumulate as much as safely possible within a stage, but invalid dependent stages do not continue on corrupted structures.

Diagnostic codes are a stable API; human wording may improve without breaking automation.

---

# 121. Debug intermediates

Diagnostic builds may emit stage intermediates such as:

```text
raw AST
raw validated model
resolved module graph
expanded model
normalized text model
resolved references
canonical contract
diagnostics
source map
resolution manifest
presentation plan
render spec
QA plan
```

Normal release builds do not need to clutter output with every internal file.

---

# 122. Receipts

OMEGA uses receipts as structured evidence of what happened, not decorative logs.

Receipt families include:

```text
normalization receipt
selection receipt
presentation/treatment receipt
resource/plugin receipt
build receipt
QA receipt
acceptance/review record
```

Release receipts include hashes/versions sufficient to trace the artifact to canonical inputs and capability environment.

Receipts do not leak sensitive locators by default.

---

# 123. Example build receipt dimensions

A release build may capture:

```text
engine / protocol / schema / canonical versions
normalized spec hash
resource lock hash
plugin environment hash
capability snapshot hash
policy/profile/token versions
stage outcomes
cache hits/misses
representation decisions
runtime JS/dependencies
QA results
artifact outputs/digests
performance/timing metadata
```

Timing/runtime metadata is generated state and does not modify the deterministic semantic input hash.

---

# 124. Conformance corpus

The spec compiler and consumers require a large conformance corpus:

```text
fixtures/
├── valid/
├── invalid/
├── normalization/
├── diagnostics/
├── unicode/
├── numbers/
├── imports/
├── references/
├── markdown/
├── evidence/
├── presentation-policy/
└── site/
```

Fixtures include raw input, expected canonical contract, expected semantic hash, and expected diagnostics.

Important properties include:

```text
comments do not change semantic hash
map key order does not change semantic hash
CRLF vs LF does not change semantic hash
array order changes semantic hash where order is semantic
semantic content change changes semantic hash
```

---

# 125. Golden and stress artifacts

OMEGA QA requires curated complete scenarios across:

```text
Prime showcase
Silver evidence ledger
Gold executive document
Cyan technical artifact
Arabic RTL
English LTR
mixed bidi
interactive
static
large evidence
print-heavy
site navigation/profile transitions
```

Stress fixtures test long titles, dense timelines, deep hierarchies, large graphs, wide data, extreme values, and mixed technical/Arabic content.

Golden scenarios are QA fixtures, not product templates.

---

# 126. Versioning and migration

OMEGA separately versions:

```text
Raw Spec schema
Canonical Contract
Engine
OEP
OPP
Capability contracts
Plugin packages
Profiles/tokens
QA policies
Browser/QA environment policies
```

Compatibility is explicit; “same major probably works” is not sufficient for unknown Raw Spec versions.

Migrations produce new authoring files and migration reports. Normal builds do not silently perform breaking source migrations.

---

# 127. Deprecation policy

Deprecated capabilities remain identifiable and buildable only for a defined compatibility window where possible.

AUTO does not select deprecated capabilities.

Migration tooling points to replacements.

Released package/capability versions are immutable; fixes ship as new versions.

---

# 128. Research-derived architecture influences

The architecture has been informed by mature patterns including:

```text
JSON Schema 2020-12
YAML 1.2.2
RFC 3986 URI resolution
RFC 6901 JSON Pointer
RFC 7493 I-JSON
RFC 8785 JSON Canonicalization
CommonMark
Kubernetes required/preferred constraints and spec/status separation
OpenAPI declarative contracts
Docker Compose modular include behavior
Vega/Vega-Lite declarative visualization
Portable Text / structured content systems
W3C PROV
OMG assurance/provenance modeling
SLSA / in-toto provenance
OpenLineage runtime lineage concepts
OCI content descriptors
Subresource Integrity concepts
Reproducible Builds / hermetic build practice
Astro static-first/islands/routing
D3 / SVG / Canvas web visualization
VS Code extension/custom editor patterns
ProseMirror transaction/history concepts
Playwright visual regression
W3C WCAG / ACT rules
OpenTelemetry event/span conventions
SemVer
WASI / WebAssembly Component Model capability security
```

External patterns influence architecture but do not override OMEGA’s domain-specific contracts.

---

# 129. Explicitly rejected architectural directions

OMEGA V3 intentionally rejects the following as default architecture:

```text
Mutating V2 into V3
Always-on LLM dependency
Renderer-authored truth
Raw Spec exposing CSS/React/Astro implementation details
One schema per visual intent
Everything becomes cards/tables
SPA by default
React wrapper around all static content
Generic arbitrary plugin hooks
Third-party monkey-patching core capability IDs
Silent import merging
Absolute host paths as resource identity
Network fetches during renderer execution
Arbitrary custom JS/CSS assets
YAML-anchor-driven application semantics
Fake numeric LLM confidence
Automated accessibility scan = WCAG claim
Visual screenshot diff = aesthetic quality claim
Tests pass = production-ready claim
Plugin installation during build
Marketplace as a V3 core dependency
General-purpose templating language in Raw Spec
Pixel-based Studio page building
```

---

# 130. Formal subsystem boundaries

The following dependency direction is authoritative at conceptual level:

```text
Raw Authoring
    ↓
Spec Compiler
    ↓
Canonical Contract
    ↓
Semantic / Evidence
    ↓
Presentation Policy
    ↓
Shape Analysis
    ↓
Representation Selection
    ↓
Rhythm / Composition
    ↓
Treatment / Profile
    ↓
Render Spec
    ↓
Renderer Implementations
    ↓
Target Packager
    ↓
QA / Acceptance
```

No lower layer should reach upward to mutate authoritative higher-layer semantics.

---

# 131. Public versus internal contracts

OMEGA explicitly distinguishes:

```text
PUBLIC AUTHORING CONTRACT
.omega.yaml

INTERNAL CANONICAL CONTRACT
engine ABI

GENERATED INTERMEDIATE CONTRACTS
truth/evidence/presentation/render/QA plans

EXECUTION CONTRACTS
Build Request, OEP, OPP, events

RECEIPTS
immutable-ish records tied to hashes/versions
```

This separation is essential for long-term maintenance and diagnostics.

---

# 132. System weak-point observability

OMEGA is designed so weak points can be attributed to specific subsystems.

Examples of observable questions:

```text
Which representation causes the most responsive failures?
Which profile produces the most overflow regressions?
Which QA rule is flaky?
Which plugin is slow or crash-prone?
Which representation is almost never selected?
Which content kind lacks stable representations?
Which planner estimate underpredicts runtime cost?
Which fallback loses quality most often?
Which evidence rule creates the most unresolved material claims?
Which build action dominates runtime?
```

The system should prefer structured stage/capability attribution over opaque “OMEGA failed” outcomes.

---

# 133. Acceptance criteria for the architecture itself

This architecture specification is considered ready to proceed to implementation planning only when the Founder explicitly accepts the written spec and no unresolved architectural blocker remains.

The written architecture is successful if it preserves these properties:

1. V2 remains untouched as the primary evolution path.
2. OMEGA Engine functions without an LLM.
3. `.omega.yaml` is portable and human/agent friendly.
4. Canonical contracts are strict, deterministic, and renderer-independent.
5. Meaning, representation, and treatment are separate.
6. Evidence/interpretation/decision are separately traceable.
7. Representation variety can expand without rewriting core semantics.
8. Profiles share one design/capability system.
9. Studio is a client over the same contracts, not a second engine.
10. Plugins extend capabilities through typed boundaries without weakening core invariants.
11. Standalone artifact and site are target adapters over the same platform.
12. QA separates verification, quality, regression, and acceptance.
13. Release claims are evidence-scoped and reproducibility claims are precise.
14. Architecture exposes weak points instead of hiding them behind mega-components.

---

# 134. Non-blocking details intentionally deferred to implementation planning/spec refinement

The following are deliberately **not architectural blockers** and should be resolved during formal implementation planning or focused technical spikes:

- exact JSON Schema file decomposition and every field name;
- exact normalized object key names for all content kinds;
- exact default numeric budgets for motion, JavaScript, size, complexity, or QA;
- exact representation scoring weights;
- exact generated convenience-ID algorithm;
- exact namespace string grammar beyond the approved separation principle;
- exact browser versions used by QA policy v1;
- exact caching granularity in the first implementation;
- exact filesystem layout of build workspaces/caches;
- exact OEP/OPP JSON-RPC payload schemas;
- exact Studio framework/window shell;
- exact source-preserving YAML library implementation;
- exact plugin package format and installer UX;
- whether/when a WASM plugin backend is implemented;
- deployment adapters/providers;
- site search capability;
- general page-set generation;
- marketplace/distribution services;
- multi-user collaboration/CRDT;
- autosave preference defaults.

These items must obey the architecture but do not need to be fixed before implementation planning begins.

---

# 135. Known architectural risks and mitigations

## Risk: taxonomy/registry scale becomes difficult to calibrate

**Mitigation:** stability lifecycle, representation metadata, selection receipts, analytics, and Lab/QA evidence. Registry breadth must be curated, not merely accumulated.

## Risk: source-preserving YAML structured editing is technically difficult

**Mitigation:** separate source model from canonical model, transactional source-aware patches, explicit fallback to Raw editing, and no hidden proprietary state.

## Risk: Python/TypeScript boundary adds operational complexity

**Mitigation:** one authoritative normalizer, versioned canonical ABI, conformance corpus, explicit DTOs, and no duplicate normalization logic.

## Risk: automated visual-quality scoring becomes an oracle

**Mitigation:** measurements remain separate from acceptance policy; screenshot regression is not aesthetic judgment; manual review remains first-class when required.

## Risk: plugin isolation over Node is incomplete

**Mitigation:** separate process, default-deny permission model, declared resources, no ambient secrets, timeouts/resource limits, supply-chain locks, and future WASI-compatible backend.

## Risk: profile variants create cross-site inconsistency

**Mitigation:** Site Identity Profile versus Page Content Profile separation plus Site Coherence QA.

## Risk: static-first policy blocks legitimate interaction

**Mitigation:** progressive enhancement and interactive islands remain available when the representation genuinely requires them.

## Risk: evidence model becomes bureaucratic

**Mitigation:** adaptive assurance (`basic`, `traceable`, `evidence`, `auto`) and modality-aware evidence requirements.

---

# 136. Formal architecture freeze boundary

Once this written spec is approved, implementation planning must treat the following as frozen architectural decisions unless new evidence requires a formal revision:

```text
Engine independent from LLM
V2 frozen
Raw Spec / Canonical Contract split
one authoritative normalizer
strong semantic/presentation separation
content kinds separate from section intents
adaptive evidence model
resource/asset/source/import separation
hard constraints versus preferences
representation registry + deterministic selection
rhythm/composition engine
Prime/Silver/Gold/Cyan profile system
Founder Sand firewall
static-first least-powerful renderer rule
Astro + TypeScript presentation shell
Python semantic/evidence role
Engine API / OEP separation
QA/quality/regression/acceptance separation
Studio as contract-native client
Capability ≠ Plugin architecture
Site Adapter over same platform
```

Implementation may choose the cleanest internal code structure that preserves these boundaries.

---

# 137. Formal design status after Founder approval

Founder approval was granted on **2026-10-08**. The formal status is now:

```text
ARCHITECTURE FROZEN FOR IMPLEMENTATION PLANNING
```

This approval does **not** authorize implementation changes by itself. It opens the next gate:

> **Ω HTML V3 Implementation Plan**

The implementation plan must map the frozen architecture into phases, milestones, package creation order, test strategy, technical spikes, acceptance gates, and compatibility tasks without weakening the architectural contracts.

---

# Appendix A — Example basic artifact Raw Spec

```yaml
omega:
  schema: "3.0"

kind: artifact

metadata:
  id: omega-phase-b

spec:
  document:
    title: "OMEGA Phase B Review"
    language: ar

  presentation:
    profile: prime

  sections:
    - id: current-state
      intent: verdict
      title: "الحالة الحالية"
      body: |
        الأدلة الحالية تسمح بالمراجعة، لكنها لا تثبت الإغلاق الكامل.

    - id: roadmap
      intent: timeline
      title: "الخط الزمني"

      content:
        - kind: timeline
          items:
            - title: "Architecture Freeze"
              state: completed

            - title: "Evidence Review"
              state: current

            - title: "Release Gate"
              state: planned
```

---

# Appendix B — Example high-assurance artifact Raw Spec

```yaml
omega:
  schema: "3.0"
  requires_engine: ">=3.0.0 <4.0.0"

kind: artifact

metadata:
  id: production-readiness-audit

spec:
  assurance: evidence

  target:
    type: standalone-html
    offline: required

  document:
    title: "Production Readiness Audit"
    language: en
    audience: technical-leadership
    intent: technical-audit

  presentation:
    profile: silver

  evidence:
    sources:
      - id: SRC.RUNTIME
        kind: runtime
        label: "Production runtime"

      - id: SRC.AUDIT
        kind: file
        label: "Audit report"
        locator:
          path: ./evidence/audit.md

    observations:
      - id: OBS.RUNTIME.CHECK
        source: SRC.RUNTIME
        observed_at: "2026-10-08T12:30:00+03:00"
        value:
          text: "Runtime health check completed"

    claims:
      - id: CLAIM.RUNTIME
        statement: "The runtime health check completed successfully."
        materiality: material

      - id: CLAIM.RELEASE
        statement: "Production closure is not yet proven."
        materiality: material

    relations:
      - from: OBS.RUNTIME.CHECK
        to: CLAIM.RUNTIME
        type: supports

      - from: CLAIM.RUNTIME
        to: CLAIM.RELEASE
        type: qualifies

    interpretations:
      - id: INTERP.RELEASE
        inputs:
          - CLAIM.RUNTIME
          - CLAIM.RELEASE
        method: evidence-synthesis
        conclusion: |
          Runtime health is supported, but release closure remains incomplete.

    decisions:
      - id: DECISION.RELEASE
        based_on:
          - INTERP.RELEASE
        action: do-not-close-release
        state: proposed
        authority:
          required_role: founder

  sections:
    - id: verdict
      intent: verdict
      title: "Current Posture"
      claims:
        - CLAIM.RELEASE

    - id: evidence
      intent: evidence
      title: "Evidence"
      claims:
        - CLAIM.RUNTIME
```

---

# Appendix C — Example modular fragment and import

Fragment:

```yaml
omega:
  schema: "3.0"

kind: fragment

metadata:
  id: common-omega

spec:
  defs:
    content:
      core-metrics:
        kind: metric-set
        metrics:
          - id: runtime-health
            label: "Runtime health"
            value: 100
            unit: percent

  assets:
    omega-logo:
      kind: image
      src: ./assets/omega.svg

  exports:
    - defs.content.core-metrics
    - assets.omega-logo
```

Artifact:

```yaml
spec:
  imports:
    - as: common
      from: ./shared/common.omega.yaml

  sections:
    - id: metrics
      intent: metrics
      title: "Metrics"
      content:
        - use: common/core-metrics
```

---

# Appendix D — Example presentation policy

```yaml
spec:
  target:
    type: standalone-html
    offline: required
    runtime:
      javascript: allow

  presentation:
    profile: prime

    prefer:
      page_mode: technical-atlas
      density: balanced
      hero: signature-particle

    limits:
      motion: ambient
      interaction: inspect

  sections:
    - id: architecture
      intent: architecture
      title: "Architecture"

      content:
        - kind: graph
          nodes: []
          edges: []

      presentation:
        representation: auto
```

---

# Appendix E — Example Site Raw Spec

```yaml
omega:
  schema: "3.0"

kind: site

metadata:
  id: jemy-omega-site

spec:
  site:
    name: "JEMY — OMEGA"
    default_language: en

  presentation:
    profile: prime

  navigation:
    primary:
      - page: home
      - page: about
      - page: omega
      - page: contact

  pages:
    - id: home
      route: /
      purpose: home

      document:
        title: "JEMY — Autonomous Intelligence Architect"
        language: en

      presentation:
        profile: prime
        prefer:
          hero: signature-particle

      sections: []

    - id: evidence
      route: /omega/evidence/
      purpose: evidence

      document:
        title: "OMEGA Evidence Room"
        language: en

      presentation:
        profile: silver

      sections: []
```

---

# Appendix F — Example structured diagnostic

```json
{
  "code": "OMEGA-CAPABILITY-018",
  "severity": "error",
  "stage": "presentation-policy",
  "path": "/spec/sections/4/presentation/representation",
  "source": {
    "module": "main",
    "line": 71,
    "column": 9
  },
  "message": "The required representation needs duration data that is not present.",
  "suggestions": [
    "Provide start/end values.",
    "Use representation: auto.",
    "Use timeline.vertical-spine."
  ]
}
```

---

# Appendix G — Example OMEGA selection receipt

```yaml
selection:
  section: architecture
  intent: architecture

  candidates_considered: 18
  candidates_eligible: 7

  selected:
    representation: architecture.layered-system-map
    version: 1

  reasons:
    - strong semantic fit
    - graph shape supports layered boundaries
    - Prime profile affinity
    - better document rhythm than node-grid alternative
    - complete narrow-container fallback

  rejected:
    - representation: architecture.interactive-inspector
      reason: client JavaScript denied by target policy

    - representation: architecture.gantt-like-map
      reason: incompatible semantic/content shape
```

---

# Appendix H — Example QA receipt summary

```yaml
qa:
  policy: qa.release.v1

  subject:
    artifact: sha256:...

  summary:
    pass: 184
    fail: 0
    needs_review: 2
    not_applicable: 37

  gates:
    contract: pass
    semantic: pass
    evidence: pass
    html: pass
    accessibility: review-required
    responsive: pass
    print: pass
    offline: pass
    visual_regression: pass
    cross_browser: pass
    reproducibility: pass

  acceptance:
    state: review_required
    reviews_required:
      - complex-graph-alt-quality
      - screen-reader-journey
```

---

# Appendix I — Glossary

**Artifact** — A single logical final document output.  
**Site** — A multi-page graph of OMEGA pages sharing information architecture and shell.  
**Raw Spec** — Human/agent-authored `.omega.yaml`.  
**Canonical Contract** — Strict internal engine ABI after normalization.  
**Intent** — Why a section exists.  
**Content Kind** — The structured semantic data present.  
**Representation** — A specific way to communicate semantic content.  
**Treatment** — Visual expression such as depth, surface, edge, typography, motion.  
**Profile** — OMEGA presentation personality (Prime/Silver/Gold/Cyan).  
**Renderer** — Technology implementation that converts Render Spec into output fragments.  
**Target Adapter** — Artifact/site-specific packaging/composition layer.  
**Source** — Ongoing evidence/source identity.  
**Snapshot** — Captured immutable source state.  
**Observation** — Recorded observed/extracted value.  
**Claim** — Proposition under evaluation.  
**Interpretation** — Explicit synthesis/conclusion over inputs.  
**Decision** — Action/state derived under authority.  
**Capability** — Typed architectural functionality available to OMEGA.  
**Plugin** — Provider/package delivering one or more capabilities.  
**OEP** — OMEGA Engine Protocol between engine and external clients.  
**OPP** — OMEGA Plugin Protocol between engine and isolated plugins.  
**Receipt** — Structured record of generated decisions/execution/verification tied to identities/hashes.  
**Acceptance** — Policy decision over verification, quality, regression, review, and waivers.  
**Site Coherence** — Cross-page identity/navigation/behavior consistency independent from page-local rhythm.

---

# Appendix J — Founder review checklist

Before declaring this architecture frozen for implementation planning, review the written specification specifically for:

1. Does any section accidentally re-couple truth, interpretation, decision, presentation, or QA?
2. Is any human authoring field leaking renderer/CSS implementation details?
3. Is any generated state incorrectly treated as authored truth?
4. Are V2 and V3 boundaries explicit enough to prevent accidental mutation of V2?
5. Is the Prime/Silver/Gold/Cyan relationship accurately represented?
6. Is Founder Sand correctly restricted to brand warmth rather than semantic status?
7. Does the representation system genuinely permit large future variety without forcing variety?
8. Does the Studio remain removable without losing the artifact source?
9. Can plugins extend capability without gaining authority over core truth/QA rules?
10. Can a standalone artifact and a site share the same semantic/presentation engine without hidden forks?
11. Are acceptance/reproducibility claims appropriately scoped and evidence-backed?
12. Are all deferred items implementation details rather than missing architectural decisions?

---

# Final review state

**Current document status:** REVIEW CANDIDATE.  
**Architecture implementation status:** NOT STARTED by this document.  
**Next required action:** Founder review and explicit acceptance/revision of this written specification.  
**Only after written approval:** produce **Ω HTML V3 Implementation Plan**.
