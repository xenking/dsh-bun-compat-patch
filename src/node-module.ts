import { fileURLToPath } from "node:url";

export interface StripTypeScriptOptions {
  mode?: "strip" | "transform";
  sourceUrl?: string;
  sourceMap?: boolean;
}

export function stripTypeScriptTypes(code: string, options: StripTypeScriptOptions = {}): string {
  if (typeof code !== "string") throw new TypeError("code 必须是字符串");
  const helper = fileURLToPath(new URL("./strip-types.js", import.meta.url));
  const encodedOptions = Buffer.from(JSON.stringify(options)).toString("base64");
  const result = Bun.spawnSync(["node", helper, encodedOptions], {
    stdin: Buffer.from(code),
    stdout: "pipe",
    stderr: "pipe"
  });
  if (result.exitCode !== 0) {
    const detail = result.stderr.toString().trim();
    const error = new SyntaxError(detail || "stripTypeScriptTypes 执行失败");
    Object.assign(error, { code: "ERR_INVALID_TYPESCRIPT_SYNTAX" });
    throw error;
  }
  return result.stdout.toString();
}
