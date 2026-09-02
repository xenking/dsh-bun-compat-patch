# DSH Bun Compatibility Patch

A compatibility layer that lets **DeepSeek Harness (DSH)** run on **Bun 1.3.14+** without a Node bridge.

At launch the layer rewrites two files inside the user's installed DSH packages:

- `node_modules/@deepseek-ai/dsh-code-runtime-worker-thread/lib/index.js` — points its `node:module` import at this compat layer.
- `node_modules/@deepseek-ai/dsh/lib/profile-boot-*.js` — guards the Cordis server-side HMR loop, which depends on a Node-internal ESM loader hook that Bun does not provide.

Both edits are reverted on exit, so the user's `node_modules` is left untouched when the process terminates cleanly.

## Problem it solves

DSH relies on a handful of Node APIs. Bun 1.3.14 covers most of them natively, but exactly one missing surface is relevant to DSH code runtime:

- **`node:module.stripTypeScriptTypes`** — Bun's `node:module` shim does not export this function. The compat layer re-implements it on top of `Bun.Transpiler({ loader: "ts" }).transformSync`, which is semantically equivalent and synchronous, matching the contract DSH expects when passing TypeScript source through `workerData`.

Everything else DSH uses is already covered by Bun:

- **`node:worker_threads`** — fully supported (`Worker`, `workerData`, `parentPort`, `resourceLimits`, `stdout` / `stderr`, `eventLoopUtilization`).
- **Cordis server-side HMR** — disabled by an env-gated guard because Bun lacks the Node-internal ESM loader hooks Cordis relies on.

No Node process is forked, no `node` binary is required on `PATH`, and no shadow directory is created.

## Requirements

- Bun `>= 1.3.14` (recommended `>= 1.4.0`).
- `@deepseek-ai/dsh ^0.1.1-rc.2`.

Verify your runtime:

```sh
bun --version
```

The patch is written against the build artifacts shipped with DSH `0.1.1-rc.2`. When upgrading Bun or DSH, re-verify that the patch logic still applies.

## Installation

Install alongside DSH in the same project:

```sh
bun add -d dsh-bun-compat-patch
bun add @deepseek-ai/dsh
bun run build
```

`bun run build` produces `./lib/{preload,node-module}.js` (plus `.map` source maps).

## Usage

Launch DSH through Bun with the compat preload:

```sh
bun --preload ./lib/preload.js ./node_modules/@deepseek-ai/dsh/lib/bin.js web --port 39881
```

The preload detects the DSH entry, applies the in-place patches, spawns the DSH process as a child Bun runtime, forwards `SIGINT` / `SIGTERM`, and restores the original files before exit.

### Environment variables

| Variable | Set by | Purpose |
| --- | --- | --- |
| `DSH_BUN_COMPAT_CHILD` | preload | Marks the spawned child so the preload becomes a no-op there. Prevents recursive patching. |
| `DSH_BUN_COMPAT_DISABLE_HMR` | preload | Tells the patched `profile-boot-*.js` files to skip the Cordis HMR loop. |
| `DSH_BUN_COMPAT_LIB` | preload (optional) | Override for the directory holding `lib/node-module.js`. The preload normally walks up from `import.meta.dir` to locate it. |
| `DSH_BUN_COMPAT_DEBUG` | user | When set, prints an indented tree of any uncaught error (including `cause` and aggregated `errors[]`) to stderr. |

## How the in-place patch works

1. `prepareInPlacePatch` reads `dsh-code-runtime-worker-thread/lib/index.js`, backs the bytes up to `$TMPDIR/dsh-bun-compat-patch-backup-*/index.js.bak`, and rewrites the `from "node:module"` import to `from "<compatLib>/node-module.js"` via a `file://` URL. A marker comment is prepended so a second run can detect the file is already patched and skip re-patching.
2. `patchHmrGuards` iterates every `dsh/lib/profile-boot-*.js` and prefixes the existing `if (!signalShutdown.signal.aborted && ctx.fiber.state === 2 && ctx.get("loader") !== void 0) try {` guard with `!process.env.DSH_BUN_COMPAT_DISABLE_HMR &&` so the HMR loop short-circuits under Bun.
3. On clean exit, signal, or `process.exit`, `restorePatch` walks every backup and writes the original bytes back, then deletes the backup directory.

If the parent dies before cleanup (`kill -9`, power loss) a follow-up run will see the marker on the DSH file but no corresponding backup; it logs and skips, leaving the file patched. The user must reinstall DSH (or restore the file manually) in that case. Treat any `kill -9` of the parent as leaving DSH in a dirty state.

## Project layout

```
src/
  preload.ts      # Bun --preload entry; orchestrates patching + child spawn
  node-module.ts  # stripTypeScriptTypes implementation backed by Bun.Transpiler
  shadow.ts       # in-place patch / restore / HMR-guard helpers
  diagnostic.ts   # optional uncaught-error tree printer (gated on env)
build.ts          # bundles preload + emits node-module.js into ./lib
tsconfig.json     # strict TS, noEmit, noUnusedLocals / noUnusedParameters
```

The build emits only two files into `./lib`:

- `preload.js` — bundled with `shadow.ts` and `diagnostic.ts` inlined.
- `node-module.js` — standalone, referenced via `file://` URL from the patched DSH entry.

## Scripts

| Script | What it does |
| --- | --- |
| `bun run build` | Build `./lib` from `./src`. |
| `bun run typecheck` | `tsc --noEmit` against the strict tsconfig. |
| `bun run pack` | `bun pm pack` — produce the npm tarball. |

## License

MIT.