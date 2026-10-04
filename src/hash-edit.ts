import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export class StaleFileError extends Error {
  readonly path: string;
  readonly expectedDigest?: string;
  readonly actualDigest: string;

  constructor(path: string, actualDigest: string, expectedDigest?: string) {
    super(
      `File ${path} was modified concurrently (current sha256: ${actualDigest}${expectedDigest ? `, expected: ${expectedDigest}` : ""}). Re-read before editing.`,
    );
    this.name = "StaleFileError";
    this.path = path;
    this.actualDigest = actualDigest;
    this.expectedDigest = expectedDigest;
  }
}

export function lineHash(line: string): string {
  return createHash("sha256").update(line).digest("hex").slice(0, 4).toUpperCase();
}

export function fileDigest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface HashEditOperation {
  /** 1-based start line */
  startLine: number;
  /** 1-based end line (inclusive) */
  endLine: number;
  /** Expected 4-hex hashes of lines being replaced (optional validation) */
  expectedHashes?: string[];
  /** New lines to replace the range with */
  replacement: string[];
}

export interface HashEditResult {
  path: string;
  previousDigest: string;
  newDigest: string;
  linesTotal: number;
}

export function applyHashEdit(
  filePath: string,
  operations: HashEditOperation[],
  options: { expectedFileDigest?: string } = {},
): HashEditResult {
  if (!existsSync(filePath)) {
    throw new Error(`Target file does not exist: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf8");
  const currentDigest = fileDigest(content);

  if (options.expectedFileDigest && currentDigest !== options.expectedFileDigest) {
    throw new StaleFileError(filePath, currentDigest, options.expectedFileDigest);
  }

  const lines = content.split("\n");

  // Validate all operations first
  const sortedOps = [...operations].sort((a, b) => b.startLine - a.startLine);

  for (const op of sortedOps) {
    if (op.startLine < 1 || op.startLine > lines.length) {
      throw new Error(`Invalid start line: ${op.startLine} (file has ${lines.length} lines)`);
    }
    if (op.endLine < op.startLine || op.endLine > lines.length) {
      throw new Error(`Invalid end line: ${op.endLine} (file has ${lines.length} lines)`);
    }

    if (op.expectedHashes && op.expectedHashes.length > 0) {
      const sliceLength = op.endLine - op.startLine + 1;
      if (op.expectedHashes.length !== sliceLength) {
        throw new Error(`Expected hashes count (${op.expectedHashes.length}) doesn't match line count (${sliceLength})`);
      }
      for (let i = 0; i < sliceLength; i++) {
        const actualHash = lineHash(lines[op.startLine - 1 + i]);
        const expected = op.expectedHashes[i];
        if (actualHash !== expected) {
          throw new StaleFileError(
            filePath,
            currentDigest,
            `Line ${op.startLine + i} hash mismatch: actual ${actualHash}, expected ${expected}`,
          );
        }
      }
    }
  }

  // Apply operations from bottom to top to preserve line indices
  for (const op of sortedOps) {
    const startIndex = op.startLine - 1;
    const deleteCount = op.endLine - op.startLine + 1;
    lines.splice(startIndex, deleteCount, ...op.replacement);
  }

  const newContent = lines.join("\n");
  const newDigest = fileDigest(newContent);

  // Atomic write via temp file
  const tmpPath = join(dirname(filePath), `.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    writeFileSync(tmpPath, newContent, "utf8");
    renameSync(tmpPath, filePath);
  } catch (err) {
    if (existsSync(tmpPath)) {
      try { unlinkSync(tmpPath); } catch {}
    }
    throw err;
  }

  return {
    path: filePath,
    previousDigest: currentDigest,
    newDigest,
    linesTotal: lines.length,
  };
}
