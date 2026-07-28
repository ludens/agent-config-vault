import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadAdapters,
  parseAdapterToml,
  resolveAdapter,
} from "../src/adapters/load.js";

const packageRoot = path.resolve(import.meta.dirname, "../../..");

describe("adapters", () => {
  it("loads default adapter tomls", () => {
    const list = loadAdapters(path.join(packageRoot, "adapters"));
    const ids = list.map((a) => a.id).sort();
    expect(ids).toEqual([
      "claude-code",
      "codex",
      "grok",
      "opencode",
      "pi",
    ]);
  });

  it("resolveAdapter expands homeOverride", () => {
    const raw = parseAdapterToml(`
id = "t"
displayName = "T"
home = "~/.tool"
[categories.agents_md]
enabled = true
source = "AGENTS.md"
target = "AGENTS.md"
`);
    const home = "/tmp/fake-home-xyz";
    const vaultAgent = "/vault/agents/t";
    const r = resolveAdapter(raw, {
      homeOverride: home,
      vaultAgentDir: vaultAgent,
    });
    expect(r.homePath).toBe(path.join(home, ".tool"));
    expect(r.categories.agents_md?.sourcePath).toBe(
      path.join(vaultAgent, "AGENTS.md"),
    );
    expect(r.categories.agents_md?.targetPath).toBe(
      path.join(home, ".tool", "AGENTS.md"),
    );
  });

  it("parses enabled flags", () => {
    const list = loadAdapters(path.join(packageRoot, "adapters"));
    const grok = list.find((a) => a.id === "grok")!;
    expect(grok.categories.agents_md?.enabled).toBe(true);
    expect(grok.categories.mcp?.enabled).toBe(false);
    const codex = list.find((a) => a.id === "codex")!;
    expect(codex.categories.mcp?.enabled).toBe(true);
    expect(codex.categories.agents_md?.enabled).toBe(false);
  });
});
