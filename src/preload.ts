import { join, resolve } from "node:path";
import { findWorkspaceRoot, prepareShadow } from "./shadow.js";

if (!process.env.DSH_BUN_COMPAT_CHILD && process.argv.some((value) => value.endsWith("@deepseek-ai/dsh/lib/bin.js"))) {
  const packageRoot = resolve(import.meta.dir, "..");
  const root = findWorkspaceRoot(packageRoot);
  const cache = prepareShadow(root, packageRoot);
  const entry = join(cache, "node_modules/@deepseek-ai/dsh/lib/bin.js");
  const hook = join(packageRoot, "lib/runtime-hook.js");
  const child = Bun.spawn([process.execPath, "--preload", hook, entry, ...process.argv.slice(2)], {
    cwd: root,
    env: {
      ...process.env,
      DSH_BUN_COMPAT_CHILD: "1",
      DSH_BUN_COMPAT_CACHE: cache,
      DSH_BUN_COMPAT_DISABLE_HMR: "1"
    },
    stdout: "inherit",
    stderr: "inherit"
  });
  process.exit(await child.exited);
}
