import { stripTypeScriptTypes } from "./node-module.ts";

export interface KernelExecutionResult {
  value: unknown;
  logs: string[];
  durationMs: number;
  error?: string;
}

export class PersistentKernel {
  private scope: Record<string, unknown> = {};

  constructor(initialBindings: Record<string, unknown> = {}) {
    this.scope = { ...initialBindings };
  }

  set(key: string, value: unknown): void {
    this.scope[key] = value;
  }

  get(key: string): unknown {
    return this.scope[key];
  }

  clear(): void {
    this.scope = {};
  }

  async run(code: string, bindings: Record<string, unknown> = {}): Promise<KernelExecutionResult> {
    const start = performance.now();
    const logs: string[] = [];

    // Local custom console to capture logs
    const customConsole = {
      log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      error: (...args: unknown[]) => logs.push("[error] " + args.map(String).join(" ")),
      warn: (...args: unknown[]) => logs.push("[warn] " + args.map(String).join(" ")),
      info: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
    };

    // Merge scope with ephemeral bindings
    const executionScope = {
      ...this.scope,
      ...bindings,
      console: customConsole,
    };

    // Strip TypeScript annotations if any
    const jsCode = stripTypeScriptTypes(code);

    const keys = Object.keys(executionScope);
    const values = Object.values(executionScope);

    try {
      const isStatement = /^\s*(?:throw|const|let|var|if|for|while|try|class|function)\b/.test(jsCode);
      const executionBody = jsCode.includes("return ") || isStatement ? jsCode : `return (${jsCode});`;
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction("__scope", ...keys, `
        return (async () => {
          ${executionBody}
        })();
      `);
      const result = await fn(executionScope, ...values);
      const durationMs = performance.now() - start;

      return {
        value: result,
        logs,
        durationMs,
      };
    } catch (err) {
      const durationMs = performance.now() - start;
      return {
        value: undefined,
        logs,
        durationMs,
        error: (err as Error).message,
      };
    }
  }
}
