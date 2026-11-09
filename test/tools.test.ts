import { TOOLS } from "../src/tools.js";

/**
 * Guard for the tool-registry invariants (odd/tasks/mcp-local.md):
 * - unique tool names (a duplicate would shadow a tool silently);
 * - exactly one destructive tool (`cfdi_download` — the only side-effect);
 * - every other tool is read-only (matches the Claude Directory annotations).
 */

describe("tool registry", () => {
  test("all tool names are unique", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("exactly one destructive tool: cfdi_download", () => {
    const destructive = TOOLS.filter((t) => t.annotations.destructiveHint).map(
      (t) => t.name,
    );
    expect(destructive).toEqual(["cfdi_download"]);
  });

  test("every non-destructive tool is read-only", () => {
    const nonDestructive = TOOLS.filter((t) => !t.annotations.destructiveHint);
    const missingReadOnly = nonDestructive
      .filter((t) => !t.annotations.readOnlyHint)
      .map((t) => t.name);
    expect(missingReadOnly).toEqual([]);
  });

  test("registry exposes the 15 expected tools", () => {
    expect(TOOLS.length).toBe(15);
  });
});
