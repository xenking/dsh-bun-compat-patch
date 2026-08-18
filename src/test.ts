import { strict as assert } from "node:assert";
import { dirname, join, resolve } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { stripTypeScriptTypes } from "./node-module.js";
import { Worker } from "./node-worker-threads.js";
import { findWorkspaceRoot, prepareShadow } from "./shadow.js";

const typed = "async function wrap() {\nconst x: string = 'hello';\n}";
const stripped = stripTypeScriptTypes(typed);
assert.equal(stripped.length, typed.length);
assert.match(stripped, /const x\s+= 'hello'/);

const worker = new Worker(new URL("./test-worker.js", import.meta.url), {
  workerData: { hello: "world" },
  stdout: true,
  stderr: true
});
const messages: unknown[] = [];
let stdout = "";
let stderr = "";
worker.on("message", (message) => messages.push(message));
worker.stdout.on("data", (data) => { stdout += data; });
worker.stderr.on("data", (data) => { stderr += data; });
worker.postMessage("ping");
await new Promise<void>((resolvePromise, reject) => {
  worker.on("error", reject);
  worker.on("exit", () => resolvePromise());
});
assert.deepEqual(messages, [{ value: "ping", hello: "world" }]);
assert.match(stdout, /标准输出/);
assert.match(stderr, /标准错误/);
assert.equal(typeof worker.performance.eventLoopUtilization().utilization, "number");

const packageRoot = resolve(import.meta.dir, "..");
const root = findWorkspaceRoot(packageRoot);
const cache = prepareShadow(root, packageRoot);
const bootFile = join(cache, "node_modules/@deepseek-ai/dsh/lib/profile-boot-DG5t9aNs.js");
const bootSource = await Bun.file(bootFile).text();
assert.match(bootSource, /}, INSTALL_ANCHOR\);/);
assert.match(bootSource, /DSH_BUN_COMPAT_DISABLE_HMR/);
const runtimePath = join(cache, "node_modules/@deepseek-ai/dsh-code-runtime-worker-thread/lib/index.js");
const { default: Runtime } = await import(runtimePath);
const context = new Context();
await context.plugin(Runtime, {
  computeMs: 1000,
  maxWallMs: 3000,
  maxOutputBytes: 10000,
  maxOldGenerationSizeMb: 64
});
const result = await context.codeRuntime.run({
  program: 'console.log("runtime"); return 2 as number;',
  bindings: []
});
assert.deepEqual(result, { logs: ["runtime"], value: 2 });
await context.fiber.dispose();

const limited = new Worker(new URL("./memory-worker.js", import.meta.url), {
  resourceLimits: { maxOldGenerationSizeMb: 8 }
});
const limitOutcome = await Promise.race([
  new Promise<string>((resolvePromise) => {
    limited.once("error", () => resolvePromise("error"));
    limited.once("exit", () => resolvePromise("exit"));
  }),
  new Promise<string>((resolvePromise) => setTimeout(() => resolvePromise("timeout"), 10000))
]);
if (limitOutcome === "timeout") limited.terminate();
assert.notEqual(limitOutcome, "timeout", "Node worker 内存限制未能终止持续分配");
console.log("兼容层测试全部通过");
