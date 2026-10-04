import "./diagnostic.js";
import {existsSync} from "node:fs";
import {dirname, resolve} from "node:path";
import type {PatchMeta} from "./shadow.js";
import {findWorkspaceRoot, patchHmrGuards, prepareInPlacePatches, restorePatch} from "./shadow.js";

if (!process.env.DSH_BUN_COMPAT_CHILD) {
  const entry = process.argv[1];
  if (entry && entry.endsWith("@deepseek-ai/dsh/lib/bin.js")) {
    let compatLib = process.env.DSH_BUN_COMPAT_LIB;
    if (!compatLib) {
      let current = import.meta.dir;
      for (;;) {
        const candidate = resolve(current, "lib", "node-module.js");
        if (existsSync(candidate)) { compatLib = resolve(current, "lib"); break; }
        const parent = dirname(current);
        if (parent === current) throw new Error("could not locate lib/node-module.js");
        current = parent;
      }
    }

    const root = findWorkspaceRoot(entry ? dirname(entry) : process.cwd());

    const patches: PatchMeta[] = prepareInPlacePatches(root, compatLib);
    patches.push(...patchHmrGuards(root));

    const childArgs = process.argv.slice(2);

    let exitCode = 1;
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      child = Bun.spawn([process.execPath, entry, ...childArgs], {
        cwd: root,
        env: {
          ...process.env,
          DSH_BUN_COMPAT_CHILD: "1",
          DSH_BUN_COMPAT_DISABLE_HMR: "1",
          DSH_BUN_COMPAT_LIB: compatLib,
        },
        stdout: "inherit",
        stderr: "inherit",
      });
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.on(signal, () => { try { child?.kill(); } catch { /* ignore */ } });
      }
      exitCode = await child.exited;
    } finally {
      for (const p of patches) if (p.backupFile) restorePatch(p);
    }
    process.exit(exitCode);
  }
}