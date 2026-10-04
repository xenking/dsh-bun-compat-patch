import type { Subprocess } from "bun";

export interface LazyMcpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  idleTimeoutMs?: number;
}

export interface LazyMcpToolMeta {
  name: string;
  serverName: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class LazyMcpManager {
  private servers = new Map<string, LazyMcpServerConfig>();
  private activeProcesses = new Map<string, { proc: Subprocess; lastUsed: number }>();
  private tools = new Map<string, LazyMcpToolMeta>();

  registerServer(config: LazyMcpServerConfig, cachedTools: LazyMcpToolMeta[] = []): void {
    this.servers.set(config.name, config);
    for (const tool of cachedTools) {
      this.tools.set(tool.name, { ...tool, serverName: config.name });
    }
  }

  getTool(toolName: string): LazyMcpToolMeta | undefined {
    return this.tools.get(toolName);
  }

  listTools(): LazyMcpToolMeta[] {
    return Array.from(this.tools.values());
  }

  isServerActive(serverName: string): boolean {
    const entry = this.activeProcesses.get(serverName);
    return entry !== undefined && !entry.proc.killed;
  }

  async acquireServerProcess(serverName: string): Promise<Subprocess> {
    const existing = this.activeProcesses.get(serverName);
    if (existing && !existing.proc.killed) {
      existing.lastUsed = Date.now();
      return existing.proc;
    }

    const config = this.servers.get(serverName);
    if (!config) {
      throw new Error(`MCP server "${serverName}" is not registered`);
    }

    const proc = Bun.spawn([config.command, ...(config.args ?? [])], {
      cwd: config.cwd,
      env: { ...process.env, ...(config.env ?? {}) },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    this.activeProcesses.set(serverName, { proc, lastUsed: Date.now() });
    return proc;
  }

  releaseServerProcess(serverName: string): void {
    const existing = this.activeProcesses.get(serverName);
    if (existing) {
      try {
        existing.proc.kill();
      } catch {}
      this.activeProcesses.delete(serverName);
    }
  }

  reapIdle(maxIdleMs = 60000): number {
    const now = Date.now();
    let reaped = 0;
    for (const [name, entry] of this.activeProcesses.entries()) {
      if (now - entry.lastUsed > maxIdleMs) {
        try {
          entry.proc.kill();
        } catch {}
        this.activeProcesses.delete(name);
        reaped++;
      }
    }
    return reaped;
  }

  dispose(): void {
    for (const [name] of this.activeProcesses) {
      this.releaseServerProcess(name);
    }
  }
}
