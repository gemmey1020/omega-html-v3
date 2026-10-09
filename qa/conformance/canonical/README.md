# P01 canonical compiler conformance

The root `pnpm verify` runs these Vitest tests through its existing root test
command. A canonical string, ordering, numeric or hash mismatch fails that check.
No network requests or dependency acquisitions occur during verification.

## Independent reference fixtures

`rfc8785-primitives.*` transcribe RFC 8785 sections 3.2.2 and 3.2.3. The
`rfc8785-sorting.*` inputs and expected UTF-16 property order transcribe section
3.2.3. `rfc8785-numbers.json` stores every Appendix B Table 1 row: 24 finite
IEEE-double outputs plus NaN and infinity rejection. Hex words are decoded
directly as IEEE-754 doubles; expectations are not computed by the compiler or
by a second invocation of `JSON.stringify` in the tests.

Source: <https://www.rfc-editor.org/rfc/rfc8785.txt>. The pinned intake snapshot
has SHA-256 `63d52294eb0e3f0014174288186d388b4ddbf2c67d1ce8af1d9726eb0c3ab240`
and 41,879 bytes, as recorded by its existing acquisition receipt.
I-JSON's string noncharacter prohibition is specified in RFC 7493 section 2.1:
<https://www.rfc-editor.org/rfc/rfc7493#section-2.1>.

`walking-skeleton.omega.yaml` exercises Raw Schema 3.0 -> Contract 1.0 with
Arabic NFC human text, protected decomposed code/link titles, explicit and
generated IDs, body before authored content, nested sections and defaults.
The complete expected contract was authored independently. The expected compact
canonical string and UTF-8 hex were produced from that expected contract with
Python standard-library `json.dumps(sort_keys=True, ensure_ascii=False,
separators=(',', ':'))`, and hashes with `hashlib.sha256`. This reference is
limited to this fixture's ASCII property names and string-only semantic values;
the published RFC vectors independently cover generic numeric and UTF-16
ordering behavior. The expected canonical string file has no final newline.

## Runtime and source-location policy

`compileRawSpec` returns an owned deep clone and freezes every object/array,
including its canonical value, byte array, source map, diagnostics and version
sidecars. UTF-8 bytes use `readonly number[]` because native typed arrays with
elements cannot be frozen. Callers can construct a new `Uint8Array` from the
snapshot. Input source bytes are copied before parsing and hashing. Earlier
stages and caller input are never frozen by the completed compiler. Stage
validators borrow their successful input rather than mutating or freezing it.

Canonical bytes contain only the strict Canonical Contract. Module names,
engine version, source locations, internal empty resolution manifest and hashes
are sidecars. Physical import/resource resolution is deferred; logical module
validation is lexical portability validation, not filesystem confinement.

Each canonical node receives its authored value location where available.
Contract version maps to `omega.schema`; derived direction maps to language;
`idOrigin` maps to an explicit `id` or the nearest owner. Body expansion maps
the first content node and every rich-text descendant to the body's scalar.
Authored prose indices shift by one when body is present, including inside
nested sections. Authored prose text descendants map to the original `text`
scalar. Synthesized defaults and missing fields use the nearest authored
ancestor. These locations retain the parser's complete authored spans; they do
not claim exact Markdown token positions inside a YAML scalar. If the caller
supplies no applicable source location, no location is invented.

ID failures remap their diagnostic paths and duplicate related references to
the original Raw positions before returning diagnostics only. Canonical-schema
diagnostics retain canonical pointers with their mapped authored locations.
No failure result contains a partial canonical value, bytes or hashes.

Generic JCS preserves Unicode without NFC, preserves arrays, emits UTF-16
sorted keys directly (including numeric-looking keys), accepts all finite
IEEE-double values and rejects non-JSON objects/values, lone surrogates,
noncharacters, nonfinite numbers, cycles, sparse arrays and extra array
properties. Serialization never invokes getters, coercion or `toJSON` hooks
for the accepted plain JSON object/array model.
