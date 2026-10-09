# P01 compiler front end

## Structural nesting

P01 admits at most **128** levels in each structural model. The limit is a
deterministic authoring policy, not a promise about arbitrary input size or CPU.

- **JSON containers:** an object or array root has depth 1. Every descendant
  object or array adds 1 to its container ancestry. Scalars add no level;
  property names and array indices add no level. Thus 128 nested arrays around
  a string are admitted, and the 129th array is rejected at its JSON Pointer.
  The same counting applies to Raw YAML mappings/sequences, validated Raw,
  before-ID drafts, final Canonical data, and migration callback output.
- **CommonMark AST nodes:** the document node has depth 1. Every child node,
  including paragraph/text, list/item, quote, emphasis/strong/link, adds 1.
  An iterative preflight runs after the pinned CommonMark parser and before
  recursive conversion. The parser's block and inline tree traversals are
  iterative; the guard examines actual parsed structure, not Markdown syntax
  such as the number of `>` characters.
- **Composed Canonical ancestry:** normalization checks its complete emitted
  draft before ID assignment, source-map traversal, Canonical validation,
  serialization or final copying/freezing. Section arrays/objects, prose
  content arrays/objects, RichText and rich-text child arrays/objects share one
  JSON ancestry; a separate allowance is not granted to each section or scalar.
  Conversion inserts JSON containers, so the JSON limit can reject prose whose
  CommonMark AST fits. Standalone RichText normalization also checks the JSON
  tree it emits, counting RichText as its root.

For example, one section containing 58 nested quotes and a text paragraph has
Canonical container depth 127 and compiles; 59 quotes reach depth 129 and fail.
The corresponding ASTs have depths 61 and 62, respectively. A standalone AST
with 125 quotes, paragraph and text reaches exactly 128 nodes, passes the AST
check and fails the converted JSON check. A Canonical section chain ending in
empty RichText blocks can represent exact JSON depth 128 and remains admitted.

The parser preflights composed YAML nodes before recursive conversion and
freezing. Existing excessive-depth YAML library syntax diagnostics are retained.
The pure iterative JSON-model guard checks descriptors and active ancestry,
preserving cycle detection, shared aliases, and accessor/toJSON non-invocation.
It does not freeze caller objects or previous-stage aliases. The compiler's
owned result envelope adds one internal wrapper around admitted Canonical data;
it is copied before freezing. Exact depth 128 is covered through that boundary.

Canonical schema recursive child checks use standard Draft 2020-12 `if`/`then`
guards requiring a matching `kind`, inside the existing `oneOf` branches. This
prevents `allErrors` validation from recursively rechecking nested lists under
both list variants, or nested inline content under every inline container
variant. Each branch retains its strict properties, required fields and `const`
kind check. Unknown/missing/wrong kinds still fail, and malformed children of a
matching kind still produce path-aware schema diagnostics. No AJV-specific
vocabulary or additional dependency is used.

## Failure API

Depth failures have `severity: "ERROR"` and expose only the stage's existing
failure discriminant and diagnostics, with no partial Canonical value, string,
bytes or hashes. Paths refer to the first over-budget JSON container; generated
prose paths are mapped to the originating Raw body/content text scalar. Source
locations use that scalar or the nearest real source owner. Markdown line/column
context is available for the containing block; exact YAML-to-Markdown token
coordinates are not claimed.

| Boundary | Code | Stage |
| --- | --- | --- |
| YAML-to-JSON conversion | `OMEGA-PARSE-DEPTH` | `parse` |
| Raw validation | `OMEGA-SCHEMA-DEPTH` | `raw-validation` |
| CommonMark AST preflight | `OMEGA-NORMALIZE-MARKDOWN-DEPTH` | `normalize` |
| Raw / emitted RichText / composed draft normalization | `OMEGA-NORMALIZE-DEPTH` | `normalize` |
| Before-ID draft | `OMEGA-ID-DEPTH` | `ids` |
| Strict Canonical validation | `OMEGA-CANONICAL-DEPTH` | `canonical-validation` |
| Canonical serialization boundary | `OMEGA-SERIALIZE-DEPTH` | `serialize` |
| Migration callback output | `OMEGA-MIGRATION-DEPTH` | `migration` |

The exported `buildSourceMap` keeps its bare `SourceMap` return ABI. It
preflights the supplied Canonical JSON model before traversal and throws
`CanonicalizationError` with its path/reason for over-budget or invalid model
input. It does not serialize the input or add schema validation. A failed map
call returns no partial map. This guard also applies to direct callers who have
not used the normalizer/ID/validator success gates.

Generic `canonicalizeJson` throws `CanonicalizationError`, preserving its `path`
and message contract and adding `reason: "depth" | "model"` (`"model"` by
default). It never converts an arbitrary programmer/Proxy error into a depth
diagnostic. Public validators and normalizers return their existing failure
results for model errors too: `OMEGA-SCHEMA-JSON-MODEL`,
`OMEGA-NORMALIZE-JSON-MODEL`, and `OMEGA-ID-JSON-MODEL`. Existing Canonical and
migration JSON-model codes remain in use. No schema/contract version changes.

The source Unicode scan advances and spans by the code point's actual UTF-16
width: an astral noncharacter occupies two columns and is diagnosed once by
the source scan. Scalar context and independent YAML diagnostics remain useful
separate diagnostics.
