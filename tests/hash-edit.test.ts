import { describe, expect, it } from "bun:test";
import { applyHashEdit, lineHash, fileDigest, StaleFileError } from "../src/hash-edit.ts";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("hash_edit (stale-safe file editing)", () => {
  it("applies line replacement with hash verification", () => {
    const tmp = join(tmpdir(), `test-edit-${Date.now()}.ts`);
    const initial = ["function hello(): void {", "  console.log('old');", "}"].join("\n");
    writeFileSync(tmp, initial);

    const oldLineHash = lineHash("  console.log('old');");

    const result = applyHashEdit(tmp, [
      {
        startLine: 2,
        endLine: 2,
        expectedHashes: [oldLineHash],
        replacement: ["  console.log('new');", "  return;"],
      },
    ]);

    const updated = readFileSync(tmp, "utf8");
    expect(updated).toBe(["function hello(): void {", "  console.log('new');", "  return;", "}"].join("\n"));
    expect(result.linesTotal).toBe(4);

    rmSync(tmp, { force: true });
  });

  it("throws StaleFileError when file digest mismatches expectedFileDigest", () => {
    const tmp = join(tmpdir(), `test-edit-stale-${Date.now()}.ts`);
    writeFileSync(tmp, "const a = 1;");

    expect(() => {
      applyHashEdit(tmp, [{ startLine: 1, endLine: 1, replacement: ["const a = 2;"] }], {
        expectedFileDigest: "0000000000000000000000000000000000000000000000000000000000000000",
      });
    }).toThrow(StaleFileError);

    rmSync(tmp, { force: true });
  });

  it("throws StaleFileError when line hash mismatches", () => {
    const tmp = join(tmpdir(), `test-edit-line-${Date.now()}.ts`);
    writeFileSync(tmp, "const a = 1;\nconst b = 2;");

    expect(() => {
      applyHashEdit(tmp, [
        {
          startLine: 2,
          endLine: 2,
          expectedHashes: ["FFFF"], // invalid hash
          replacement: ["const b = 3;"],
        },
      ]);
    }).toThrow(StaleFileError);

    rmSync(tmp, { force: true });
  });
});
