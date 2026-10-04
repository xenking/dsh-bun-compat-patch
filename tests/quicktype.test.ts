import { describe, expect, it } from "bun:test";
import {
  compileJsonSchemaToTypes,
  renderToolsSdkWithQuicktype,
} from "../src/quicktype-generator.ts";

describe("quicktype tool bindings generator", () => {
  it("compiles simple JSON schema to named interface", async () => {
    const schema = {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "integer" },
      },
      required: ["query"],
    };

    const res = await compileJsonSchemaToTypes("SearchArgs", schema);
    expect(res.typeName).toBe("SearchArgs");
    expect(res.code).toContain("interface SearchArgs");
    expect(res.code).toContain("query: string;");
    expect(res.code).toContain("limit?: number;");
  });

  it("handles complex MCP schemas with definitions and $ref", async () => {
    const mcpSchema = {
      type: "object",
      properties: {
        filter: { $ref: "#/definitions/FilterSpec" },
      },
      definitions: {
        FilterSpec: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["active", "closed"] },
          },
          required: ["status"],
        },
      },
    };

    const res = await compileJsonSchemaToTypes("ListIssuesArgs", mcpSchema);
    expect(res.typeName).toBe("ListIssuesArgs");
    expect(res.code).toContain("filter?: FilterSpec;");
    expect(res.code).toContain("interface FilterSpec");
    expect(res.code).toContain("status: Status;");
    expect(res.code).toContain('type Status = "active" | "closed";');
  });

  it("renders complete tools SDK with multiple tools and cached repeat calls", async () => {
    const tools = [
      {
        name: "search_db",
        description: "Search the database",
        parameters: {
          type: "object",
          properties: { term: { type: "string" } },
          required: ["term"],
        },
        output: {
          type: "object",
          properties: { count: { type: "number" } },
        },
      },
      {
        name: "execute_sql",
        description: "Run SQL query",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        output: {
          type: "object",
          properties: { rows: { type: "array", items: { type: "string" } } },
        },
      },
    ];

    const sdk = await renderToolsSdkWithQuicktype(tools);
    expect(sdk).toContain("interface SearchDBArgs");
    expect(sdk).toContain("interface SearchDBResult");
    expect(sdk).toContain("interface ExecuteSQLArgs");
    expect(sdk).toContain("interface ExecuteSQLResult");
    expect(sdk).toContain("interface ToolArgsMap");
    expect(sdk).toContain("interface ToolOutputMap");
    expect(sdk).toContain("declare const tools:");

    // Cached execution should be instantaneous
    const start = performance.now();
    const sdkCached = await renderToolsSdkWithQuicktype(tools);
    const elapsed = performance.now() - start;
    expect(sdkCached).toBe(sdk);
    expect(elapsed).toBeLessThan(10);
  });
});
