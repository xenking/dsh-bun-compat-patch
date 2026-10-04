import {
  quicktype,
  InputData,
  JSONSchemaInput,
  FetchingJSONSchemaStore,
} from "quicktype-core";

export interface ToolSchemaEntry {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

const typeCache = new Map<string, { typeName: string; code: string }>();

function toPascalCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export async function compileJsonSchemaToTypes(
  rootName: string,
  schema: Record<string, unknown>,
): Promise<{ typeName: string; code: string }> {
  const cacheKey = `${rootName}:${JSON.stringify(schema)}`;
  const cached = typeCache.get(cacheKey);
  if (cached) return cached;

  const sanitizedRoot = toPascalCase(rootName) || "Anonymous";
  const normalizedSchema: Record<string, unknown> = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: sanitizedRoot,
    ...schema,
  };

  try {
    const schemaInput = new JSONSchemaInput(new FetchingJSONSchemaStore());
    await schemaInput.addSource({
      name: sanitizedRoot,
      schema: JSON.stringify(normalizedSchema),
    });

    const inputData = new InputData();
    inputData.addInput(schemaInput);

    const result = await quicktype({
      inputData,
      lang: "typescript",
      rendererOptions: {
        "just-types": "true",
        "explicit-unions": "true",
      },
    });

    const code = result.lines
      .join("\n")
      .trim()
      .replace(/^export\s+/gm, "");

    const rootMatch = code.match(/^(?:interface|type)\s+([A-Za-z0-9_$]+)/m);
    const actualTypeName = rootMatch ? rootMatch[1] : sanitizedRoot;

    const entry = { typeName: actualTypeName, code };
    typeCache.set(cacheKey, entry);
    return entry;
  } catch {
    const fallbackCode = `interface ${sanitizedRoot} {\n  [key: string]: unknown;\n}`;
    const fallbackEntry = { typeName: sanitizedRoot, code: fallbackCode };
    typeCache.set(cacheKey, fallbackEntry);
    return fallbackEntry;
  }
}

export async function renderToolsSdkWithQuicktype(
  schemas: ToolSchemaEntry[],
): Promise<string> {
  const sorted = [...schemas].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  const typeDeclarations: string[] = [];
  const argsMapMembers: string[] = [];
  const outputMapMembers: string[] = [];

  for (const tool of sorted) {
    const toolPascal = toPascalCase(tool.name) || "Tool";

    // Arguments type
    const argsTypeInfo = await compileJsonSchemaToTypes(
      `${toolPascal}Args`,
      tool.parameters ?? { type: "object" },
    );
    typeDeclarations.push(argsTypeInfo.code);

    // Output type
    const outputTypeInfo = await compileJsonSchemaToTypes(
      `${toolPascal}Result`,
      tool.output ?? { type: "object" },
    );
    typeDeclarations.push(outputTypeInfo.code);

    const doc = tool.description
      ? `  /** ${tool.description.replace(/\s+/g, " ").trim()} */\n`
      : "";
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tool.name)
      ? tool.name
      : JSON.stringify(tool.name);

    argsMapMembers.push(`${doc}  ${key}: ${argsTypeInfo.typeName};`);
    outputMapMembers.push(`${doc}  ${key}: ${outputTypeInfo.typeName};`);
  }

  const combinedTypes = typeDeclarations.join("\n\n");

  const sdk = `
// --- Generated Native TypeScript Bindings (quicktype) ---
${combinedTypes}

interface ToolArgsMap {
${argsMapMembers.join("\n")}
}

interface ToolOutputMap {
${outputMapMembers.join("\n")}
}

type ToolName = keyof ToolOutputMap;

declare class ToolCallError extends Error {
  readonly name: "ToolCallError";
  readonly toolName: ToolName;
}

declare const tools: {
  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;
};
`.trim();

  return sdk;
}
