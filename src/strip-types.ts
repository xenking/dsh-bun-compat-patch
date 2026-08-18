import { stripTypeScriptTypes } from "node:module";

const options = JSON.parse(Buffer.from(process.argv[2], "base64").toString());
let code = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { code += chunk; });
process.stdin.on("end", () => {
  try {
    process.stdout.write(stripTypeScriptTypes(code, options));
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
});
