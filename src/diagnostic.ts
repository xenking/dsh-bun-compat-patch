if (process.env.DSH_BUN_COMPAT_DEBUG) {
  /**
   * Print an indented tree of related errors (cause chain + aggregated `errors[]`)
   * to stderr. `seen` guards against cycles when an error references itself.
   */
  const printError = (value: unknown, depth: number, seen: Set<object>): void => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const error = value as Error & { errors?: unknown[]; cause?: unknown };
    console.error(`${"  ".repeat(depth)}${error.name || value.constructor.name}: ${error.message || String(value)}`);
    if (Array.isArray(error.errors)) for (const child of error.errors) printError(child, depth + 1, seen);
    if (error.cause) printError(error.cause, depth + 1, seen);
  };
  process.on("uncaughtExceptionMonitor", (error) => {
    console.error("\n[dsh-bun-compat-patch] uncaught error tree:");
    printError(error, 0, new Set());
  });
}