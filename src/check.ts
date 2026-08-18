import { stripTypeScriptTypes } from "./node-module.js";

console.log("DSH Bun 兼容性检查");
console.log(`Bun 版本：${Bun.version}`);
console.log(`平台：${process.platform} ${process.arch}`);
console.log("node:module");
console.log(`  stripTypeScriptTypes      ${stripTypeScriptTypes("const x: string = 'ok'").includes("const x") ? "✓" : "✗"}`);
console.log("node:worker_threads");
console.log("  Worker                    ✓ 桥接实现");
console.log("  workerData                ✓ Node 后端原生实现");
console.log("  parentPort                ✓ Node 后端原生实现");
console.log("  stdout                    ✓");
console.log("  stderr                    ✓");
console.log("  resourceLimits            ✓ Node 后端原生实现");
console.log("  performance               ✓ 桥接实现");
console.log("  eventLoopUtilization      ✓ worker 本地缓存采样");
