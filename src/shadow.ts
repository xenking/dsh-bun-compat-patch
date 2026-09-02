import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {pathToFileURL} from "node:url";

const PATCH_MARKER = "// @dsh-bun-compat-patch";
const PATCH_MARKER_END = "// @dsh-bun-compat-patch end";

/**
 * Metadata describing a single patched file so it can be restored on exit.
 * `backupFile` is empty when the file was already marked as patched by another
 * concurrent run and therefore has no backup in this process.
 */
export interface PatchMeta {
  patchedFile: string;
  backupFile: string;
}

/**
 * Walk up from `start` until a `node_modules/@deepseek-ai/dsh/package.json` is found.
 */
export function findWorkspaceRoot(start: string): string {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, "node_modules/@deepseek-ai/dsh/package.json"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("could not locate a workspace containing @deepseek-ai/dsh");
    current = parent;
  }
}

/**
 * Patch the installed `dsh-code-runtime-worker-thread` entry in place so it imports
 * `stripTypeScriptTypes` from this compat layer instead of from `node:module`.
 * The original bytes are backed up to `$TMPDIR/dsh-bun-compat-patch-backup-*`
 * so {@link restorePatch} can undo the change on exit.
 *
 * No-op (returns empty `backupFile`) when the file is already marked as patched.
 * Throws when the expected `from "node:module"` import is missing — likely a DSH
 * version drift that requires updating this compat layer.
 */
export function prepareInPlacePatch(root: string, compatLib: string): PatchMeta {
  const targetFile = join(root, "node_modules/@deepseek-ai/dsh-code-runtime-worker-thread/lib/index.js");
  const source = readFileSync(targetFile, "utf8");

  if (source.includes(PATCH_MARKER)) {
    return { patchedFile: targetFile, backupFile: "" };
  }

  const backupDir = mkdtempSync(join(tmpdir(), "dsh-bun-compat-patch-backup-"));
  const backupFile = join(backupDir, "index.js.bak");
  writeFileSync(backupFile, source);

  const nodeModuleUrl = pathToFileURL(join(compatLib, "node-module.js")).href;
  const patched = source.replaceAll(
    'from "node:module"',
    `from ${JSON.stringify(nodeModuleUrl)}`,
  );

  if (patched === source) {
    rmSync(backupDir, { recursive: true, force: true });
    throw new Error(
      `dsh-code-runtime-worker-thread/lib/index.js does not import from "node:module"; ` +
      `the DSH version may have changed and this compat layer needs updating.`,
    );
  }

  writeFileSync(targetFile, `${PATCH_MARKER}\n${patched}\n${PATCH_MARKER_END}`);

  return { patchedFile: targetFile, backupFile };
}

/**
 * Restore a previously patched file from its backup and remove the backup directory.
 * No-op when the file was never patched in this run.
 */
export function restorePatch(meta: PatchMeta): void {
  if (!meta.backupFile || !existsSync(meta.backupFile)) return;
  try {
    writeFileSync(meta.patchedFile, readFileSync(meta.backupFile, "utf8"));
  } finally {
    rmSync(dirname(meta.backupFile), { recursive: true, force: true });
  }
}

/**
 * Wrap each `dsh/lib/profile-boot-*.js` with a `DSH_BUN_COMPAT_DISABLE_HMR` guard
 * so the Cordis server-side HMR loop is skipped under Bun (Bun lacks the Node
 * internal ESM loader hooks Cordis depends on).
 *
 * Files lacking the target guard expression are left untouched. Files already
 * marked as patched are skipped.
 */
export function patchHmrGuards(root: string): PatchMeta[] {
  const dshLib = join(root, "node_modules/@deepseek-ai/dsh/lib");
  if (!existsSync(dshLib)) return [];
  const patches: PatchMeta[] = [];
  for (const name of readdirSync(dshLib)) {
    if (!name.startsWith("profile-boot-") || !name.endsWith(".js")) continue;
    const filePath = join(dshLib, name);
    const source = readFileSync(filePath, "utf8");
    if (source.includes(PATCH_MARKER)) continue;
    if (!source.includes("const ctx = await boot(")) continue;
    const patched = source.replace(
      'if (!signalShutdown.signal.aborted && ctx.fiber.state === 2 && ctx.get("loader") !== void 0) try {',
      'if (!process.env.DSH_BUN_COMPAT_DISABLE_HMR && !signalShutdown.signal.aborted && ctx.fiber.state === 2 && ctx.get("loader") !== void 0) try {',
    );
    if (patched === source) throw new Error(`HMR guard transform did not match: ${name}`);

    const backupDir = mkdtempSync(join(tmpdir(), "dsh-bun-compat-patch-backup-"));
    const backupFile = join(backupDir, `${name}.bak`);
    writeFileSync(backupFile, source);
    writeFileSync(filePath, `${PATCH_MARKER}\n${patched}\n${PATCH_MARKER_END}`);
    patches.push({ patchedFile: filePath, backupFile });
  }
  return patches;
}