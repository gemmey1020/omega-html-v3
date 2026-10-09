# Explicit Raw schema migration

`migrateRawSpec(source, targetVersion, registry?)` is a separate operation from
`compileRawSpec`. Both required arguments remain explicit. Normal compilation
never consults a migration registry and still rejects Raw `2.0` with
`UNSUPPORTED_RAW_SCHEMA`.

The default immutable registry is **empty**. The frozen P01 architecture supplies
no normative historical Raw `2.0` schema or mapping. HTML V2 is a separate product
and supplies no such schema. The predecessor and adapter in `migrations.test.ts`
are **SYNTHETIC TEST-ONLY**; no historical or production Raw `2.0` compatibility
is asserted. Real compatibility requires a reviewed source schema and adapter.

Use `createMigrationRegistry(adapters)` to explicitly supply a copied, frozen
registry. Each adapter has an identity, exact `fromVersion` / `toVersion`, and a
synchronous `migrate(frozenParsedJson)` callback. Duplicate direct routes are
rejected; input order does not determine routing. There is no graph chaining,
implicit same-version no-op, global mutable registration, or plugin override.
Callbacks are trusted caller-supplied operations and must themselves be pure and
deterministic; the framework performs no network or filesystem writes.

An adapter owns source-schema interpretation and checks. Its result is not
trusted: the strict descriptor-based JSON serializer rejects getters, `toJSON`
hooks, cycles and non-JSON values; the restricted YAML parser then parses the
new text, and the authoritative Raw `3.0` validator validates every field and
the exact target schema version. No normalization or default application occurs.
Only target `3.0` is currently supported, independently of Canonical and Engine
versions. Unsupported targets/routes, invalid input, exceptions and failed
output validation return no usable source and no completed steps.

Success returns a new frozen `CompilerSource`, source/target versions, explicit
adapter identity and migration step, and diagnostics. Output is deterministic
JSON followed by LF, an admitted YAML subset. The generated logical module is
`${source.module}.migrated`; any output-validation locations identify this new
document and have `context.sourceDocument: "generated-migration-output"`.
Original authoring offsets are not reused. Authoring comments and formatting are
not preserved in the new document; the original string or bytes are untouched.
Caller-owned adapter output is neither mutated nor frozen. `sourceVersion` is
null when a source version cannot be read; later failures retain the authored
version. A later CLI phase is responsible for choosing and writing a new file.
