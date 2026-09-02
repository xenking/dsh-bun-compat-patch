import {Transpiler} from "bun";

const transpiler = new Transpiler({ loader: "ts" });

/**
 * Strip TypeScript type annotations from source code.
 * Mirrors `node:module.stripTypeScriptTypes` for environments that lack it.
 */
export function stripTypeScriptTypes(code: string, options: { sourceUrl?: string } = {}): string {
  if (typeof code !== "string") throw new TypeError("code must be a string");
  const stripped = (() => {
    try {
      return transpiler.transformSync(code);
    } catch (error) {
      throw new SyntaxError(error instanceof Error ? error.message : String(error));
    }
  })();
  return options.sourceUrl ? `${stripped}\n//# sourceURL=${options.sourceUrl}` : stripped;
}