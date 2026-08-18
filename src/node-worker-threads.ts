import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import type { BridgeFrame, EventLoopUtilization, WorkerOptions } from "./types.js";

class ReadableBridge extends EventEmitter {
  readable = true;
  readableEnded = false;

  end(): void {
    if (this.readableEnded) return;
    this.readableEnded = true;
    this.readable = false;
    this.emit("end");
  }
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

export class Worker extends EventEmitter {
  readonly stdout = new ReadableBridge();
  readonly stderr = new ReadableBridge();
  readonly performance: { eventLoopUtilization: (previous?: EventLoopUtilization) => EventLoopUtilization };
  private readonly process: ReturnType<typeof Bun.spawn>;
  private lastElu: EventLoopUtilization = { idle: 0, active: 0, utilization: 0 };
  private requestId = 0;

  constructor(filename: string | URL, options: WorkerOptions = {}) {
    super();
    this.performance = {
      eventLoopUtilization: (previous) => {
        this.send({ t: "elu", id: ++this.requestId, previous: previous ?? null });
        return this.lastElu;
      }
    };
    const target = filename instanceof URL ? fileURLToPath(filename) : filename;
    const bootstrap = fileURLToPath(new URL("./worker-bootstrap.js", import.meta.url));
    this.process = Bun.spawn(["node", bootstrap, target, encode({
      workerData: options.workerData,
      resourceLimits: options.resourceLimits,
      env: options.env,
      execArgv: options.execArgv
    })], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    void this.read(this.process.stdout, true);
    void this.read(this.process.stderr, false);
    void this.process.exited.then((code) => {
      this.stdout.end();
      this.stderr.end();
      this.emit("exit", code);
    });
  }

  postMessage(value: unknown): void { this.send({ t: "post", d: value }); }

  terminate(): unknown {
    this.send({ t: "terminate" });
    return this.process.kill();
  }

  private send(value: unknown): void {
    try { this.process.stdin.write(`${JSON.stringify(value)}\n`); } catch {}
  }

  private async read(stream: ReadableStream<Uint8Array> | number | undefined, control: boolean): Promise<void> {
    if (!stream || typeof stream === "number") return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) if (line) this.handleFrame(line, control);
    }
    if (pending) this.handleFrame(pending, control);
  }

  private handleFrame(line: string, control: boolean): void {
    if (!control) {
      this.stderr.emit("data", Buffer.from(`${line}\n`));
      return;
    }
    let frame: BridgeFrame;
    try { frame = JSON.parse(line) as BridgeFrame; }
    catch {
      this.stderr.emit("data", Buffer.from(`${line}\n`));
      return;
    }
    if (frame.t === "message") this.emit("message", frame.d);
    else if (frame.t === "stdout" || frame.t === "stderr") {
      this[frame.t].emit("data", Buffer.from(String(frame.d), "base64"));
    } else if (frame.t === "elu") this.lastElu = frame.d as EventLoopUtilization;
    else if (frame.t === "error") {
      this.emit("error", Object.assign(new Error(frame.message), { stack: frame.stack }));
    }
  }
}

export const workerData = null;
export const parentPort = null;
export class MessagePort {}
export class MessageChannel {
  constructor() { throw new Error("dsh-bun-compat-patch 尚未实现 MessageChannel"); }
}
