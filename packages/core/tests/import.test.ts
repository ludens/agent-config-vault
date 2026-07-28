import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAdapter, parseAdapterToml } from "../src/adapters/load.js";
import { importTool } from "../src/core/import.js";
import { ensureVaultLayout, agentDir } from "../src/core/vault.js";
import { readState } from "../src/core/state.js";

const temps: string[] = [];
function tmp(prefix = "acv-imp-"): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("importTool", () => {
  it("copies enabled categories into vault agent dir", () => {
    const vault = tmp();
    const home = tmp("acv-home-");
    ensureVaultLayout(vault);
    const toolHome = path.join(home, ".demo");
    fs.mkdirSync(path.join(toolHome, "skills"), { recursive: true });
    fs.writeFileSync(path.join(toolHome, "AGENTS.md"), "# hi\n");
    fs.writeFileSync(path.join(toolHome, "skills", "a.md"), "skill\n");

    const raw = parseAdapterToml(`
id = "demo"
displayName = "Demo"
home = "~/.demo"
[categories.agents_md]
enabled = true
source = "AGENTS.md"
target = "AGENTS.md"
[categories.skills]
enabled = true
source = "skills"
target = "skills"
`);
    const adapter = resolveAdapter(raw, {
      homeOverride: home,
      vaultAgentDir: agentDir(vault, "demo"),
    });
    const r = importTool({ vaultRoot: vault, adapter, mode: "overwrite" });
    expect(r.ok).toBe(true);
    expect(r.imported.map((i) => i.category).sort()).toEqual([
      "agents_md",
      "skills",
    ]);
    expect(
      fs.readFileSync(path.join(agentDir(vault, "demo"), "AGENTS.md"), "utf8"),
    ).toBe("# hi\n");
    expect(
      fs.readFileSync(
        path.join(agentDir(vault, "demo"), "skills", "a.md"),
        "utf8",
      ),
    ).toBe("skill\n");
    expect(readState(vault).tools.demo.lastImportAt).toBeTruthy();
  });

  it("skip mode leaves existing vault source", () => {
    const vault = tmp();
    const home = tmp("acv-home-");
    ensureVaultLayout(vault);
    const toolHome = path.join(home, ".demo");
    fs.mkdirSync(toolHome, { recursive: true });
    fs.writeFileSync(path.join(toolHome, "AGENTS.md"), "new\n");
    const agent = agentDir(vault, "demo");
    fs.mkdirSync(agent, { recursive: true });
    fs.writeFileSync(path.join(agent, "AGENTS.md"), "old\n");

    const raw = parseAdapterToml(`
id = "demo"
displayName = "Demo"
home = "~/.demo"
[categories.agents_md]
enabled = true
source = "AGENTS.md"
target = "AGENTS.md"
`);
    const adapter = resolveAdapter(raw, {
      homeOverride: home,
      vaultAgentDir: agent,
    });
    const r = importTool({ vaultRoot: vault, adapter, mode: "skip" });
    expect(r.skipped.some((s) => s.category === "agents_md")).toBe(true);
    expect(fs.readFileSync(path.join(agent, "AGENTS.md"), "utf8")).toBe("old\n");
  });

  it("follows symlinks when copying", () => {
    const vault = tmp();
    const home = tmp("acv-home-");
    const real = tmp("acv-real-");
    ensureVaultLayout(vault);
    fs.writeFileSync(path.join(real, "AGENTS.md"), "via-link\n");
    const toolHome = path.join(home, ".demo");
    fs.mkdirSync(toolHome, { recursive: true });
    fs.symlinkSync(path.join(real, "AGENTS.md"), path.join(toolHome, "AGENTS.md"));

    const raw = parseAdapterToml(`
id = "demo"
displayName = "Demo"
home = "~/.demo"
[categories.agents_md]
enabled = true
source = "AGENTS.md"
target = "AGENTS.md"
`);
    const adapter = resolveAdapter(raw, {
      homeOverride: home,
      vaultAgentDir: agentDir(vault, "demo"),
    });
    importTool({ vaultRoot: vault, adapter, mode: "overwrite" });
    const dest = path.join(agentDir(vault, "demo"), "AGENTS.md");
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(dest, "utf8")).toBe("via-link\n");
  });
});
