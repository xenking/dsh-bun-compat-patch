import { parentPort, workerData } from "node:worker_threads";

console.log("标准输出");
console.error("标准错误");
parentPort?.on("message", (value) => {
  parentPort.postMessage({ value, hello: (workerData as { hello: string }).hello });
  process.exit(0);
});
