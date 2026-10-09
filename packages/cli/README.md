# P02 omega CLI

From the checkout root, activate the pinned local tools, then run:

```bash
source scripts/activate-toolchain.sh
pnpm omega capabilities --json
pnpm omega build basic.omega.yaml --output dist --json
pnpm omega build basic.omega.yaml --output dist --events=jsonl
```

Commands: `validate`, `plan`, `build`, `inspect`, `explain`, `migrate`,
`capabilities`. Source commands accept one authoring file. `migrate` accepts
`--target 3.0`; P01's migration registry is empty, so unregistered routes fail
without rewriting the source. `build` accepts `--output`; its default is `dist`.
`--json` returns structured Engine results. Build events are JSONL envelopes
with `type: event` and versioned `event` data, followed by one `type: result`.

Exit codes: 0 success, 2 usage, 3 expected domain failure, 4 internal failure,
130 cooperative SIGINT cancellation. Plain human output is presentation.

Each build executes the real uncached minimal Prime prose pipeline, including
blocked-network Chromium with authored JavaScript disabled. This requires the
already installed pinned local browser and acquires nothing at runtime.
Acceptance is exclusively `qa.phase.p02.walking-skeleton.v1`; receipts claim
P02 minimal artifact acceptance. Historical artifact regression is explicitly
not applicable because this phase declares no baseline. No human approval,
release, production, full WCAG, or P08 acceptance is implied.

Accepted HTML and its receipt live together in an immutable
`.omega-generations/omega-accepted-*` directory. `current` is the only managed
symlink and changes by one atomic same-filesystem pointer rename. Structured
results return immutable generation paths. Readers using `current` must resolve
that pointer once, then read both files from the resolved generation; two reads
through a changing pointer can span two builds. Prior generations are preserved.
Failed or cancelled attempts remove owned temporary candidates and uncommitted
generations. External symlink ancestors, unowned pointers, and traversal are
rejected. This assumes stable caller-managed filesystem ancestors and does not
promise crash recovery, hostile concurrent filesystem isolation, or power-loss
durability; broader workspace/cache recovery belongs to Task 7.

The package's `omega` binary uses the same `src/launch.mjs` entry point as the
repository script. Its source loader only transforms workspace package TS using
already acquired pinned Rolldown, supporting NodeNext `.js` source specifiers
and TypeScript parameter properties without changing the compiler or TS checks.
