import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dir;
const outdir = join(root, "lib");
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const bunEntries = [
  "preload",
  "runtime-hook",
  "diagnostic",
  "shadow",
  "node-module",
  "node-worker-threads"
].map((name) => join(root, "src", `${name}.ts`));

const nodeEntries = ["strip-types", "worker-bootstrap"].map((name) =>
  join(root, "src", `${name}.ts`)
);

for (const [entrypoints, target] of [[bunEntries, "bun"], [nodeEntries, "node"]] as const) {
  const result = await Bun.build({
    entrypoints: [...entrypoints],
    outdir,
    target,
    format: "esm",
    naming: "[name].js",
    minify: false,
    sourcemap: "external"
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

console.log(`兼容层已构建到 ${outdir}`);
