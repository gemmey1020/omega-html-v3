# OEP 1.0 local stdio contract

Launch through the acquired CLI source runtime:

```bash
pnpm omega engine --stdio
```

The child reads UTF-8 JSON-RPC 2.0 objects terminated by LF; CRLF works too.
Newlines inside JSON strings are escaped. Arbitrary byte chunks, including split
UTF-8 characters, are supported. Batches and client notifications are unsupported.
IDs are nonempty strings of at most 128 characters or safe integers, unique for
the entire session; string and numeric IDs are distinct. Duplicate IDs receive
`-32004` and never schedule a second attempt. A duplicate in-flight ID necessarily
shares its error response ID with the original attempt's eventual result.

First send `omega.initialize` with `{ "oepVersion": "1.0" }`. The result has
`oepVersion: "1.0"`, `engineVersion: "0.0.0"`, `rawSchemaVersion: "3.0"`,
`canonicalContractVersion: "1.0"`, `eventVersion: "omega-events/1.0"`, and
`limits`. These version families are independent. An incompatible OEP request is
rejected with `-32003`; initialization can then be retried with a new ID.
Repeated successful initialization is rejected. No daemon or network is started.

## Methods and wire DTOs

`OepParams` / `OepResults` in `oep-types.ts` own the typed contract. All methods
return a JSON-RPC result; expected Engine failures/cancellation are structured
Engine results, not RPC exceptions.

| Method | Parameters |
| --- | --- |
| `omega.initialize` | `{ oepVersion: "1.0" }` |
| `omega.validate`, `omega.plan`, `omega.build`, `omega.inspect` | `{ source, settings?, control? }` |
| `omega.explain` | `{ plan, control? }` — exact current producer-generated plan |
| `omega.capabilities` | `{ control? }` |
| `omega.migrate` | `{ source, targetVersion, control? }` |
| `omega.cancel` | `{ requestId }` |
| `omega.shutdown` | `{}` |

`source` is exactly `{ module, text: string }` or `{ module, bytes: number[] }`.
Bytes are integers from 0 to 255, converted into a fresh `Uint8Array`. Source
strings/bytes remain unchanged; the sole P01 compiler performs parsing and
encoding/semantic admission. Arbitrary native objects, callbacks, or signals are
not wire values. `settings` accepts only current Engine execution settings:
`quality: fast|release`, `diagnostics: normal|full`, `cache: use|refresh|off`,
`outputDirectory`, `cacheDirectory`. A build needs an admitted output directory.
`control` accepts optional `buildId` / `taskId` matching `[A-Za-z0-9._-]{1,128}`;
local cancellation tokens and event listeners are created by the server. Controls,
correlation, and transport state do not enter Canonical semantics or plan hashes.
The generated explanation plan is admitted by its existing producer/Canonical
validator; OEP does not parse source or implement another normalizer.

Migrate delegates to the real empty historical registry. In P02, target `3.0`
returns unsupported-route; target `2.0` returns unsupported-target. No historical
transformation is fabricated.

Every real Engine event is forwarded as
`{ "jsonrpc": "2.0", "method": "omega.event", "params": { "requestId": ..., "event": ... } }`.
Events retain `omega-events/1.0`, attempt correlation, sequence and actual terminal
state. Responses can arrive out of request order. An admitted `engine --stdio` startup failure exits 4 with the existing redacted
startup diagnostic on stderr and empty stdout; there is no request ID to answer
before startup. Protocol stdout contains only
frames; transport diagnostics go to stderr, without exception text or host paths.

## Cancellation, shutdown and limits

Cancel targets the RPC request ID, not an artifact fingerprint or user-selected
build ID. Results are `requested`, `already-requested`, `completed` or `unknown`.
Requests with invalid parameters/unknown methods are not Engine attempts and are
unknown cancellation targets. A cancel acknowledgement means cancellation was
requested; the actual Engine result is authoritative. Cancellation after atomic
publication cannot revoke success. There is one real Engine terminal per attempt.
Earlier accepted HTML/receipt pairs remain intact after failed/cancelled builds.
Returned success paths identify immutable generations, not the mutable current
pointer. Engine cooperative cancellation limits remain in effect: synchronous
compiler work cannot be interrupted midway, Astro checks cancellation between
its owned operations, and browser verification closes its owned browser in finally.

Shutdown closes admission immediately (`-32002` for further requests), requests
cancellation of active attempts, awaits their actual owned renderer/browser/cache/
workspace cleanup, flushes responses, and exits. EOF, abrupt input close, SIGINT
and SIGTERM follow the same drain path. No partial results are promoted by OEP.
A non-reading/broken stdout peer cannot keep an unbounded output queue: output
failure cancels/drains attempts; a failed or stalled output flush closes stdout
and returns exit 4. Normal shutdown returns exit 0. Protocol delivery cannot be
promised after a transport failure; already published Engine output stays committed.

Limits are advertised from `OEP_LIMITS`: 1 MiB request frame; 16 MiB response
frame / queued output; 8 concurrent Engine attempts; 4096 unique session IDs,
with the final ID reserved for shutdown; output flush deadline 3000 ms. Decoder
storage is one fixed frame-sized byte buffer, rather than retained fragments.
Oversized input is discarded through the next LF (`-32005`) and subsequent
frames remain usable. Unterminated/invalid UTF-8/invalid JSON yields `-32700`;
invalid envelopes `-32600`, unknown methods `-32601`, invalid params `-32602`,
unexpected protocol bugs `-32603`, pre-initialization operations `-32001`.
Cancel and shutdown bypass the active-attempt cap. Used/completed IDs remain
bounded by the session cap; open a new session once exhausted. The typed client
bounds pending requests to 8 plus 2 control slots, rejects pending work on end,
close, error or disposal, and never owns or kills the caller's child process.
It has no automatic per-operation deadline; callers may dispose/close their
transport when abandoning a live peer.

This is the cooperative local P02 walking skeleton, not an adversarial network
service, universal preemption guarantee, production release, or full WCAG claim.
