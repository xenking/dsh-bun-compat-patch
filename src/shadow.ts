import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function findWorkspaceRoot(start: string): string {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, "node_modules/@deepseek-ai/dsh/package.json"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("找不到包含 @deepseek-ai/dsh 的项目根目录");
    current = parent;
  }
}

export function prepareShadow(root: string, compatLib: string): string {
  const cache = mkdtempSync(join(tmpdir(), "dsh-bun-compat-patch-"));
  try {
    mkdirSync(join(cache, "node_modules/@deepseek-ai"), { recursive: true });
    const nodeModules = join(root, "node_modules");
    for (const name of readdirSync(nodeModules)) {
      if (name !== "@deepseek-ai") link(join(nodeModules, name), join(cache, "node_modules", name));
    }
    const copied = new Set(["dsh", "dsh-app-boot", "cordis-plugin-loader", "dsh-code-runtime-worker-thread"]);
    for (const name of readdirSync(join(nodeModules, "@deepseek-ai"))) {
      if (!copied.has(name)) link(join(nodeModules, "@deepseek-ai", name), join(cache, "node_modules/@deepseek-ai", name));
    }
    for (const name of copied) {
      cpSync(join(nodeModules, "@deepseek-ai", name), join(cache, "node_modules/@deepseek-ai", name), {
        recursive: true,
        dereference: true
      });
    }

    const runtime = join(cache, "node_modules/@deepseek-ai/dsh-code-runtime-worker-thread/lib/index.js");
    const nodeModuleUrl = pathToFileURL(join(compatLib, "node-module.js")).href;
    const workerThreadsUrl = pathToFileURL(join(compatLib, "node-worker-threads.js")).href;
    const runtimeSource = readFileSync(runtime, "utf8")
      .replaceAll('from "node:module"', `from ${JSON.stringify(nodeModuleUrl)}`)
      .replaceAll('from "node:worker_threads"', `from ${JSON.stringify(workerThreadsUrl)}`);
    writeFileSync(runtime, runtimeSource);

    const dshLib = join(cache, "node_modules/@deepseek-ai/dsh/lib");
    for (const name of readdirSync(dshLib)) {
      if (!name.startsWith("profile-boot-") || !name.endsWith(".js")) continue;
      const path = join(dshLib, name);
      const source = readFileSync(path, "utf8");
      if (!source.includes("const ctx = await boot(")) continue;
      const patched = source
        .replace("\n\t});\n\tapp.current = ctx;", "\n\t}, INSTALL_ANCHOR);\n\tapp.current = ctx;")
        .replace(
          'if (!signalShutdown.signal.aborted && ctx.fiber.state === 2 && ctx.get("loader") !== void 0) try {',
          'if (!process.env.DSH_BUN_COMPAT_DISABLE_HMR && !signalShutdown.signal.aborted && ctx.fiber.state === 2 && ctx.get("loader") !== void 0) try {'
        );
      if (patched === source) throw new Error(`启动锚点转换没有匹配文件：${name}`);
      writeFileSync(path, patched);
    }
    return cache;
  } catch (error) {
    rmSync(cache, { recursive: true, force: true });
    throw error;
  }
}

function link(target: string, path: string): void {
  try { symlinkSync(target, path, "junction"); } catch {}
}
