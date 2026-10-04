import { describe, expect, it } from "bun:test";
import { stripTypeScriptTypes } from "../src/node-module.ts";
import { findWorkspaceRoot, prepareInPlacePatches, restorePatch, patchHmrGuards } from "../src/shadow.ts";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

describe("stripTypeScriptTypes (Bun shim)", () => {
  it("strips variable type annotations", () => {
    const code = "const x: number = 42;";
    const stripped = stripTypeScriptTypes(code);
    expect(stripped.trim()).toBe("const x = 42;");
  });

  it("strips interfaces, type aliases, and return types", () => {
    const code = `
interface User {
  id: string;
  count: number;
}
type UserId = string;
function getCount(user: User): number {
  return user.count;
}
`;
    const stripped = stripTypeScriptTypes(code);
    expect(stripped.includes("interface User")).toBe(false);
    expect(stripped.includes("type UserId")).toBe(false);
    expect(stripped.includes(": number")).toBe(false);
    expect(stripped.includes("function getCount(user)")).toBe(true);
  });

  it("throws SyntaxError on malformed TypeScript syntax", () => {
    expect(() => {
      stripTypeScriptTypes("const x: = ;");
    }).toThrow(SyntaxError);
  });

  it("supports sourceUrl option", () => {
    const code = "const a: string = 'hello';";
    const stripped = stripTypeScriptTypes(code, { sourceUrl: "test.ts" });
    expect(stripped.includes("//# sourceURL=test.ts")).toBe(true);
  });

  it("emulates node:module stripTypeScriptTypes exactly as expected by PTC runtime", () => {
    const STRIP_PREFIX = "async function* _ptc_main() {\n";
    const STRIP_SUFFIX = "\n}";
    const program = "const x: number = 10;\nreturn x * 2;";
    const stripped = stripTypeScriptTypes(STRIP_PREFIX + program + STRIP_SUFFIX);
    const data = {
      code: stripped.slice(STRIP_PREFIX.length, stripped.length - STRIP_SUFFIX.length),
    };
    expect(data.code).toContain("const x = 10;");
    expect(data.code).toContain("return x * 2;");
  });
});
describe("shadow in-place patcher & restorer", () => {
  it("finds workspace root containing @deepseek-ai/dsh", () => {
    const root = findWorkspaceRoot("/Users/xenking/Projects/playground/dsh-test");
    expect(root).toBe("/Users/xenking/Projects/playground/dsh-test");
  });

  it("patches runtime files and restores them cleanly", () => {
    const dummyDir = join(tmpdir(), `dsh-patch-test-${Date.now()}`);
    mkdirSync(join(dummyDir, "node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib"), { recursive: true });
    mkdirSync(join(dummyDir, "node_modules/@deepseek-ai/dsh-app-boot/lib"), { recursive: true });

    const ptcFile = join(dummyDir, "node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/index.js");
    const originalPtcContent = 'import { stripTypeScriptTypes } from "node:module";\nconsole.log(42);';
    writeFileSync(ptcFile, originalPtcContent);

    const bootFile = join(dummyDir, "node_modules/@deepseek-ai/dsh-app-boot/lib/index.js");
    const originalBootContent = 'const interception = installRuntimeInterception(config.resolution);\nconsole.log(boot);';
    writeFileSync(bootFile, originalBootContent);

    const compatLib = join(import.meta.dir, "../lib");

    // Apply patches
    const patches = prepareInPlacePatches(dummyDir, compatLib);
    expect(patches.length).toBe(2);

    const patchedPtc = readFileSync(ptcFile, "utf8");
    expect(patchedPtc.includes("// @dsh-bun-compat-patch")).toBe(true);
    expect(patchedPtc.includes("node-module.js")).toBe(true);

    const patchedBoot = readFileSync(bootFile, "utf8");
    expect(patchedBoot.includes("// @dsh-bun-compat-patch")).toBe(true);
    expect(patchedBoot.includes("catch {}")).toBe(true);

    // Restore patches
    for (const patch of patches) {
      restorePatch(patch);
    }

    expect(readFileSync(ptcFile, "utf8")).toBe(originalPtcContent);
    expect(readFileSync(bootFile, "utf8")).toBe(originalBootContent);

    rmSync(dummyDir, { recursive: true, force: true });
  });
});

describe("DSH under Bun E2E", () => {
  const dshBin = "/Users/xenking/Projects/playground/dsh-test/node_modules/@deepseek-ai/dsh/lib/bin.js";
  const preloadPath = join(import.meta.dir, "../lib/preload.js");

  it("prints version correctly through bun --preload", async () => {
    const proc = Bun.spawn([process.execPath, "--preload", preloadPath, dshBin, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(out.trim()).toMatch(/^0\.2\./);
  });

  it("boots headless profile help cleanly", async () => {
    const proc = Bun.spawn([process.execPath, "--preload", preloadPath, dshBin, "headless", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(out).toContain("Answer one task and exit");
  });

  it("boots web profile help cleanly", async () => {
    const proc = Bun.spawn([process.execPath, "--preload", preloadPath, dshBin, "web", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(out).toContain("Serve the DeepSeek Harness browser UI");
  });

  it("leaves target node_modules restored after process termination", () => {
    const ptcFile = "/Users/xenking/Projects/playground/dsh-test/node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/index.js";
    if (existsSync(ptcFile)) {
      const content = readFileSync(ptcFile, "utf8");
      expect(content.includes("// @dsh-bun-compat-patch")).toBe(false);
    }
  });
});
