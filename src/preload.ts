import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { findWorkspaceRoot, prepareShadow } from "./shadow.js";

if (!process.env.DSH_BUN_COMPAT_CHILD && process.argv.some((value) => value.endsWith("@deepseek-ai/dsh/lib/bin.js"))) {
  const compatLib = resolve(import.meta.dir);
  const root = findWorkspaceRoot(compatLib);
  const cache = prepareShadow(root, compatLib);
  const entry = join(cache, "node_modules/@deepseek-ai/dsh/lib/bin.js");
  const hook = join(compatLib, "runtime-hook.js");
  let exitCode = 1;
  try {
    const child = Bun.spawn([process.execPath, "--preload", hook, entry, ...process.argv.slice(2)], {
      cwd: root,
      env: {
        ...process.env,
        DSH_BUN_COMPAT_CHILD: "1",
        DSH_BUN_COMPAT_DISABLE_HMR: "1"
      },
      stdout: "inherit",
      stderr: "inherit"
    });
    exitCode = await child.exited;
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
  process.exit(exitCode);
}
