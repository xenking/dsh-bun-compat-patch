import { describe, expect, it } from "bun:test";
import { LazyMcpManager } from "../src/lazy-mcp.ts";

describe("lazy-mcp manager", () => {
  it("keeps servers inert until explicitly acquired", async () => {
    const mgr = new LazyMcpManager();

    mgr.registerServer(
      {
        name: "test-echo",
        command: "cat",
      },
      [
        {
          name: "echo_tool",
          serverName: "test-echo",
          description: "echo tool",
        },
      ],
    );

    expect(mgr.isServerActive("test-echo")).toBe(false);
    expect(mgr.listTools().length).toBe(1);
    expect(mgr.getTool("echo_tool")?.name).toBe("echo_tool");

    // Acquire starts process
    const proc = await mgr.acquireServerProcess("test-echo");
    expect(mgr.isServerActive("test-echo")).toBe(true);
    expect(proc.pid).toBeGreaterThan(0);

    // Release stops process
    mgr.releaseServerProcess("test-echo");
    expect(mgr.isServerActive("test-echo")).toBe(false);
  });
});
