import {mkdirSync, rmSync} from "node:fs";
import {join} from "node:path";

const root = import.meta.dir;
const outdir = join(root, "lib");
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [
    join(root, "src/preload.ts"),
    join(root, "src/node-module.ts"),
    join(root, "src/quicktype-generator.ts"),
  ],
  outdir,
  target: "bun",
  format: "esm",
  naming: "[name].js",
  minify: false,
  sourcemap: "external",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`compat layer built to ${outdir}`);