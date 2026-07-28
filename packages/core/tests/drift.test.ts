import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseAdapterToml, resolveAdapter } from "../src/adapters/load.js";
import { applyPlan } from "../src/core/apply.js";
import { statusTool } from "../src/core/drift.js";
import { ensureVaultLayout, agentDir } from "../src/core/vault.js";

const temps: string[] = [];
function tmp(prefix = "acv-dr-"): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function make(home: string, vault: string) {
  const agent = agentDir(vault, "demo");
  fs.mkdirSync(agent, { recursive: true });
  fs.writeFileSync(path.join(agent, "AGENTS.md"), "v\n");
  fs.mkdirSync(path.join(agent, "skills"), { recursive: true });
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
  return resolveAdapter(raw, { homeOverride: home, vaultAgentDir: agent });
}

describe("statusTool / drift", () => {
  it("unlinked when no targets", () => {
    const vault = tmp();
    const home = tmp("acv-home-");
    ensureVaultLayout(vault);
    const adapter = make(home, vault);
    const s = statusTool(adapter);
    expect(s.overall).toBe("unlinked");
  });

  it("linked after apply", () => {
    const vault = tmp();
    const home = tmp("acv-home-");
    ensureVaultLayout(vault);
    const adapter = make(home, vault);
    applyPlan({
      vaultRoot: vault,
      adapter,
      confirm: true,
      backupTs: "t",
    });
    expect(statusTool(adapter).overall).toBe("linked");
  });

  it("drift when wrong symlink", () => {
    const vault = tmp();
    const home = tmp("acv-home-");
    ensureVaultLayout(vault);
    const adapter = make(home, vault);
    applyPlan({
      vaultRoot: vault,
      adapter,
      confirm: true,
      backupTs: "t",
    });
    const t = adapter.categories.agents_md!.targetPath;
    fs.unlinkSync(t);
    fs.symlinkSync("/elsewhere", t);
    const s = statusTool(adapter);
    expect(s.overall).toBe("drift");
    expect(
      s.categories.find((c) => c.category === "agents_md")?.status,
    ).toBe("drift");
  });

  it("partial when only one category linked", () => {
    const vault = tmp();
    const home = tmp("acv-home-");
    ensureVaultLayout(vault);
    const adapter = make(home, vault);
    const agentsOnly = {
      ...adapter,
      categories: { agents_md: adapter.categories.agents_md! },
    };
    applyPlan({
      vaultRoot: vault,
      adapter: agentsOnly,
      confirm: true,
      backupTs: "t",
    });
    // full adapter still has skills unlinked
    const s = statusTool(adapter);
    expect(s.overall).toBe("partial");
  });
});
